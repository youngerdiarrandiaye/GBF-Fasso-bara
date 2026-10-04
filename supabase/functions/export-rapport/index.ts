// supabase/functions/export-rapport/index.ts
//
// Export de rapports "ventes" ou "stock" au format PDF ou Excel, déposé dans
// le bucket privé "rapports" et retourné en URL signée.
//
// Aucune règle métier n'est recalculée : les montants affichés (total_ht,
// total_general...) sont ceux déjà stockés/calculés par les triggers SQL de
// 0001_schema_initial.sql. Cette fonction ne fait qu'agréger et mettre en
// forme des lectures.
//
// Autorisation : le rôle et l'identité de l'appelant sont d'abord établis via
// un client "utilisateur" (JWT forwardé, donc soumis à RLS pour la lecture du
// propre profil). Les requêtes de données volumineuses utilisent ensuite
// service_role pour l'efficacité (jointures, filtrage admin large), mais en
// appliquant STRICTEMENT le même périmètre que RLS aurait imposé :
//   - agent : uniquement ses propres ventes (agent_id = son id), produits
//     actifs uniquement pour le stock (comme la policy produits_lecture_agent).
//   - admin : accès complet, filtrage agent_id optionnel.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "npm:pdf-lib@1.17.1";
import * as XLSX from "npm:xlsx@0.18.5";
import { z } from "npm:zod@3.23.8";
import {
  createServiceClient,
  createUserClient,
  getAuthHeader,
  resolveCallerId,
  toPublicUrl,
} from "../_shared/clients.ts";
import { avecCors, handleCorsPreflight, jsonResponse } from "../_shared/cors.ts";
import { formatDateFr, formatFcfa, sanitizeForPdf } from "../_shared/pdf.ts";

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const periodeSchema = z.object({
  date_debut: z.string().regex(DATE_REGEX, "date_debut doit être au format AAAA-MM-JJ"),
  date_fin: z.string().regex(DATE_REGEX, "date_fin doit être au format AAAA-MM-JJ"),
});

const bodySchema = z
  .object({
    type: z.enum(["ventes", "stock"]),
    format: z.enum(["pdf", "excel"]).default("pdf"),
    periode: periodeSchema.optional(),
    agent_id: z.string().uuid().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === "ventes" && !data.periode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "periode.date_debut / periode.date_fin sont requis pour type='ventes'.",
        path: ["periode"],
      });
    }
    if (data.periode && data.periode.date_debut > data.periode.date_fin) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "periode.date_debut doit être antérieure ou égale à periode.date_fin.",
        path: ["periode"],
      });
    }
  });

const SIGNED_URL_TTL_SECONDS = parseInt(
  Deno.env.get("EXPORT_RAPPORT_SIGNED_URL_TTL_SECONDS") ?? "3600",
  10,
);

const BUCKET = "rapports";

Deno.serve(avecCors(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Méthode non autorisée, utilisez POST." }, 405);
  }

  try {
    const authHeader = getAuthHeader(req);
    if (!authHeader) {
      return jsonResponse({ error: "Authentification requise (header Authorization manquant)." }, 401);
    }

    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return jsonResponse({ error: "Corps de requête JSON invalide." }, 400);
    }

    const parsed = bodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return jsonResponse({ error: "Entrée invalide.", details: parsed.error.flatten() }, 400);
    }
    const input = parsed.data;

    // --- Identité + rôle de l'appelant, via RLS (self-select) ---------------
    const userClient = createUserClient(authHeader);
    const callerId = await resolveCallerId(userClient);
    if (!callerId) {
      return jsonResponse({ error: "Authentification invalide." }, 401);
    }
    const { data: profil, error: profilError } = await userClient
      .from("utilisateurs")
      .select("id, role, actif")
      .eq("id", callerId)
      .maybeSingle();

    if (profilError) {
      console.error("export-rapport: erreur lecture profil appelant", profilError);
      return jsonResponse({ error: "Erreur lors de la vérification du compte appelant." }, 500);
    }
    if (!profil || !profil.actif) {
      return jsonResponse({ error: "Compte introuvable ou désactivé." }, 403);
    }

    let effectiveAgentId: string | null = null;
    if (profil.role === "agent") {
      if (input.agent_id && input.agent_id !== profil.id) {
        return jsonResponse({ error: "Un agent ne peut exporter que ses propres données." }, 403);
      }
      effectiveAgentId = profil.id;
    } else if (profil.role === "admin") {
      effectiveAgentId = input.agent_id ?? null;
    } else {
      return jsonResponse({ error: "Rôle utilisateur non reconnu." }, 403);
    }

    const serviceClient = createServiceClient();

    const rapport =
      input.type === "ventes"
        ? await chargerRapportVentes(serviceClient, input.periode!, effectiveAgentId)
        : await chargerRapportStock(serviceClient, profil.role, effectiveAgentId);

    const fileBytes =
      input.format === "excel" ? construireExcel(input.type, rapport) : await construirePdf(input.type, rapport);

    const extension = input.format === "excel" ? "xlsx" : "pdf";
    const scope = profil.role === "admin" ? effectiveAgentId ?? "tous_agents" : profil.id;
    const nomFichier =
      input.type === "ventes"
        ? `ventes_${input.periode!.date_debut}_${input.periode!.date_fin}.${extension}`
        : `stock_${new Date().toISOString().slice(0, 10)}.${extension}`;
    const path = `${scope}/${nomFichier}`;

    await assurerBucketRapports(serviceClient);

    const { error: uploadError } = await serviceClient.storage.from(BUCKET).upload(path, fileBytes, {
      contentType:
        input.format === "excel"
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : "application/pdf",
      upsert: true,
    });
    if (uploadError) {
      console.error("export-rapport: erreur upload Storage", uploadError);
      return jsonResponse({ error: "Erreur lors de l'enregistrement du rapport." }, 500);
    }

    const { data: signed, error: signError } = await serviceClient.storage
      .from(BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    if (signError || !signed) {
      console.error("export-rapport: erreur création URL signée", signError);
      return jsonResponse({ error: "Erreur lors de la génération du lien de téléchargement." }, 500);
    }

    return jsonResponse({
      url: toPublicUrl(signed.signedUrl),
      expire_dans_secondes: SIGNED_URL_TTL_SECONDS,
      type: input.type,
      format: input.format,
      nb_lignes: rapport.rows.length,
      genere_le: new Date().toISOString(),
    });
  } catch (err) {
    console.error("export-rapport: erreur inattendue", err);
    return jsonResponse({ error: "Erreur interne lors de la génération du rapport." }, 500);
  }
}));

// =============================================================================
// Chargement des données (lecture seule, pas de recalcul métier)
// =============================================================================

interface Rapport {
  titre: string;
  sousTitre: string;
  colonnes: string[];
  rows: (string | number)[][];
}

async function chargerRapportVentes(
  serviceClient: ReturnType<typeof createServiceClient>,
  periode: { date_debut: string; date_fin: string },
  effectiveAgentId: string | null,
): Promise<Rapport> {
  let query = serviceClient
    .from("factures")
    .select(
      `
      numero, statut, date_facture, total_ht, forfait_transport, total_general,
      client:client_id ( nom ),
      agent:agent_id ( nom )
    `,
    )
    .gte("date_facture", periode.date_debut)
    .lte("date_facture", periode.date_fin)
    .order("date_facture", { ascending: true });

  if (effectiveAgentId) {
    query = query.eq("agent_id", effectiveAgentId);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []).map((f: any) => [
    f.numero,
    formatDateFr(f.date_facture),
    f.client?.nom ?? "-",
    f.agent?.nom ?? "-",
    f.statut,
    formatFcfa(f.total_ht),
    formatFcfa(f.forfait_transport),
    formatFcfa(f.total_general),
  ]);

  return {
    titre: "Rapport des ventes",
    sousTitre: `Période du ${formatDateFr(periode.date_debut)} au ${formatDateFr(periode.date_fin)}${
      effectiveAgentId ? ` — agent filtré` : ""
    }`,
    colonnes: ["N° Facture", "Date", "Client", "Agent", "Statut", "Total HT", "Transport", "Total Général"],
    rows,
  };
}

async function chargerRapportStock(
  serviceClient: ReturnType<typeof createServiceClient>,
  role: string,
  effectiveAgentId: string | null,
): Promise<Rapport> {
  let query = serviceClient
    .from("produits")
    .select(
      `
      code, nom, unite, prix_unitaire, quantite_stock, seuil_alerte, type_ligne_produit, actif,
      categorie:categorie_id ( nom )
    `,
    )
    .order("code", { ascending: true });

  // Reproduit exactement la restriction que RLS imposerait à un agent
  // (policy produits_lecture_agent : is_agent_actif() AND actif = true),
  // puisque service_role bypass RLS ici pour l'efficacité des jointures.
  if (role === "agent") {
    query = query.eq("actif", true);
  }
  void effectiveAgentId; // le stock n'est pas rattaché à un agent : paramètre ignoré, documenté dans le README.

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []).map((p: any) => [
    p.code,
    p.nom,
    p.categorie?.nom ?? "-",
    p.unite,
    formatQuantite(p.quantite_stock),
    formatQuantite(p.seuil_alerte),
    p.type_ligne_produit === "inclus_dans_kit" ? "Inclus dans kit" : "Vendu séparément",
    p.prix_unitaire != null ? formatFcfa(p.prix_unitaire) : "-",
  ]);

  return {
    titre: "Rapport de stock",
    sousTitre: `Photographie du stock au ${formatDateFr(new Date())}`,
    colonnes: ["Code", "Désignation", "Catégorie", "Unité", "Stock", "Seuil", "Type", "Prix unitaire"],
    rows,
  };
}

function formatQuantite(value: number | string): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (!Number.isFinite(n)) return "-";
  return Number.isInteger(n) ? n.toString() : n.toFixed(2);
}

// =============================================================================
// Génération Excel (SheetJS)
// =============================================================================

function construireExcel(type: "ventes" | "stock", rapport: Rapport): Uint8Array {
  const worksheet = XLSX.utils.aoa_to_sheet([rapport.colonnes, ...rapport.rows]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, type === "ventes" ? "Ventes" : "Stock");
  const out = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  return new Uint8Array(out as ArrayBuffer);
}

// =============================================================================
// Génération PDF (pdf-lib) — tableau simple, sans photo produit
// =============================================================================

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 40;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

async function construirePdf(type: "ventes" | "stock", rapport: Rapport): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Largeurs de colonnes (points), une palette par type de rapport ; les deux
  // rapports utilisent 8 colonnes au total, somme = CONTENT_WIDTH (515).
  const widths = type === "ventes" ? [70, 50, 110, 80, 60, 55, 50, 60] : [65, 150, 85, 50, 40, 40, 75, 50];

  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  const drawTitre = () => {
    page.drawText(sanitizeForPdf(rapport.titre), { x: MARGIN, y, size: 14, font: fontBold });
    y -= 16;
    page.drawText(sanitizeForPdf(rapport.sousTitre), {
      x: MARGIN,
      y,
      size: 9,
      font: fontRegular,
      color: rgb(0.35, 0.35, 0.35),
    });
    y -= 20;
  };

  const drawEnTeteTableau = () => {
    const headerHeight = 18;
    page.drawRectangle({ x: MARGIN, y: y - headerHeight, width: CONTENT_WIDTH, height: headerHeight, color: rgb(0.9, 0.9, 0.9) });
    let x = MARGIN + 2;
    rapport.colonnes.forEach((col, i) => {
      page.drawText(sanitizeForPdf(col), { x, y: y - 13, size: 7.5, font: fontBold });
      x += widths[i] ?? 60;
    });
    y -= headerHeight;
  };

  drawTitre();
  drawEnTeteTableau();

  const rowHeight = 15;
  for (const row of rapport.rows) {
    if (y - rowHeight < MARGIN + 30) {
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
      drawEnTeteTableau();
    }
    let x = MARGIN + 2;
    row.forEach((cell, i) => {
      page.drawText(sanitizeForPdf(String(cell)), { x, y: y - 11, size: 7.5, font: fontRegular });
      x += widths[i] ?? 60;
    });
    page.drawLine({
      start: { x: MARGIN, y: y - rowHeight },
      end: { x: MARGIN + CONTENT_WIDTH, y: y - rowHeight },
      thickness: 0.4,
      color: rgb(0.88, 0.88, 0.88),
    });
    y -= rowHeight;
  }

  if (rapport.rows.length === 0) {
    page.drawText("Aucune donnée pour cette période / ce périmètre.", {
      x: MARGIN,
      y: y - 14,
      size: 9,
      font: fontRegular,
      color: rgb(0.4, 0.4, 0.4),
    });
  }

  return pdfDoc.save();
}

// =============================================================================
// Storage
// =============================================================================

async function assurerBucketRapports(serviceClient: ReturnType<typeof createServiceClient>) {
  const { data: buckets, error: listError } = await serviceClient.storage.listBuckets();
  if (listError) {
    console.warn("export-rapport: impossible de lister les buckets, tentative de création directe", listError);
  }
  if (buckets?.some((b: { id: string }) => b.id === BUCKET)) return;

  const { error: createError } = await serviceClient.storage.createBucket(BUCKET, { public: false });
  if (createError && !`${createError.message}`.toLowerCase().includes("already exists")) {
    throw createError;
  }
}

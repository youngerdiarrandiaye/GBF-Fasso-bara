// supabase/functions/generer-facture-pdf/index.ts
//
// Génère le PDF d'une facture GFB (modèle proforma réel, réf. FP20260611001)
// et le dépose dans le bucket privé "factures", puis retourne une URL signée
// à durée limitée.
//
// IMPORTANT : cette fonction ne recalcule AUCUNE règle métier déjà couverte
// par les triggers SQL de 0001_schema_initial.sql (numérotation, totaux,
// prix forcé à 0 pour les lignes "inclus_dans_kit", statut de paiement...).
// Elle se contente de LIRE les valeurs déjà calculées en base et de les
// mettre en forme.
//
// Autorisation : voir README.md — la lecture de la facture passe par un
// client "utilisateur" (JWT forwardé) afin que RLS fasse office de portail
// d'autorisation (agent = ses propres factures uniquement, admin = tout).
// Le service_role n'est utilisé qu'ensuite, une fois l'accès confirmé, pour
// récupérer le détail complet et écrire dans le bucket privé.
//
// Mise en page : voir docs/facture-pdf-design.md (agent `designer-ui-ux`,
// refonte complète du gabarit). Point clé du correctif appliqué ici (§5 de
// ce document) : le cadre "Cachet et signature" et la colonne "Mentions
// légales" partagent un seul et même point d'ancrage vertical (`yFooterTop`),
// calculé UNE FOIS juste après le bloc totaux — jamais dérivé de `ctx.y`
// après qu'il ait déjà servi à un autre bloc. C'est ce qui élimine la classe
// de bug du chevauchement signature/totaux (l'ancien code réutilisait `ctx.y`
// après le dessin des mentions, dont la position dépend de la longueur
// variable du texte).

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "npm:pdf-lib@1.17.1";
import { z } from "npm:zod@3.23.8";
import {
  createServiceClient,
  createUserClient,
  getAuthHeader,
  toPublicUrl,
} from "../_shared/clients.ts";
import { handleCorsPreflight, jsonResponse } from "../_shared/cors.ts";
import {
  fetchImageBytes,
  formatDateFr,
  formatFcfa,
  sanitizeForPdf,
  wrapText,
} from "../_shared/pdf.ts";

const bodySchema = z.object({
  facture_id: z.string().uuid({ message: "facture_id doit être un UUID valide" }),
});

const SIGNED_URL_TTL_SECONDS = parseInt(
  Deno.env.get("FACTURE_PDF_SIGNED_URL_TTL_SECONDS") ?? "3600",
  10,
);

const UNITE_LABELS: Record<string, string> = {
  piece: "pièce(s)",
  kit: "kit(s)",
  metre: "mètre(s)",
  rouleau: "rouleau(x)",
  forfait: "forfait",
};

const TYPE_CLIENT_LABELS: Record<string, string> = {
  particulier: "PARTICULIER",
  entreprise: "ENTREPRISE",
  cooperative: "COOPÉRATIVE",
};

// --- Mise en page -----------------------------------------------------------
const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89;
const MARGIN = 40;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
// v2 §3.3 : budget élargi pour l'eyebrow "COORDONNÉES & MENTIONS LÉGALES"
// ajouté au-dessus du filet de la bande légale bas de page (60 -> 72).
const FOOTER_RESERVED_HEIGHT = 72; // bande légale bas de page
// v2 §2.2 : carte bordée dessinée à l'intérieur de MARGIN, sur chaque page.
const CARD_INSET = 18;
// v2 §3.2 : coût fixe du filet ajouté sous l'eyebrow "MODALITÉS DE RÈGLEMENT"
// (à intégrer dans le précalcul hauteurMentions, cf. §5 v1 non-régression).
const FILET_MODALITES_HEIGHT = 4;
// `pdf-lib` doit décoder chaque image avant de l'intégrer. Une photo brute de
// plusieurs centaines de Ko peut à elle seule dépasser la limite CPU d'une
// Edge Function. Les uploads sont normalement redimensionnés côté client ;
// cette garde protège aussi les anciennes photos non optimisées.
const MAX_PRODUCT_PHOTO_BYTES = 400 * 1024;

// Colonnes du tableau des lignes (largeurs en points, somme = CONTENT_WIDTH)
// quand la colonne Photo est affichée. Voir computeColumns() pour le cas où
// aucune ligne de la facture n'a de photo (colonne masquée, §4.3 D-02).
const COL = {
  photo: 36,
  reference: 58,
  designation: 196,
  qte: 32,
  unite: 46,
  prixUnitaire: 73,
  total: 74,
};

function computeColumns(hasPhoto: boolean): typeof COL {
  if (hasPhoto) return { ...COL };
  // La largeur de la colonne Photo est intégralement réaffectée à la
  // Désignation (celle qui en a le plus l'usage) — décision tranchée une
  // seule fois avant de dessiner le tableau, jamais ligne par ligne.
  return { ...COL, photo: 0, designation: COL.designation + COL.photo };
}

// --- Palette PDF (sous-ensemble imprimable de docs/design-system.md, §6) ----
const COLOR_GREEN_DK = rgb(0.086, 0.502, 0.235); // #15803D
const COLOR_TEXT_PRIMARY = rgb(0.13, 0.13, 0.13); // #212121
const COLOR_TEXT_SECONDARY = rgb(0.35, 0.35, 0.35); // #595959
const COLOR_BORDER_LIGHT = rgb(0.85, 0.85, 0.85); // #D9D9D9
const COLOR_BORDER_CLIENT_AGENT = rgb(0.75, 0.75, 0.75); // #BFBFBF
const COLOR_BORDER_SIGNATURE = rgb(0.6, 0.6, 0.6); // #999999
const COLOR_TAG_BG = rgb(0.93, 0.93, 0.93); // #EDEDED
const COLOR_PLACEHOLDER_BG = rgb(0.95, 0.95, 0.95); // #F2F2F2
const COLOR_PLACEHOLDER_LINE = rgb(0.79, 0.79, 0.79); // #C9C9C9
const COLOR_TOTAL_PASTEL_BG = rgb(0.9, 0.96, 0.92); // vert 15%
const COLOR_TABLE_HEADER_BG = rgb(0.92, 0.92, 0.92); // inchangé
const COLOR_FOOTER_LINE = rgb(0.7, 0.82, 0.75); // gris/vert clair
const COLOR_FOOTER_TEXT = rgb(0.302, 0.302, 0.302); // #4D4D4D

// --- Badge de statut de facture (v2 §1.2, aligné sur design-system.md §4.2) -
// Seules ces 4 paires sont réellement nouvelles : brouillon/payee réutilisent
// des constantes déjà déclarées ci-dessus (COLOR_TEXT_SECONDARY/COLOR_TAG_BG,
// COLOR_GREEN_DK/COLOR_TOTAL_PASTEL_BG).
const COLOR_STATUT_PROFORMA_TXT = rgb(0.706, 0.325, 0.035); // #B45309
const COLOR_STATUT_PROFORMA_BG = rgb(0.99, 0.94, 0.86);
const COLOR_STATUT_VALIDEE_TXT = rgb(0.114, 0.306, 0.847); // #1D4ED8
const COLOR_STATUT_VALIDEE_BG = rgb(0.87, 0.91, 0.99);
const COLOR_STATUT_PAYEE_PARTIELLE_TXT = rgb(0.427, 0.157, 0.851); // #6D28D9
const COLOR_STATUT_PAYEE_PARTIELLE_BG = rgb(0.92, 0.88, 0.99);
const COLOR_STATUT_ANNULEE_TXT = rgb(0.725, 0.11, 0.11); // #B91C1C
const COLOR_STATUT_ANNULEE_BG = rgb(0.99, 0.89, 0.89);

interface StatusBadgeStyle {
  label: string;
  color: ReturnType<typeof rgb>;
  bg: ReturnType<typeof rgb>;
}

// Mapping statut -> badge (v2 §1.2). "brouillon" est traité de façon
// défensive (mapping prévu, normalement jamais atteint : bloqué en 409 plus
// haut) ; les 5 autres sont les seuls statuts qui atteignent réellement ce
// gabarit.
const STATUS_BADGE: Record<string, StatusBadgeStyle> = {
  brouillon: { label: "BROUILLON", color: COLOR_TEXT_SECONDARY, bg: COLOR_TAG_BG },
  proforma: { label: "PROFORMA", color: COLOR_STATUT_PROFORMA_TXT, bg: COLOR_STATUT_PROFORMA_BG },
  validee: { label: "VALIDÉE", color: COLOR_STATUT_VALIDEE_TXT, bg: COLOR_STATUT_VALIDEE_BG },
  payee_partielle: {
    label: "PAYÉE PARTIELLE",
    color: COLOR_STATUT_PAYEE_PARTIELLE_TXT,
    bg: COLOR_STATUT_PAYEE_PARTIELLE_BG,
  },
  payee: { label: "PAYÉE", color: COLOR_GREEN_DK, bg: COLOR_TOTAL_PASTEL_BG },
  annulee: { label: "ANNULÉE", color: COLOR_STATUT_ANNULEE_TXT, bg: COLOR_STATUT_ANNULEE_BG },
};

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  courier: PDFFont;
  courierBold: PDFFont;
}

Deno.serve(async (req: Request) => {
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
      return jsonResponse(
        { error: "Entrée invalide.", details: parsed.error.flatten() },
        400,
      );
    }
    const { facture_id } = parsed.data;

    // --- Portail d'autorisation : RLS via le JWT de l'appelant ------------
    // On ne demande QUE les colonnes strictement nécessaires pour vérifier
    // l'accès. Si RLS refuse (agent qui n'est pas propriétaire, utilisateur
    // désactivé...), .maybeSingle() renvoie simplement `null`, pas d'erreur
    // distincte -> on ne révèle jamais si la facture existe pour un tiers.
    const userClient = createUserClient(authHeader);
    const { data: factureAcces, error: accesError } = await userClient
      .from("factures")
      .select("id, numero, statut, agent_id")
      .eq("id", facture_id)
      .maybeSingle();

    if (accesError) {
      console.error("generer-facture-pdf: erreur vérification d'accès", accesError);
      return jsonResponse({ error: "Erreur lors de la vérification d'accès à la facture." }, 500);
    }
    if (!factureAcces) {
      return jsonResponse({ error: "Facture introuvable ou accès refusé." }, 404);
    }
    if (factureAcces.statut === "brouillon") {
      return jsonResponse(
        {
          error:
            "Cette facture est encore au statut 'brouillon' : passez-la au moins en 'proforma' avant de générer le PDF.",
        },
        409,
      );
    }

    // --- Récupération du détail complet via service_role -------------------
    // L'accès est déjà confirmé ci-dessus : on utilise service_role pour
    // éviter les faux négatifs RLS sur des données de présentation annexes
    // (ex: produit désactivé après coup, catégorie supprimée...).
    const serviceClient = createServiceClient();

    const { data: facture, error: factureError } = await serviceClient
      .from("factures")
      .select(
        `
        id, numero, statut, date_facture, notes,
        total_ht, forfait_transport, tva_taux, total_general,
        agent_id,
        client:client_id ( nom, type_client, adresse, telephone, email, ninea ),
        agent:agent_id ( nom ),
        entrepot:entrepot_id ( nom ),
        lignes:lignes_facture (
          id, quantite, prix_unitaire, total_ligne, created_at,
          produit:produit_id ( code, nom, unite, type_ligne_produit, photos_urls )
        )
      `,
      )
      .eq("id", facture_id)
      .single();

    if (factureError || !facture) {
      console.error("generer-facture-pdf: erreur récupération détail facture", factureError);
      return jsonResponse({ error: "Impossible de charger le détail de la facture." }, 500);
    }

    const { data: entreprise, error: entrepriseError } = await serviceClient
      .from("entreprise_config")
      .select("*")
      .eq("id", true)
      .single();

    if (entrepriseError || !entreprise) {
      console.error("generer-facture-pdf: entreprise_config introuvable", entrepriseError);
      return jsonResponse(
        { error: "Configuration entreprise introuvable : contactez un administrateur." },
        500,
      );
    }

    const lignes = [...(facture.lignes ?? [])].sort(
      (a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );

    // Paiements déjà enregistrés — nécessaires pour afficher "Déjà payé" /
    // "Reste à payer" sur le PDF (au même titre que l'écran de détail facture,
    // app/(admin)/admin/factures/[id]/page.tsx, jusqu'ici seul endroit à les
    // montrer). Statut 'payee_partielle' en particulier : sans ces deux
    // lignes, le PDF téléchargé pour une facture partiellement payée ne
    // montre que le total général, sans indiquer ce qu'il reste réellement à
    // encaisser — information sensible pour l'agent/le client sur le terrain.
    const { data: paiements, error: paiementsError } = await serviceClient
      .from("paiements")
      .select("montant")
      .eq("facture_id", facture_id);

    if (paiementsError) {
      console.error("generer-facture-pdf: erreur récupération paiements", paiementsError);
      return jsonResponse({ error: "Impossible de charger les paiements de la facture." }, 500);
    }

    const totalPaye = (paiements ?? []).reduce((sum: number, p: { montant: number }) => sum + p.montant, 0);
    const resteAPayer = Math.max(0, parseFloat(facture.total_general) - totalPaye);

    // --- Génération du PDF ---------------------------------------------------
    const pdfBytes = await buildFacturePdf({ facture, entreprise, lignes, totalPaye, resteAPayer });

    // --- Upload idempotent dans le bucket privé "factures" -------------------
    // Convention de chemin imposée par la migration (policy RLS agent) :
    // {agent_id}/{numero_facture}.pdf. `upsert: true` garantit qu'une
    // régénération réécrit le même fichier au lieu d'en créer un orphelin.
    const path = `${facture.agent_id}/${facture.numero}.pdf`;
    const { error: uploadError } = await serviceClient.storage
      .from("factures")
      .upload(path, pdfBytes, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      console.error("generer-facture-pdf: erreur upload Storage", uploadError);
      return jsonResponse({ error: "Erreur lors de l'enregistrement du PDF." }, 500);
    }

    const { data: signed, error: signError } = await serviceClient.storage
      .from("factures")
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

    if (signError || !signed) {
      console.error("generer-facture-pdf: erreur création URL signée", signError);
      return jsonResponse({ error: "Erreur lors de la génération du lien de téléchargement." }, 500);
    }

    return jsonResponse({
      pdf_url: toPublicUrl(signed.signedUrl),
      expire_dans_secondes: SIGNED_URL_TTL_SECONDS,
      numero_facture: facture.numero,
    });
  } catch (err) {
    console.error("generer-facture-pdf: erreur inattendue", err);
    return jsonResponse({ error: "Erreur interne lors de la génération du PDF." }, 500);
  }
});

// =============================================================================
// Construction du document PDF (pdf-lib)
// =============================================================================

async function buildFacturePdf(params: {
  facture: any;
  entreprise: any;
  lignes: any[];
  totalPaye: number;
  resteAPayer: number;
}): Promise<Uint8Array> {
  const { facture, entreprise, lignes, totalPaye, resteAPayer } = params;

  const pdfDoc = await PDFDocument.create();
  const fonts: Fonts = {
    regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
    bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
    italic: await pdfDoc.embedFont(StandardFonts.HelveticaOblique),
    // Montants toujours en monospace (§3, §1.2 D-04) : polices standard PDF,
    // aucun coût de rendu supplémentaire, alignement des chiffres impeccable.
    courier: await pdfDoc.embedFont(StandardFonts.Courier),
    courierBold: await pdfDoc.embedFont(StandardFonts.CourierBold),
  };

  const logo = await fetchImageBytes(entreprise.logo_url);
  const embeddedLogo = logo
    ? logo.kind === "png"
      ? await pdfDoc.embedPng(logo.bytes)
      : await pdfDoc.embedJpg(logo.bytes)
    : null;

  // Tampon/signature officiel (entreprise_config.tampon_url, migration 0007).
  // Même mécanisme tolérant à l'échec que le logo : si l'URL est absente ou
  // le téléchargement échoue, `embeddedTampon` reste `null` et
  // `drawSignatureBox` retombe sur le cadre vide (placeholder inchangé).
  const tampon = await fetchImageBytes(entreprise.tampon_url);
  const embeddedTampon = tampon
    ? tampon.kind === "png"
      ? await pdfDoc.embedPng(tampon.bytes)
      : await pdfDoc.embedJpg(tampon.bytes)
    : null;

  // Pré-télécharge les photos produit (une requête par produit distinct,
  // pas par ligne, pour éviter les téléchargements redondants).
  const photoCache = new Map<string, any>();
  for (const ligne of lignes) {
    const url = ligne.produit?.photos_urls?.[0];
    if (url && !photoCache.has(url)) {
      const img = await fetchImageBytes(url);
      if (img && img.bytes.byteLength <= MAX_PRODUCT_PHOTO_BYTES) {
        const embedded = img.kind === "png" ? await pdfDoc.embedPng(img.bytes) : await pdfDoc.embedJpg(img.bytes);
        photoCache.set(url, embedded);
      } else {
        photoCache.set(url, null);
      }
    }
  }

  // Zone 3 (§4.3, D-02) : décision unique, prise AVANT de dessiner l'en-tête
  // du tableau, jamais réévaluée ligne par ligne.
  const hasPhoto = lignes.some((l) => Boolean(photoCache.get(l.produit?.photos_urls?.[0])));
  const cols = computeColumns(hasPhoto);

  const ctx = { page: pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]), y: 0 };
  // v2 §2 : carte bordée, dessinée en premier pour servir de fond visuel dès
  // le départ — purement décorative, indépendante du fil ctx.y.
  drawCardFrame(ctx.page);
  drawHeader(ctx.page, { entreprise, facture, embeddedLogo, fonts });
  ctx.y = drawClientAgentBoxes(ctx.page, { facture, fonts });

  // v2 §3.1 : nouvelle section "ARTICLES" (eyebrow gris/vert + filet), même
  // motif que CLIENT/AGENT/MODALITÉS DE RÈGLEMENT, au-dessus du tableau.
  ctx.page.drawText("ARTICLES", { x: MARGIN, y: ctx.y - 7.5, size: 7.5, font: fonts.bold, color: COLOR_GREEN_DK });
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y - 12 },
    end: { x: MARGIN + CONTENT_WIDTH, y: ctx.y - 12 },
    thickness: 0.5,
    color: COLOR_BORDER_LIGHT,
  });
  ctx.y -= 20; // eyebrow + filet + ~10pt d'espace avant l'en-tête du tableau

  ctx.y = drawTableHeader(ctx.page, ctx.y, fonts.bold, cols, hasPhoto);

  const ensureSpace = (needed: number, opts: { redrawTableHeader?: boolean } = {}) => {
    const redraw = opts.redrawTableHeader ?? true;
    if (ctx.y - needed < FOOTER_RESERVED_HEIGHT + MARGIN) {
      drawLegalFooterBar(ctx.page, entreprise, fonts);
      ctx.page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      // v2 §2 : chaque page paginée a sa propre carte bordée, pas seulement
      // la première (§7 cas de test 3 de v2).
      drawCardFrame(ctx.page);
      ctx.y = PAGE_HEIGHT - MARGIN;
      ctx.page.drawText(sanitizeForPdf(`Facture ${facture.numero} (suite)`), {
        x: MARGIN,
        y: ctx.y,
        size: 10,
        font: fonts.italic,
        color: COLOR_TEXT_SECONDARY,
      });
      ctx.y -= 20;
      // Le bloc totaux/mentions/signature n'est jamais un prolongement du
      // tableau : pas d'en-tête de colonnes à redessiner dans ce cas (§7,
      // cas de test 3 — le bloc entier bascule sur une page neuve, propre).
      if (redraw) {
        ctx.y = drawTableHeader(ctx.page, ctx.y, fonts.bold, cols, hasPhoto);
      }
    }
  };

  for (const ligne of lignes) {
    const produit = ligne.produit ?? {};
    const estInclusDansKit = produit.type_ligne_produit === "inclus_dans_kit";
    const designation = sanitizeForPdf(produit.nom ?? "Produit supprimé");
    const designationLines = wrapText(designation, fonts.regular, 8, cols.designation - 6);
    const rowHeight = Math.max(36, designationLines.length * 10 + 10);

    ensureSpace(rowHeight);

    const rowTop = ctx.y;
    let x = MARGIN;

    // Photo produit (colonne entièrement absente si `hasPhoto` est faux).
    if (hasPhoto) {
      const photoUrl = produit.photos_urls?.[0];
      const embeddedPhoto = photoUrl ? photoCache.get(photoUrl) : null;
      if (embeddedPhoto) {
        const boxSize = 30;
        const scale = Math.min(boxSize / embeddedPhoto.width, boxSize / embeddedPhoto.height);
        const w = embeddedPhoto.width * scale;
        const h = embeddedPhoto.height * scale;
        ctx.page.drawImage(embeddedPhoto, {
          x: x + (cols.photo - w) / 2,
          y: rowTop - rowHeight + (rowHeight - h) / 2,
          width: w,
          height: h,
        });
      } else {
        // Placeholder discret (§4.3, D-03) : uniquement sur les lignes sans
        // photo, dans une facture où au moins une autre ligne en a une.
        drawPhotoPlaceholder(ctx.page, x, rowTop, rowHeight, cols.photo);
      }
      x += cols.photo;
    }

    ctx.page.drawText(sanitizeForPdf(produit.code ?? "-"), {
      x,
      y: rowTop - 12,
      size: 7,
      font: fonts.regular,
      color: COLOR_TEXT_PRIMARY,
    });
    x += cols.reference;

    let dy = rowTop - 12;
    for (const line of designationLines) {
      ctx.page.drawText(line, { x, y: dy, size: 8, font: fonts.regular, color: COLOR_TEXT_PRIMARY });
      dy -= 10;
    }
    if (estInclusDansKit) {
      // v2 §4.2 : encadré à liséré gauche (motif "alertes inline" du design
      // system, §6.11), pas une pilule (réservée aux badges de statut de
      // facture, §3.3 design system) — remplace le texte italique nu.
      drawInclusKitBadge(ctx.page, x, dy, fonts);
    }
    x += cols.designation;

    ctx.page.drawText(formatQuantite(ligne.quantite), {
      x,
      y: rowTop - 12,
      size: 8,
      font: fonts.regular,
      color: COLOR_TEXT_PRIMARY,
    });
    x += cols.qte;

    ctx.page.drawText(UNITE_LABELS[produit.unite] ?? produit.unite ?? "-", {
      x,
      y: rowTop - 12,
      size: 7,
      font: fonts.regular,
      color: COLOR_TEXT_PRIMARY,
    });
    x += cols.unite;

    // Montants du tableau en Courier (§3 : "Montants (tous, y compris
    // tableau)" — cohérence avec la règle monospace du design system).
    ctx.page.drawText(formatFcfa(ligne.prix_unitaire), {
      x,
      y: rowTop - 12,
      size: 8,
      font: fonts.courier,
      color: COLOR_TEXT_PRIMARY,
    });
    x += cols.prixUnitaire;

    ctx.page.drawText(formatFcfa(ligne.total_ligne), {
      x,
      y: rowTop - 12,
      size: 8,
      font: fonts.courierBold,
      color: COLOR_TEXT_PRIMARY,
    });

    ctx.page.drawLine({
      start: { x: MARGIN, y: rowTop - rowHeight },
      end: { x: MARGIN + CONTENT_WIDTH, y: rowTop - rowHeight },
      thickness: 0.5,
      color: COLOR_BORDER_LIGHT,
    });

    ctx.y = rowTop - rowHeight;
  }

  // ===========================================================================
  // §5 — Algorithme de positionnement dynamique du bloc bas de page
  // (totaux + mentions légales + signature).
  //
  // Règle d'or : chaque bloc a son point d'ancrage propre, dérivé UNE SEULE
  // FOIS du bloc précédent. Aucune position n'est jamais recalculée à partir
  // d'une variable de travail déjà modifiée par un autre bloc (c'était la
  // cause exacte du bug signalé — voir §1.1 de docs/facture-pdf-design.md).
  // ===========================================================================

  const tvaTaux = parseFloat(facture.tva_taux ?? "0");
  const mentionsWidth = 300;

  // --- 1. Précalcul de la hauteur du bloc totaux (dépend de tvaTaux + de la
  //        présence d'un paiement partiel) -----------------------------------
  // "Déjà payé"/"Reste à payer" : mêmes deux lignes, dans les mêmes conditions
  // (totalPaye > 0), que l'écran de détail facture
  // (app/(admin)/admin/factures/[id]/page.tsx) — sans elles, le PDF d'une
  // facture 'payee_partielle' ne montre que le total général, sans indiquer
  // ce qu'il reste réellement à encaisser.
  const afficherPaiement = totalPaye > 0;
  const nbLignesTotaux = 2 + (tvaTaux > 0 ? 1 : 0) + (afficherPaiement ? 2 : 0); // Total HT, Forfait transport, [TVA], [Déjà payé, Reste à payer]
  const hauteurTotaux = nbLignesTotaux * 16 + 10 + 22 + 16;

  // --- 2. Précalcul de la hauteur du bloc mentions (dépend du texte réel) ----
  // `wrapText` ne dessine rien (voir _shared/pdf.ts) : c'est l'outil clé pour
  // réserver l'espace correct AVANT de dessiner quoi que ce soit.
  let lignesMentions = 1; // eyebrow "Modalités de règlement"
  lignesMentions += wrapText(sanitizeForPdf(entreprise.modalites_reglement), fonts.regular, 8, mentionsWidth)
    .length;
  if (entreprise.delai_disponibilite) {
    lignesMentions += wrapText(
      `Délai de disponibilité : ${sanitizeForPdf(entreprise.delai_disponibilite)}`,
      fonts.regular,
      8,
      mentionsWidth,
    ).length;
  }
  const validiteTexte = `Validité de la proforma : ${entreprise.validite_proforma_jours} jours à compter du ${formatDateFr(facture.date_facture)}.`;
  lignesMentions += wrapText(validiteTexte, fonts.regular, 8, mentionsWidth).length;
  let margeNotes = 0;
  if (facture.notes) {
    margeNotes = 4;
    lignesMentions += 1 + wrapText(sanitizeForPdf(facture.notes), fonts.regular, 8, mentionsWidth).length;
  }
  // v2 §3.2 : filet ajouté sous l'eyebrow "MODALITÉS DE RÈGLEMENT" —
  // +4pt à intégrer ici pour ne pas casser la réservation d'espace (§5 v1).
  const hauteurMentions = lignesMentions * 11 + margeNotes + FILET_MODALITES_HEIGHT;

  // --- 3. Hauteur du bloc signature : TOUJOURS fixe -------------------------
  const hauteurSignature = 100;

  // --- 4. Réservation d'espace ATOMIQUE pour tout le bloc bas de page -------
  const GAP_APRES_TOTAUX = 28;
  const hauteurBlocBasDePage = hauteurTotaux + GAP_APRES_TOTAUX + Math.max(hauteurMentions, hauteurSignature);
  ensureSpace(hauteurBlocBasDePage, { redrawTableHeader: false });

  // --- 5. Dessin du bloc totaux (§4.4 + Déjà payé/Reste à payer) ------------
  ctx.y -= 12; // léger espacement entre le tableau et le cadre des totaux
  ctx.y = drawTotalsBlock(ctx.page, ctx.y, {
    facture,
    tvaTaux,
    hauteurTotaux,
    fonts,
    totalPaye,
    resteAPayer,
    afficherPaiement,
  });

  // --- 6. Point d'ancrage UNIQUE pour mentions + signature (LE FIX) ---------
  const yFooterTop = ctx.y - GAP_APRES_TOTAUX;

  // --- 7a. Colonne mentions : dessinée depuis yFooterTop, variable LOCALE ---
  const yMentions = drawMentionsLegales(ctx.page, yFooterTop, { entreprise, facture, fonts, mentionsWidth });

  // --- 7b. Colonne signature : ancrée à yFooterTop DIRECTEMENT --------------
  // Plus jamais de "ctx.y + 90" dépendant de la longueur du texte des
  // mentions : l'ancrage est fixé avant même que la colonne mentions ne soit
  // dessinée (elle utilise une copie, `yFooterTop`, jamais `ctx.y` lui-même).
  const sigX = MARGIN + CONTENT_WIDTH - 180;
  drawSignatureBox(ctx.page, sigX, yFooterTop, { fonts, embeddedTampon });

  // --- 8. Reprise du fil de page après le MAX des deux hauteurs utilisées ---
  ctx.y = Math.min(yMentions, yFooterTop - hauteurSignature);

  drawLegalFooterBar(ctx.page, entreprise, fonts);

  return pdfDoc.save();
}

function drawHeader(
  page: PDFPage,
  args: { entreprise: any; facture: any; embeddedLogo: any; fonts: Fonts },
) {
  const { entreprise, facture, embeddedLogo, fonts } = args;
  let y = PAGE_HEIGHT - MARGIN;

  if (embeddedLogo) {
    const boxW = 90;
    const boxH = 60;
    const scale = Math.min(boxW / embeddedLogo.width, boxH / embeddedLogo.height);
    const w = embeddedLogo.width * scale;
    const h = embeddedLogo.height * scale;
    page.drawImage(embeddedLogo, { x: MARGIN, y: y - h, width: w, height: h });
  }

  // Nom entreprise : 13pt -> 14pt (§4.1), reste noir (autorité du document).
  page.drawText(sanitizeForPdf(entreprise.nom), {
    x: MARGIN + 100,
    y: y - 12,
    size: 14,
    font: fonts.bold,
    color: COLOR_TEXT_PRIMARY,
  });
  let subY = y - 27;
  if (entreprise.activites?.length) {
    page.drawText(sanitizeForPdf(entreprise.activites.join(" • ")), {
      x: MARGIN + 100,
      y: subY,
      size: 7,
      font: fonts.regular,
      color: COLOR_TEXT_SECONDARY,
    });
    subY -= 11;
  }
  if (entreprise.adresses?.length) {
    page.drawText(sanitizeForPdf(entreprise.adresses.join(" / ")), {
      x: MARGIN + 100,
      y: subY,
      size: 7,
      font: fonts.regular,
      color: COLOR_TEXT_SECONDARY,
    });
    subY -= 10;
  }
  if (entreprise.telephones?.length) {
    page.drawText(`Tél : ${sanitizeForPdf(entreprise.telephones.join(" - "))}`, {
      x: MARGIN + 100,
      y: subY,
      size: 7,
      font: fonts.regular,
      color: COLOR_TEXT_SECONDARY,
    });
    subY -= 10;
  }
  if (entreprise.email) {
    page.drawText(`Email : ${entreprise.email}`, {
      x: MARGIN + 100,
      y: subY,
      size: 7,
      font: fonts.regular,
      color: COLOR_TEXT_SECONDARY,
    });
  }

  // v2 §1.3 : badge de statut, coin supérieur droit, au-dessus du titre —
  // c'est ce que l'œil accroche en premier. Repositionne en cascade tout le
  // bloc titre/n°/date (l'en-tête grandit pour lui faire de la place).
  const badgeWidth = 120;
  const badgeX = MARGIN + CONTENT_WIDTH - badgeWidth;
  drawStatusBadge(page, badgeX, y, facture.statut, fonts);

  // Titre statut : 14pt noir -> 16pt vert (§4.1 v1), baseline y0-14 -> y0-42
  // (v2 §1.3, pour laisser la place au badge). Contenu inchangé (§1.1 v2).
  const titre = titrePourStatut(facture.statut);
  const titreWidth = fonts.bold.widthOfTextAtSize(titre, 16);
  page.drawText(titre, {
    x: MARGIN + CONTENT_WIDTH - titreWidth,
    y: y - 42,
    size: 16,
    font: fonts.bold,
    color: COLOR_GREEN_DK,
  });

  // v2 §1.3 : n° de facture en Courier + tag neutre (mise en conformité avec
  // docs/design-system.md §5.5 : identifiant en monospace, jamais en texte
  // brut). Baseline y0-32 -> y0-58.
  const numeroTexte = `N° ${facture.numero}`;
  const numeroBaseline = y - 58;
  const numeroSize = 9;
  const numeroPadX = 5;
  const numeroWidth = fonts.courier.widthOfTextAtSize(numeroTexte, numeroSize) + numeroPadX * 2;
  const numeroBoxX = MARGIN + CONTENT_WIDTH - numeroWidth;
  page.drawRectangle({
    x: numeroBoxX,
    y: numeroBaseline - 3,
    width: numeroWidth,
    height: 13,
    color: COLOR_TAG_BG,
    borderWidth: 0.5,
    borderColor: COLOR_BORDER_LIGHT,
  });
  page.drawText(numeroTexte, {
    x: numeroBoxX + numeroPadX,
    y: numeroBaseline,
    size: numeroSize,
    font: fonts.courier,
    color: COLOR_TEXT_PRIMARY,
  });

  const dateTexte = `Date : ${formatDateFr(facture.date_facture)}`;
  const dateWidth = fonts.regular.widthOfTextAtSize(dateTexte, 10);
  page.drawText(dateTexte, {
    x: MARGIN + CONTENT_WIDTH - dateWidth,
    y: y - 70,
    size: 10,
    font: fonts.regular,
  });

  // Filet de séparation : noir 1pt -> vert #15803D 1.5pt (§4.1 v1),
  // repositionné de y0-68 à y0-92 (v2 §1.3, cascade du badge).
  page.drawLine({
    start: { x: MARGIN, y: y - 92 },
    end: { x: MARGIN + CONTENT_WIDTH, y: y - 92 },
    thickness: 1.5,
    color: COLOR_GREEN_DK,
  });
}

/**
 * v2 §1.3 — Badge de statut de facture, coin supérieur droit de l'en-tête.
 * Encadré rectangulaire (pas de coins arrondis natifs pdf-lib, §1.2 v1) :
 * fond pastel + bordure fine 0.5pt de la couleur de texte, dans le même
 * esprit que `drawTag`. `yTop` est le haut de la boîte (= y0 de l'en-tête).
 */
function drawStatusBadge(page: PDFPage, x: number, yTop: number, statut: string, fonts: Fonts) {
  const style = STATUS_BADGE[statut] ?? STATUS_BADGE.brouillon;
  const width = 120;
  const height = 26;

  page.drawRectangle({
    x,
    y: yTop - height,
    width,
    height,
    color: style.bg,
    borderWidth: 0.5,
    borderColor: style.color,
  });

  const eyebrow = "STATUT";
  const eyebrowWidth = fonts.bold.widthOfTextAtSize(eyebrow, 6.5);
  page.drawText(eyebrow, {
    x: x + (width - eyebrowWidth) / 2,
    y: yTop - 9,
    size: 6.5,
    font: fonts.bold,
    color: COLOR_TEXT_SECONDARY,
  });

  const valueWidth = fonts.bold.widthOfTextAtSize(style.label, 10);
  page.drawText(style.label, {
    x: x + (width - valueWidth) / 2,
    y: yTop - 21,
    size: 10,
    font: fonts.bold,
    color: style.color,
  });
}

/**
 * v2 §2 — Carte unique bordée, appelée une fois par page (page initiale et
 * chaque page de pagination). Rectangle bordure seule, purement décorative,
 * dessinée indépendamment du fil ctx.y.
 */
function drawCardFrame(page: PDFPage) {
  page.drawRectangle({
    x: CARD_INSET,
    y: CARD_INSET,
    width: PAGE_WIDTH - 2 * CARD_INSET,
    height: PAGE_HEIGHT - 2 * CARD_INSET,
    borderWidth: 0.75,
    borderColor: COLOR_BORDER_CLIENT_AGENT,
  });
}

function titrePourStatut(statut: string): string {
  switch (statut) {
    case "proforma":
      return "FACTURE PROFORMA";
    case "annulee":
      return "FACTURE ANNULEE";
    default:
      return "FACTURE";
  }
}

/**
 * Zone 2 (§4.2) — Boîtes Client / Agent rééquilibrées : deux encadrés de
 * MÊME hauteur, calculée dynamiquement à partir du nombre de lignes réelles
 * de chaque bloc (jamais une hauteur fixe supposant un contenu donné).
 */
function drawClientAgentBoxes(page: PDFPage, args: { facture: any; fonts: Fonts }): number {
  const { facture, fonts } = args;
  const client = facture.client ?? {};
  const agentNom = sanitizeForPdf(facture.agent?.nom ?? "-");
  // Règle métier 16 (0013_avenant_credit_entrepots.sql) : entrepôt source de
  // la facture, affiché dans la boîte AGENT (information opérationnelle liée
  // à la transaction, pas au client) — emplacement choisi pour rester au plus
  // près des informations déjà affichées (numéro, date, client, agent) sans
  // bouleverser la mise en page existante (§4.2).
  const entrepotNom = sanitizeForPdf(facture.entrepot?.nom ?? "-");

  // v2 §1.3 : le filet de l'en-tête est descendu de y0-68 à y0-92 pour faire
  // de la place au badge de statut -> 92 + 12 (écart filet/boîtes déjà en
  // usage v1) = 104.
  const boxTop = PAGE_HEIGHT - MARGIN - 104;
  const padding = 8;
  const gapBetweenBoxes = 16;
  const clientBoxWidth = Math.round(CONTENT_WIDTH * 0.58);
  const agentBoxWidth = CONTENT_WIDTH - clientBoxWidth - gapBetweenBoxes;
  const clientBoxX = MARGIN;
  const agentBoxX = MARGIN + clientBoxWidth + gapBetweenBoxes;
  const innerWidth = clientBoxWidth - padding * 2;

  // --- Contenu Client : décider si le tag type_client tient sur la même ligne
  const nomClient = sanitizeForPdf(client.nom ?? "-");
  const typeLabel = TYPE_CLIENT_LABELS[client.type_client] ?? null;
  const tagInnerPadding = 4;
  const tagWidth = typeLabel ? fonts.bold.widthOfTextAtSize(typeLabel, 6.5) + tagInnerPadding * 2 : 0;
  const nomWidth = fonts.bold.widthOfTextAtSize(nomClient, 10);
  const tagOnSameLine = !typeLabel || nomWidth + 8 + tagWidth <= innerWidth;

  const champsOptionnels = [
    Boolean(client.adresse),
    Boolean(client.telephone),
    Boolean(client.email),
    Boolean(client.ninea && client.type_client !== "particulier"),
  ].filter(Boolean).length;

  const lignesClient = 1 + (typeLabel && !tagOnSameLine ? 1 : 0) + champsOptionnels;
  // v3 (avenant multi-entrepôts, 0013) : eyebrow + nom + entrepôt d'origine.
  // Toujours 3 lignes réservées (jamais moins) même si entrepot_id est
  // NULL/introuvable (ex. facture antérieure au backfill Siège, ou entrepôt
  // supprimé — impossible en pratique, ON DELETE RESTRICT, mais on reste
  // défensif) : "-" est alors affiché à la place du nom, la hauteur du bloc
  // Client/Agent ne dépend donc jamais de la présence réelle de l'entrepôt.
  const lignesAgent = 3;

  const eyebrowBlockHeight = 12;
  const hauteurClientInterieur = eyebrowBlockHeight + lignesClient * 11;
  const hauteurAgentInterieur = eyebrowBlockHeight + lignesAgent * 11;
  const boxHeight = Math.max(hauteurClientInterieur, hauteurAgentInterieur) + padding * 2;

  page.drawRectangle({
    x: clientBoxX,
    y: boxTop - boxHeight,
    width: clientBoxWidth,
    height: boxHeight,
    borderWidth: 0.75,
    borderColor: COLOR_BORDER_CLIENT_AGENT,
  });
  page.drawRectangle({
    x: agentBoxX,
    y: boxTop - boxHeight,
    width: agentBoxWidth,
    height: boxHeight,
    borderWidth: 0.75,
    borderColor: COLOR_BORDER_CLIENT_AGENT,
  });

  // --- Contenu boîte Client --------------------------------------------------
  let y = boxTop - padding - 7.5;
  page.drawText("CLIENT", { x: clientBoxX + padding, y, size: 7.5, font: fonts.bold, color: COLOR_GREEN_DK });
  y -= 13;

  page.drawText(nomClient, { x: clientBoxX + padding, y, size: 10, font: fonts.bold, color: COLOR_TEXT_PRIMARY });
  if (typeLabel && tagOnSameLine) {
    drawTag(page, clientBoxX + padding + nomWidth + 8, y - 1, typeLabel, fonts);
  }
  y -= 12;
  if (typeLabel && !tagOnSameLine) {
    drawTag(page, clientBoxX + padding, y - 1, typeLabel, fonts);
    y -= 12;
  }

  if (client.adresse) {
    page.drawText(sanitizeForPdf(client.adresse), {
      x: clientBoxX + padding,
      y,
      size: 8,
      font: fonts.regular,
      color: COLOR_TEXT_SECONDARY,
    });
    y -= 11;
  }
  if (client.telephone) {
    page.drawText(`Tél : ${sanitizeForPdf(client.telephone)}`, {
      x: clientBoxX + padding,
      y,
      size: 8,
      font: fonts.regular,
      color: COLOR_TEXT_SECONDARY,
    });
    y -= 11;
  }
  if (client.email) {
    page.drawText(`Email : ${client.email}`, {
      x: clientBoxX + padding,
      y,
      size: 8,
      font: fonts.regular,
      color: COLOR_TEXT_SECONDARY,
    });
    y -= 11;
  }
  if (client.ninea && client.type_client !== "particulier") {
    page.drawText(`NINEA : ${client.ninea}`, {
      x: clientBoxX + padding,
      y,
      size: 8,
      font: fonts.regular,
      color: COLOR_TEXT_SECONDARY,
    });
  }

  // --- Contenu boîte Agent ----------------------------------------------------
  let yAgent = boxTop - padding - 7.5;
  page.drawText("AGENT COMMERCIAL", {
    x: agentBoxX + padding,
    y: yAgent,
    size: 7.5,
    font: fonts.bold,
    color: COLOR_GREEN_DK,
  });
  yAgent -= 13;
  page.drawText(agentNom, {
    x: agentBoxX + padding,
    y: yAgent,
    size: 10,
    font: fonts.bold,
    color: COLOR_TEXT_PRIMARY,
  });
  yAgent -= 11;
  page.drawText(`Entrepôt : ${entrepotNom}`, {
    x: agentBoxX + padding,
    y: yAgent,
    size: 8,
    font: fonts.regular,
    color: COLOR_TEXT_SECONDARY,
  });

  return boxTop - boxHeight - 14;
}

/** Tag neutre (type_client) : fond gris clair, bordure fine, texte gras 6.5pt. */
function drawTag(page: PDFPage, x: number, y: number, label: string, fonts: Fonts) {
  const padding = 4;
  const width = fonts.bold.widthOfTextAtSize(label, 6.5) + padding * 2;
  const height = 11;
  page.drawRectangle({
    x,
    y: y - 2,
    width,
    height,
    color: COLOR_TAG_BG,
    borderWidth: 0.5,
    borderColor: COLOR_BORDER_LIGHT,
  });
  page.drawText(label, { x: x + padding, y, size: 6.5, font: fonts.bold, color: COLOR_TEXT_PRIMARY });
}

/**
 * v2 §4.2 — Badge "Inclus (kit)" pour les lignes de facture
 * `inclus_dans_kit` : encadré à liséré gauche 2pt vert, fond neutre
 * `COLOR_TAG_BG`, texte 6.5pt gras gris. Pas de glyphe "✓" (non garanti en
 * WinAnsi), pas de pilule (réservée aux badges de statut de facture).
 */
function drawInclusKitBadge(page: PDFPage, x: number, y: number, fonts: Fonts) {
  const label = "Inclus (kit)";
  const size = 6.5;
  const stripeWidth = 2;
  const paddingX = 4;
  const height = 10;
  const textWidth = fonts.bold.widthOfTextAtSize(label, size);
  const width = stripeWidth + paddingX * 2 + textWidth;

  page.drawRectangle({
    x,
    y: y - 2,
    width,
    height,
    color: COLOR_TAG_BG,
  });
  page.drawRectangle({
    x,
    y: y - 2,
    width: stripeWidth,
    height,
    color: COLOR_GREEN_DK,
  });
  page.drawText(label, {
    x: x + stripeWidth + paddingX,
    y,
    size,
    font: fonts.bold,
    color: COLOR_TEXT_SECONDARY,
  });
}

function drawTableHeader(
  page: PDFPage,
  yStart: number,
  fontBold: PDFFont,
  cols: typeof COL,
  hasPhoto: boolean,
): number {
  const headerHeight = 20;
  page.drawRectangle({
    x: MARGIN,
    y: yStart - headerHeight,
    width: CONTENT_WIDTH,
    height: headerHeight,
    color: COLOR_TABLE_HEADER_BG,
  });

  let x = MARGIN + 3;
  const headers: [string, number][] = [
    ...(hasPhoto ? ([["PHOTO", cols.photo]] as [string, number][]) : []),
    ["RÉF.", cols.reference],
    ["DÉSIGNATION", cols.designation],
    ["QTÉ", cols.qte],
    ["UNITÉ", cols.unite],
    ["P.U.", cols.prixUnitaire],
    ["TOTAL", cols.total],
  ];
  for (const [label, width] of headers) {
    page.drawText(label, { x, y: yStart - 14, size: 7.5, font: fontBold, color: COLOR_GREEN_DK });
    x += width;
  }

  return yStart - headerHeight;
}

/** Placeholder discret pour une ligne sans photo (§4.3, D-03). */
function drawPhotoPlaceholder(page: PDFPage, x: number, rowTop: number, rowHeight: number, colWidth: number) {
  const size = 22;
  const boxX = x + (colWidth - size) / 2;
  const boxY = rowTop - rowHeight + (rowHeight - size) / 2;
  page.drawRectangle({
    x: boxX,
    y: boxY,
    width: size,
    height: size,
    color: COLOR_PLACEHOLDER_BG,
    borderWidth: 0.5,
    borderColor: COLOR_BORDER_LIGHT,
  });
  page.drawLine({
    start: { x: boxX, y: boxY },
    end: { x: boxX + size, y: boxY + size },
    thickness: 0.75,
    color: COLOR_PLACEHOLDER_LINE,
  });
}

function drawTotalRow(
  page: PDFPage,
  x: number,
  y: number,
  label: string,
  value: string,
  labelFont: PDFFont,
  valueFont: PDFFont,
  size = 9,
  color = COLOR_TEXT_PRIMARY,
) {
  page.drawText(label, { x, y, size, font: labelFont, color });
  const valueWidth = valueFont.widthOfTextAtSize(value, size);
  page.drawText(value, { x: MARGIN + CONTENT_WIDTH - valueWidth, y, size, font: valueFont, color });
}

/**
 * Zone 4 (§4.4) — Bloc totaux : cadre englobant léger, filet vert avant le
 * total général, total général mis en évidence (fond pastel + police plus
 * grande). `hauteurTotaux` est calculé UNE SEULE FOIS par l'appelant (§5) et
 * reçu ici en paramètre : la valeur retournée est toujours `yTop -
 * hauteurTotaux`, jamais recalculée indépendamment, pour garantir que la
 * réservation d'espace (`ensureSpace`) et le dessin réel restent cohérents.
 */
function drawTotalsBlock(
  page: PDFPage,
  yTop: number,
  args: {
    facture: any;
    tvaTaux: number;
    hauteurTotaux: number;
    fonts: Fonts;
    totalPaye: number;
    resteAPayer: number;
    afficherPaiement: boolean;
  },
): number {
  const { facture, tvaTaux, hauteurTotaux, fonts, totalPaye, resteAPayer, afficherPaiement } = args;
  const totauxX = MARGIN + CONTENT_WIDTH - 220;
  const frameX = totauxX - 10;
  const frameWidth = MARGIN + CONTENT_WIDTH - frameX;

  let y = yTop - 8;
  drawTotalRow(page, totauxX, y, "Total HT", formatFcfa(facture.total_ht), fonts.regular, fonts.courier, 9);
  y -= 16;
  drawTotalRow(
    page,
    totauxX,
    y,
    "Forfait transport",
    formatFcfa(facture.forfait_transport),
    fonts.regular,
    fonts.courier,
    9,
  );
  y -= 16;

  if (tvaTaux > 0) {
    const montantTva =
      parseFloat(facture.total_general) - parseFloat(facture.total_ht) - parseFloat(facture.forfait_transport);
    drawTotalRow(
      page,
      totauxX,
      y,
      `TVA (${(tvaTaux * 100).toFixed(2).replace(/\.?0+$/, "")}%)`,
      formatFcfa(montantTva),
      fonts.regular,
      fonts.courier,
      9,
    );
    y -= 16;
  }

  // Filet avant le total général : noir 1pt -> vert #15803D 1.25pt (§4.4).
  page.drawLine({
    start: { x: totauxX, y: y - 4 },
    end: { x: MARGIN + CONTENT_WIDTH, y: y - 4 },
    thickness: 1.25,
    color: COLOR_GREEN_DK,
  });

  // Ligne "TOTAL GENERAL" : fond pastel vert clair + libellé 10pt gras +
  // montant 13pt CourierBold (le montant qui doit sauter aux yeux en premier).
  const rectTop = y - 10;
  const generalRowHeight = 22;
  const rectBottom = rectTop - generalRowHeight;
  page.drawRectangle({ x: frameX, y: rectBottom, width: frameWidth, height: generalRowHeight, color: COLOR_TOTAL_PASTEL_BG });

  const labelTotalGeneral = tvaTaux > 0 ? "TOTAL GENERAL TTC" : "TOTAL GENERAL HTVA";
  const baselineGeneral = rectBottom + 7;
  page.drawText(labelTotalGeneral, {
    x: totauxX,
    y: baselineGeneral,
    size: 10,
    font: fonts.bold,
    color: COLOR_TEXT_PRIMARY,
  });
  const montantTexte = formatFcfa(facture.total_general);
  const montantWidth = fonts.courierBold.widthOfTextAtSize(montantTexte, 13);
  page.drawText(montantTexte, {
    x: MARGIN + CONTENT_WIDTH - montantWidth,
    y: baselineGeneral,
    size: 13,
    font: fonts.courierBold,
    color: COLOR_TEXT_PRIMARY,
  });

  // "Déjà payé" / "Reste à payer" — mêmes deux lignes, même condition
  // (totalPaye > 0) que l'écran de détail facture. Vert pour le payé (cohérent
  // avec --color-text-green = COLOR_GREEN_DK sur l'écran), rouge pour le reste
  // dû (COLOR_STATUT_ANNULEE_TXT = --color-text-red), aucune nouvelle couleur.
  if (afficherPaiement) {
    let yPaiement = rectBottom - 14;
    drawTotalRow(
      page,
      totauxX,
      yPaiement,
      "Déjà payé",
      formatFcfa(totalPaye),
      fonts.regular,
      fonts.courier,
      9,
      COLOR_GREEN_DK,
    );
    yPaiement -= 16;
    drawTotalRow(
      page,
      totauxX,
      yPaiement,
      "Reste à payer",
      formatFcfa(resteAPayer),
      fonts.bold,
      fonts.courierBold,
      9,
      COLOR_STATUT_ANNULEE_TXT,
    );
  }

  // Cadre englobant léger (bordure seule, pas de fond) autour de tout le bloc.
  page.drawRectangle({
    x: frameX,
    y: yTop - hauteurTotaux,
    width: frameWidth,
    height: hauteurTotaux,
    borderWidth: 0.75,
    borderColor: COLOR_BORDER_LIGHT,
  });

  return yTop - hauteurTotaux;
}

/**
 * Zone 5a (§4.5) — Colonne mentions légales. Dessine à partir de `yStart`
 * (une copie locale de `yFooterTop`, jamais `ctx.y` lui-même) et retourne la
 * position finale, qui ne doit JAMAIS influencer la position du cadre
 * signature (voir drawSignatureBox, ancré indépendamment sur `yFooterTop`).
 */
function drawMentionsLegales(
  page: PDFPage,
  yStart: number,
  args: { entreprise: any; facture: any; fonts: Fonts; mentionsWidth: number },
): number {
  const { entreprise, facture, fonts, mentionsWidth } = args;
  let y = yStart;

  page.drawText("MODALITÉS DE RÈGLEMENT", { x: MARGIN, y, size: 7.5, font: fonts.bold, color: COLOR_GREEN_DK });
  // v2 §3.2 : filet manquant sous l'eyebrow — seule section du document dans
  // ce cas jusqu'ici (CLIENT/AGENT/ARTICLES en ont déjà un).
  y -= 8;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: MARGIN + mentionsWidth, y },
    thickness: 0.5,
    color: COLOR_BORDER_LIGHT,
  });
  y -= 8;
  for (const line of wrapText(sanitizeForPdf(entreprise.modalites_reglement), fonts.regular, 8, mentionsWidth)) {
    page.drawText(line, { x: MARGIN, y, size: 8, font: fonts.regular, color: COLOR_TEXT_PRIMARY });
    y -= 11;
  }
  if (entreprise.delai_disponibilite) {
    for (const line of wrapText(
      `Délai de disponibilité : ${sanitizeForPdf(entreprise.delai_disponibilite)}`,
      fonts.regular,
      8,
      mentionsWidth,
    )) {
      page.drawText(line, { x: MARGIN, y, size: 8, font: fonts.regular, color: COLOR_TEXT_PRIMARY });
      y -= 11;
    }
  }
  const validiteTexte = `Validité de la proforma : ${entreprise.validite_proforma_jours} jours à compter du ${formatDateFr(facture.date_facture)}.`;
  for (const line of wrapText(validiteTexte, fonts.regular, 8, mentionsWidth)) {
    page.drawText(line, { x: MARGIN, y, size: 8, font: fonts.regular, color: COLOR_TEXT_PRIMARY });
    y -= 11;
  }
  if (facture.notes) {
    y -= 4;
    page.drawText("Notes :", { x: MARGIN, y, size: 8, font: fonts.bold, color: COLOR_TEXT_PRIMARY });
    y -= 11;
    for (const line of wrapText(sanitizeForPdf(facture.notes), fonts.regular, 8, mentionsWidth)) {
      page.drawText(line, { x: MARGIN, y, size: 8, font: fonts.regular, color: COLOR_TEXT_PRIMARY });
      y -= 11;
    }
  }

  return y;
}

/**
 * Zone 5b (§4.5) — Cadre cachet/signature. `sigTop` DOIT être `yFooterTop`,
 * passé directement par l'appelant : c'est le fix du bug (§5) — plus jamais
 * de valeur dérivée de `ctx.y` après le dessin des mentions légales.
 *
 * Tampon officiel (0007_tampon_entreprise.sql) : si `embeddedTampon` est
 * fourni, l'image remplace le texte placeholder "Cachet et signature" et est
 * centrée dans la zone haute du cadre, proportions respectées (jamais
 * déformée), avec une marge intérieure. Le libellé "LE PRESIDENT" reste
 * toujours affiché en bas du cadre, image ou pas — comportement identique
 * dans les deux cas pour ce libellé. Si `embeddedTampon` est `null` (URL
 * absente ou téléchargement en échec, cf. fetchImageBytes), on retombe sur
 * le cadre vide + texte placeholder d'origine, sans aucune régression.
 */
function drawSignatureBox(
  page: PDFPage,
  sigX: number,
  sigTop: number,
  args: { fonts: Fonts; embeddedTampon?: any },
) {
  const { fonts, embeddedTampon } = args;
  const width = 180;
  const height = 100;
  page.drawRectangle({
    x: sigX,
    y: sigTop - height,
    width,
    height,
    borderWidth: 0.75,
    borderColor: COLOR_BORDER_SIGNATURE,
  });

  if (embeddedTampon) {
    // Zone image : entre le haut du cadre (marge 8pt) et une marge de
    // dégagement au-dessus du libellé "LE PRESIDENT" (baseline à
    // sigTop - height + 14, ascendant ~7pt -> on réserve jusqu'à +26).
    const paddingTop = 8;
    const paddingSide = 10;
    const clearanceAboveLabel = 26;
    const areaWidth = width - paddingSide * 2;
    const areaHeight = height - paddingTop - clearanceAboveLabel;
    const areaX = sigX + paddingSide;
    const areaTop = sigTop - paddingTop;

    const scale = Math.min(areaWidth / embeddedTampon.width, areaHeight / embeddedTampon.height);
    const w = embeddedTampon.width * scale;
    const h = embeddedTampon.height * scale;
    page.drawImage(embeddedTampon, {
      x: areaX + (areaWidth - w) / 2,
      y: areaTop - areaHeight + (areaHeight - h) / 2,
      width: w,
      height: h,
    });
  } else {
    page.drawText("Cachet et signature", {
      x: sigX + 10,
      y: sigTop - 16,
      size: 8,
      font: fonts.italic,
      color: COLOR_TEXT_SECONDARY,
    });
  }

  const label = "LE PRESIDENT";
  const labelWidth = fonts.bold.widthOfTextAtSize(label, 10);
  page.drawText(label, {
    x: sigX + (width - labelWidth) / 2,
    y: sigTop - height + 14,
    size: 10,
    font: fonts.bold,
    color: COLOR_TEXT_PRIMARY,
  });
}

function drawLegalFooterBar(page: PDFPage, entreprise: any, fonts: Fonts) {
  const y = MARGIN;
  // v2 §3.3 : eyebrow de section au-dessus du filet — seule zone du document
  // qui n'en avait pas encore.
  page.drawText("COORDONNÉES & MENTIONS LÉGALES", {
    x: MARGIN,
    y: y + 44,
    size: 6.5,
    font: fonts.bold,
    color: COLOR_GREEN_DK,
  });
  // Filet séparateur : gris plein -> gris/vert clair, discret (§4.6).
  page.drawLine({
    start: { x: MARGIN, y: y + 34 },
    end: { x: MARGIN + CONTENT_WIDTH, y: y + 34 },
    thickness: 0.5,
    color: COLOR_FOOTER_LINE,
  });

  const ligne1 = [
    sanitizeForPdf(entreprise.nom),
    entreprise.adresses?.length ? sanitizeForPdf(entreprise.adresses.join(" / ")) : null,
    entreprise.telephones?.length ? `Tél : ${sanitizeForPdf(entreprise.telephones.join(" - "))}` : null,
  ]
    .filter(Boolean)
    .join("  |  ");

  const banque = [
    entreprise.banque_code ? `Code banque : ${entreprise.banque_code}` : null,
    entreprise.banque_agence ? `Agence : ${entreprise.banque_agence}` : null,
    entreprise.banque_numero_compte
      ? `Compte : ${entreprise.banque_numero_compte}${entreprise.banque_cle_rib ? ` clé ${entreprise.banque_cle_rib}` : ""}`
      : null,
  ]
    .filter(Boolean)
    .join("  |  ");

  const ligne2 = [
    entreprise.ninea ? `NINEA : ${entreprise.ninea}` : null,
    entreprise.rc ? `RC : ${entreprise.rc}` : null,
    banque || null,
    entreprise.iban ? `IBAN : ${entreprise.iban}` : null,
    entreprise.swift ? `SWIFT : ${entreprise.swift}` : null,
  ]
    .filter(Boolean)
    .join("  |  ");

  page.drawText(ligne1, { x: MARGIN, y: y + 22, size: 6.5, font: fonts.regular, color: COLOR_FOOTER_TEXT });
  page.drawText(ligne2, { x: MARGIN, y: y + 12, size: 6.5, font: fonts.regular, color: COLOR_FOOTER_TEXT });
}

function formatQuantite(value: number | string): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (!Number.isFinite(n)) return "-";
  return Number.isInteger(n) ? n.toString() : n.toFixed(2);
}

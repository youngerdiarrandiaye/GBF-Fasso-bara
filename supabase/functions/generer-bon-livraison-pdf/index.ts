// supabase/functions/generer-bon-livraison-pdf/index.ts
//
// Génère le PDF d'un bon de livraison GFB (règle métier 15,
// supabase/migrations/0013_avenant_credit_entrepots.sql) et le dépose dans le
// bucket privé "bons-livraison" (0015_bucket_bons_livraison.sql), puis
// retourne une URL signée à durée limitée.
//
// IMPORTANT : cette fonction ne recalcule AUCUNE règle métier déjà couverte
// par les triggers SQL de 0013 (numérotation via generer_numero_bon_livraison(),
// décrément de stock via gerer_ligne_bon_livraison()). Elle se contente de
// LIRE les valeurs déjà en base et de les mettre en forme. Un bon de
// livraison n'est PAS un document financier (0013, commentaire
// lignes_bon_livraison) : aucun prix, aucun total, aucune mention légale
// bancaire ne figure sur ce PDF — uniquement produit + quantité par ligne.
//
// Même architecture que generer-facture-pdf/index.ts (voir ce fichier pour
// le détail des décisions communes) :
//   1. Portail d'autorisation : lecture via un client "utilisateur" (JWT
//      forwardé), RLS fait office de contrôle d'accès (agent = ses propres
//      BL uniquement — bons_livraison_lecture_agent_propre, 0013 section 5 —,
//      admin = tout).
//   2. Détail complet + upload Storage : client service_role, une fois
//      l'accès confirmé.
//   3. Idempotence : chemin déterministe {agent_id}/{numero_bl}.pdf,
//      `upsert: true`.
//
// Bucket Storage : `bons-livraison` (PAS `factures`) — décision documentée en
// tête de 0015_bucket_bons_livraison.sql (séparation des types de documents,
// déjà la convention établie par 0001 section 15 pour factures/produits-photos/logo).

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "npm:pdf-lib@1.17.1";
import { z } from "npm:zod@3.23.8";
import {
  createServiceClient,
  createUserClient,
  getAuthHeader,
  toPublicUrl,
} from "../_shared/clients.ts";
import { handleCorsPreflight, jsonResponse } from "../_shared/cors.ts";
import { fetchImageBytes, formatDateFr, sanitizeForPdf, wrapText } from "../_shared/pdf.ts";

const bodySchema = z.object({
  bon_livraison_id: z.string().uuid({ message: "bon_livraison_id doit être un UUID valide" }),
});

const SIGNED_URL_TTL_SECONDS = parseInt(
  Deno.env.get("BON_LIVRAISON_PDF_SIGNED_URL_TTL_SECONDS") ?? "3600",
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

// --- Mise en page (mêmes constantes de base que generer-facture-pdf, pour
// une cohérence visuelle entre les deux documents) --------------------------
const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89;
const MARGIN = 40;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const FOOTER_RESERVED_HEIGHT = 50;
const CARD_INSET = 18;

const COL = {
  reference: 70,
  designation: 300,
  qte: 60,
  unite: 68,
};

// --- Palette PDF (sous-ensemble de docs/design-system.md, cohérent avec
// generer-facture-pdf) -------------------------------------------------------
const COLOR_GREEN_DK = rgb(0.086, 0.502, 0.235); // #15803D
const COLOR_TEXT_PRIMARY = rgb(0.13, 0.13, 0.13); // #212121
const COLOR_TEXT_SECONDARY = rgb(0.35, 0.35, 0.35); // #595959
const COLOR_BORDER_LIGHT = rgb(0.85, 0.85, 0.85); // #D9D9D9
const COLOR_BORDER_BOX = rgb(0.75, 0.75, 0.75); // #BFBFBF
const COLOR_TAG_BG = rgb(0.93, 0.93, 0.93); // #EDEDED
const COLOR_TABLE_HEADER_BG = rgb(0.92, 0.92, 0.92);

const COLOR_STATUT_NON_PAYE_TXT = rgb(0.706, 0.325, 0.035); // #B45309 (orange, cohérent avec badge PROFORMA facture)
const COLOR_STATUT_NON_PAYE_BG = rgb(0.99, 0.94, 0.86);
const COLOR_STATUT_PAYE_TXT = COLOR_GREEN_DK;
const COLOR_STATUT_PAYE_BG = rgb(0.9, 0.96, 0.92);

const STATUT_BL_BADGE: Record<string, { label: string; color: ReturnType<typeof rgb>; bg: ReturnType<typeof rgb> }> = {
  livre_non_paye: { label: "LIVRÉ NON PAYÉ", color: COLOR_STATUT_NON_PAYE_TXT, bg: COLOR_STATUT_NON_PAYE_BG },
  livre_paye: { label: "LIVRÉ PAYÉ", color: COLOR_STATUT_PAYE_TXT, bg: COLOR_STATUT_PAYE_BG },
};

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  courier: PDFFont;
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
    const { bon_livraison_id } = parsed.data;

    // --- Portail d'autorisation : RLS via le JWT de l'appelant --------------
    // Même principe que generer-facture-pdf : .maybeSingle() renvoie `null`
    // aussi bien si le BL n'existe pas que si RLS refuse l'accès (agent qui
    // n'en est pas propriétaire) — on ne révèle jamais l'existence d'un BL à
    // un tiers non autorisé.
    const userClient = createUserClient(authHeader);
    const { data: blAcces, error: accesError } = await userClient
      .from("bons_livraison")
      .select("id, numero, agent_id")
      .eq("id", bon_livraison_id)
      .maybeSingle();

    if (accesError) {
      console.error("generer-bon-livraison-pdf: erreur vérification d'accès", accesError);
      return jsonResponse({ error: "Erreur lors de la vérification d'accès au bon de livraison." }, 500);
    }
    if (!blAcces) {
      return jsonResponse({ error: "Bon de livraison introuvable ou accès refusé." }, 404);
    }

    // --- Récupération du détail complet via service_role --------------------
    const serviceClient = createServiceClient();

    const { data: bl, error: blError } = await serviceClient
      .from("bons_livraison")
      .select(
        `
        id, numero, statut, date_livraison, notes, agent_id, facture_id,
        client:client_id ( nom, type_client, adresse, telephone, email, ninea ),
        entrepot:entrepot_id ( nom, adresse ),
        agent:agent_id ( nom ),
        facture:facture_id ( numero ),
        lignes:lignes_bon_livraison (
          id, quantite, created_at,
          produit:produit_id ( code, nom, unite )
        )
      `,
      )
      .eq("id", bon_livraison_id)
      .single();

    if (blError || !bl) {
      console.error("generer-bon-livraison-pdf: erreur récupération détail BL", blError);
      return jsonResponse({ error: "Impossible de charger le détail du bon de livraison." }, 500);
    }

    const { data: entreprise, error: entrepriseError } = await serviceClient
      .from("entreprise_config")
      .select("nom, adresses, telephones, email, logo_url")
      .eq("id", true)
      .single();

    if (entrepriseError || !entreprise) {
      console.error("generer-bon-livraison-pdf: entreprise_config introuvable", entrepriseError);
      return jsonResponse(
        { error: "Configuration entreprise introuvable : contactez un administrateur." },
        500,
      );
    }

    const lignes = [...(bl.lignes ?? [])].sort(
      (a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );

    // --- Génération du PDF ----------------------------------------------------
    const pdfBytes = await buildBonLivraisonPdf({ bl, entreprise, lignes });

    // --- Upload idempotent dans le bucket privé "bons-livraison" --------------
    // Convention de chemin identique à `factures` (0001) : {agent_id}/{numero}.pdf
    // — voir 0015_bucket_bons_livraison.sql pour la policy RLS qui en dépend.
    const path = `${bl.agent_id}/${bl.numero}.pdf`;
    const { error: uploadError } = await serviceClient.storage
      .from("bons-livraison")
      .upload(path, pdfBytes, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      console.error("generer-bon-livraison-pdf: erreur upload Storage", uploadError);
      return jsonResponse({ error: "Erreur lors de l'enregistrement du PDF." }, 500);
    }

    const { data: signed, error: signError } = await serviceClient.storage
      .from("bons-livraison")
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

    if (signError || !signed) {
      console.error("generer-bon-livraison-pdf: erreur création URL signée", signError);
      return jsonResponse({ error: "Erreur lors de la génération du lien de téléchargement." }, 500);
    }

    return jsonResponse({
      pdf_url: toPublicUrl(signed.signedUrl),
      expire_dans_secondes: SIGNED_URL_TTL_SECONDS,
      numero_bon_livraison: bl.numero,
    });
  } catch (err) {
    console.error("generer-bon-livraison-pdf: erreur inattendue", err);
    return jsonResponse({ error: "Erreur interne lors de la génération du PDF." }, 500);
  }
});

// =============================================================================
// Construction du document PDF (pdf-lib)
// =============================================================================

async function buildBonLivraisonPdf(params: { bl: any; entreprise: any; lignes: any[] }): Promise<Uint8Array> {
  const { bl, entreprise, lignes } = params;

  const pdfDoc = await PDFDocument.create();
  const fonts: Fonts = {
    regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
    bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
    italic: await pdfDoc.embedFont(StandardFonts.HelveticaOblique),
    courier: await pdfDoc.embedFont(StandardFonts.Courier),
  };

  const logo = await fetchImageBytes(entreprise.logo_url);
  const embeddedLogo = logo
    ? logo.kind === "png"
      ? await pdfDoc.embedPng(logo.bytes)
      : await pdfDoc.embedJpg(logo.bytes)
    : null;

  const ctx = { page: pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]), y: 0 };
  drawCardFrame(ctx.page);
  drawHeader(ctx.page, { entreprise, bl, embeddedLogo, fonts });
  ctx.y = drawInfoBoxes(ctx.page, { bl, fonts });

  ctx.page.drawText("ARTICLES LIVRÉS", {
    x: MARGIN,
    y: ctx.y - 7.5,
    size: 7.5,
    font: fonts.bold,
    color: COLOR_GREEN_DK,
  });
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y - 12 },
    end: { x: MARGIN + CONTENT_WIDTH, y: ctx.y - 12 },
    thickness: 0.5,
    color: COLOR_BORDER_LIGHT,
  });
  ctx.y -= 20;

  ctx.y = drawTableHeader(ctx.page, ctx.y, fonts.bold);

  const ensureSpace = (needed: number) => {
    if (ctx.y - needed < FOOTER_RESERVED_HEIGHT + MARGIN) {
      drawFooter(ctx.page, entreprise, fonts);
      ctx.page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      drawCardFrame(ctx.page);
      ctx.y = PAGE_HEIGHT - MARGIN;
      ctx.page.drawText(sanitizeForPdf(`Bon de livraison ${bl.numero} (suite)`), {
        x: MARGIN,
        y: ctx.y,
        size: 10,
        font: fonts.italic,
        color: COLOR_TEXT_SECONDARY,
      });
      ctx.y -= 20;
      ctx.y = drawTableHeader(ctx.page, ctx.y, fonts.bold);
    }
  };

  if (lignes.length === 0) {
    ensureSpace(24);
    ctx.page.drawText("Aucune ligne saisie sur ce bon de livraison.", {
      x: MARGIN,
      y: ctx.y - 14,
      size: 8,
      font: fonts.italic,
      color: COLOR_TEXT_SECONDARY,
    });
    ctx.y -= 24;
  }

  for (const ligne of lignes) {
    const produit = ligne.produit ?? {};
    const designation = sanitizeForPdf(produit.nom ?? "Produit supprimé");
    const designationLines = wrapText(designation, fonts.regular, 9, COL.designation - 6);
    const rowHeight = Math.max(26, designationLines.length * 11 + 10);

    ensureSpace(rowHeight);

    const rowTop = ctx.y;
    let x = MARGIN;

    ctx.page.drawText(sanitizeForPdf(produit.code ?? "-"), {
      x,
      y: rowTop - 14,
      size: 8,
      font: fonts.courier,
      color: COLOR_TEXT_PRIMARY,
    });
    x += COL.reference;

    let dy = rowTop - 14;
    for (const line of designationLines) {
      ctx.page.drawText(line, { x, y: dy, size: 9, font: fonts.regular, color: COLOR_TEXT_PRIMARY });
      dy -= 11;
    }
    x += COL.designation;

    ctx.page.drawText(formatQuantite(ligne.quantite), {
      x,
      y: rowTop - 14,
      size: 9,
      font: fonts.courier,
      color: COLOR_TEXT_PRIMARY,
    });
    x += COL.qte;

    ctx.page.drawText(UNITE_LABELS[produit.unite] ?? produit.unite ?? "-", {
      x,
      y: rowTop - 14,
      size: 8,
      font: fonts.regular,
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

  // --- Notes éventuelles ------------------------------------------------------
  if (bl.notes) {
    const notesWidth = CONTENT_WIDTH;
    const notesLines = wrapText(sanitizeForPdf(bl.notes), fonts.regular, 8, notesWidth);
    const hauteurNotes = 12 + notesLines.length * 11;
    ensureSpace(hauteurNotes);
    ctx.y -= 12;
    ctx.page.drawText("NOTES", { x: MARGIN, y: ctx.y, size: 7.5, font: fonts.bold, color: COLOR_GREEN_DK });
    ctx.y -= 11;
    for (const line of notesLines) {
      ctx.page.drawText(line, { x: MARGIN, y: ctx.y, size: 8, font: fonts.regular, color: COLOR_TEXT_PRIMARY });
      ctx.y -= 11;
    }
  }

  drawFooter(ctx.page, entreprise, fonts);

  return pdfDoc.save();
}

function drawCardFrame(page: PDFPage) {
  page.drawRectangle({
    x: CARD_INSET,
    y: CARD_INSET,
    width: PAGE_WIDTH - 2 * CARD_INSET,
    height: PAGE_HEIGHT - 2 * CARD_INSET,
    borderWidth: 0.75,
    borderColor: COLOR_BORDER_BOX,
  });
}

function drawHeader(page: PDFPage, args: { entreprise: any; bl: any; embeddedLogo: any; fonts: Fonts }) {
  const { entreprise, bl, embeddedLogo, fonts } = args;
  let y = PAGE_HEIGHT - MARGIN;

  if (embeddedLogo) {
    const boxW = 90;
    const boxH = 60;
    const scale = Math.min(boxW / embeddedLogo.width, boxH / embeddedLogo.height);
    const w = embeddedLogo.width * scale;
    const h = embeddedLogo.height * scale;
    page.drawImage(embeddedLogo, { x: MARGIN, y: y - h, width: w, height: h });
  }

  page.drawText(sanitizeForPdf(entreprise.nom), {
    x: MARGIN + 100,
    y: y - 12,
    size: 14,
    font: fonts.bold,
    color: COLOR_TEXT_PRIMARY,
  });
  let subY = y - 27;
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
  }

  const badgeWidth = 130;
  const badgeX = MARGIN + CONTENT_WIDTH - badgeWidth;
  drawStatusBadge(page, badgeX, y, bl.statut, fonts);

  const titre = "BON DE LIVRAISON";
  const titreWidth = fonts.bold.widthOfTextAtSize(titre, 15);
  page.drawText(titre, {
    x: MARGIN + CONTENT_WIDTH - titreWidth,
    y: y - 42,
    size: 15,
    font: fonts.bold,
    color: COLOR_GREEN_DK,
  });

  const numeroTexte = `N° ${bl.numero}`;
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

  const dateTexte = `Date de livraison : ${formatDateFr(bl.date_livraison)}`;
  const dateWidth = fonts.regular.widthOfTextAtSize(dateTexte, 10);
  page.drawText(dateTexte, {
    x: MARGIN + CONTENT_WIDTH - dateWidth,
    y: y - 70,
    size: 10,
    font: fonts.regular,
  });

  page.drawLine({
    start: { x: MARGIN, y: y - 92 },
    end: { x: MARGIN + CONTENT_WIDTH, y: y - 92 },
    thickness: 1.5,
    color: COLOR_GREEN_DK,
  });
}

function drawStatusBadge(page: PDFPage, x: number, yTop: number, statut: string, fonts: Fonts) {
  const style = STATUT_BL_BADGE[statut] ?? STATUT_BL_BADGE.livre_non_paye;
  const width = 130;
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

  const valueWidth = fonts.bold.widthOfTextAtSize(style.label, 9.5);
  page.drawText(style.label, {
    x: x + (width - valueWidth) / 2,
    y: yTop - 21,
    size: 9.5,
    font: fonts.bold,
    color: style.color,
  });
}

/**
 * Boîtes CLIENT / LIVRAISON, miroir des boîtes CLIENT/AGENT de
 * generer-facture-pdf : la boîte de droite regroupe tout ce qui concerne le
 * contexte opérationnel de la livraison (entrepôt de départ, agent, facture
 * liée le cas échéant) plutôt que de dupliquer une "boîte agent" séparée —
 * un BL a davantage d'informations logistiques à afficher qu'une facture.
 */
function drawInfoBoxes(page: PDFPage, args: { bl: any; fonts: Fonts }): number {
  const { bl, fonts } = args;
  const client = bl.client ?? {};
  const entrepot = bl.entrepot ?? {};
  const agentNom = sanitizeForPdf(bl.agent?.nom ?? "-");
  const entrepotNom = sanitizeForPdf(entrepot.nom ?? "-");
  const factureNumero = bl.facture?.numero ? sanitizeForPdf(bl.facture.numero) : null;

  const boxTop = PAGE_HEIGHT - MARGIN - 104;
  const padding = 8;
  const gapBetweenBoxes = 16;
  const clientBoxWidth = Math.round(CONTENT_WIDTH * 0.5);
  const livraisonBoxWidth = CONTENT_WIDTH - clientBoxWidth - gapBetweenBoxes;
  const clientBoxX = MARGIN;
  const livraisonBoxX = MARGIN + clientBoxWidth + gapBetweenBoxes;
  const innerWidth = clientBoxWidth - padding * 2;

  const nomClient = sanitizeForPdf(client.nom ?? "-");
  const typeLabel = TYPE_CLIENT_LABELS[client.type_client] ?? null;
  const tagInnerPadding = 4;
  const tagWidth = typeLabel ? fonts.bold.widthOfTextAtSize(typeLabel, 6.5) + tagInnerPadding * 2 : 0;
  const nomWidth = fonts.bold.widthOfTextAtSize(nomClient, 10);
  const tagOnSameLine = !typeLabel || nomWidth + 8 + tagWidth <= innerWidth;

  const champsOptionnels = [Boolean(client.adresse), Boolean(client.telephone)].filter(Boolean).length;
  const lignesClient = 1 + (typeLabel && !tagOnSameLine ? 1 : 0) + champsOptionnels;

  // Boîte LIVRAISON : eyebrow + entrepôt + agent + (facture liée, optionnel).
  const lignesLivraison = 3 + (factureNumero ? 1 : 0);

  const eyebrowBlockHeight = 12;
  const hauteurClientInterieur = eyebrowBlockHeight + lignesClient * 11;
  const hauteurLivraisonInterieur = eyebrowBlockHeight + lignesLivraison * 11;
  const boxHeight = Math.max(hauteurClientInterieur, hauteurLivraisonInterieur) + padding * 2;

  page.drawRectangle({
    x: clientBoxX,
    y: boxTop - boxHeight,
    width: clientBoxWidth,
    height: boxHeight,
    borderWidth: 0.75,
    borderColor: COLOR_BORDER_BOX,
  });
  page.drawRectangle({
    x: livraisonBoxX,
    y: boxTop - boxHeight,
    width: livraisonBoxWidth,
    height: boxHeight,
    borderWidth: 0.75,
    borderColor: COLOR_BORDER_BOX,
  });

  // --- Contenu boîte Client ---------------------------------------------------
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
  }

  // --- Contenu boîte Livraison -------------------------------------------------
  let yL = boxTop - padding - 7.5;
  page.drawText("LIVRAISON", { x: livraisonBoxX + padding, y: yL, size: 7.5, font: fonts.bold, color: COLOR_GREEN_DK });
  yL -= 13;
  page.drawText(`Entrepôt : ${entrepotNom}`, {
    x: livraisonBoxX + padding,
    y: yL,
    size: 9,
    font: fonts.bold,
    color: COLOR_TEXT_PRIMARY,
  });
  yL -= 11;
  page.drawText(`Agent : ${agentNom}`, {
    x: livraisonBoxX + padding,
    y: yL,
    size: 8,
    font: fonts.regular,
    color: COLOR_TEXT_SECONDARY,
  });
  yL -= 11;
  page.drawText(`Statut : ${STATUT_BL_BADGE[bl.statut]?.label ?? bl.statut}`, {
    x: livraisonBoxX + padding,
    y: yL,
    size: 8,
    font: fonts.regular,
    color: COLOR_TEXT_SECONDARY,
  });
  if (factureNumero) {
    yL -= 11;
    page.drawText(`Facture liée : ${factureNumero}`, {
      x: livraisonBoxX + padding,
      y: yL,
      size: 8,
      font: fonts.regular,
      color: COLOR_TEXT_SECONDARY,
    });
  }

  return boxTop - boxHeight - 14;
}

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

function drawTableHeader(page: PDFPage, yStart: number, fontBold: PDFFont): number {
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
    ["RÉF.", COL.reference],
    ["DÉSIGNATION", COL.designation],
    ["QTÉ", COL.qte],
    ["UNITÉ", COL.unite],
  ];
  for (const [label, width] of headers) {
    page.drawText(label, { x, y: yStart - 14, size: 7.5, font: fontBold, color: COLOR_GREEN_DK });
    x += width;
  }

  return yStart - headerHeight;
}

function drawFooter(page: PDFPage, entreprise: any, fonts: Fonts) {
  const y = MARGIN;
  page.drawLine({
    start: { x: MARGIN, y: y + 24 },
    end: { x: MARGIN + CONTENT_WIDTH, y: y + 24 },
    thickness: 0.5,
    color: COLOR_BORDER_LIGHT,
  });

  const ligne1 = [
    sanitizeForPdf(entreprise.nom),
    entreprise.adresses?.length ? sanitizeForPdf(entreprise.adresses.join(" / ")) : null,
    entreprise.telephones?.length ? `Tél : ${sanitizeForPdf(entreprise.telephones.join(" - "))}` : null,
  ]
    .filter(Boolean)
    .join("  |  ");

  page.drawText(ligne1, { x: MARGIN, y: y + 12, size: 6.5, font: fonts.regular, color: COLOR_TEXT_SECONDARY });

  // Rappel explicite (règle 15, 0013) : document logistique, pas commercial —
  // volontairement dépourvu de toute mention financière (pas de prix, pas de
  // total, pas d'IBAN/SWIFT contrairement au pied de page de generer-facture-pdf).
  page.drawText("Document logistique — ne tient pas lieu de facture, aucune valeur financière.", {
    x: MARGIN,
    y: y + 2,
    size: 6.5,
    font: fonts.italic,
    color: COLOR_TEXT_SECONDARY,
  });
}

function formatQuantite(value: number | string): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (!Number.isFinite(n)) return "-";
  return Number.isInteger(n) ? n.toString() : n.toFixed(2);
}

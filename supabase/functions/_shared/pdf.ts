// supabase/functions/_shared/pdf.ts
//
// Utilitaires bas niveau partagés entre les fonctions qui génèrent des PDF
// (generer-facture-pdf, export-rapport). Ne contient volontairement AUCUNE
// logique métier (pas de calcul de totaux, pas de règle de statut) : juste
// du formatage d'affichage et des helpers pdf-lib réutilisables.

import type { PDFFont } from "npm:pdf-lib@1.17.1";

/** Formate un nombre en FCFA façon "233 500 FCFA" (espace insécable comme séparateur de milliers, pas de décimales). */
export function formatFcfa(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? parseFloat(value) : value ?? 0;
  const rounded = Math.round((Number.isFinite(n) ? n : 0));
  const withSpaces = rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${withSpaces} FCFA`;
}

/** Formate une date ISO ("2026-06-11") ou un objet Date en "11/06/2026". */
export function formatDateFr(value: string | Date | null | undefined): string {
  if (!value) return "-";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "-";
  const jj = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const aaaa = d.getUTCFullYear();
  return `${jj}/${mm}/${aaaa}`;
}

export type ImageKind = "png" | "jpg";

export interface FetchedImage {
  bytes: Uint8Array;
  kind: ImageKind;
}

/**
 * Réécrit l'origine d'une URL Storage PUBLIQUE (ex: `http://127.0.0.1:54321`
 * en local, ou l'URL Cloud réelle en production) vers l'origine INTERNE
 * joignable DEPUIS le conteneur Docker du runtime des Edge Functions
 * (`SUPABASE_URL`, ex: `http://kong:8000` en local `supabase start`).
 *
 * Contexte : `entreprise_config.logo_url`, `entreprise_config.tampon_url` et
 * `produits.photos_urls` stockent l'URL PUBLIQUE (celle affichée au
 * navigateur/frontend, cf. `PUBLIC_SUPABASE_URL` dans `_shared/clients.ts`).
 * En développement local, le conteneur du runtime NE PEUT PAS atteindre
 * `127.0.0.1:54321` : cette adresse s'y résout vers le conteneur lui-même
 * (`ECONNREFUSED`), pas vers la machine hôte. Il doit utiliser le nom
 * d'hôte interne du réseau Docker (`SUPABASE_URL`). C'est l'inverse exact de
 * `toPublicUrl()` (`_shared/clients.ts`), qui fait la réécriture opposée
 * pour les URLs signées retournées AU client.
 *
 * Ne fait rien (retourne l'URL telle quelle) si `PUBLIC_SUPABASE_URL` ou
 * `SUPABASE_URL` sont absents (Cloud production : `SUPABASE_URL` est déjà
 * l'URL publique réelle, rien à réécrire) ou si l'URL fournie n'a pas la
 * même origine que `PUBLIC_SUPABASE_URL` (image hébergée ailleurs : laissée
 * intacte).
 */
function resolveInternalFetchUrl(url: string): string {
  const publicBase = Deno.env.get("PUBLIC_SUPABASE_URL");
  const internalBase = Deno.env.get("SUPABASE_URL");
  if (!publicBase || !internalBase) return url;
  try {
    const target = new URL(url);
    const pub = new URL(publicBase);
    if (target.host !== pub.host) return url;
    const internal = new URL(internalBase);
    target.protocol = internal.protocol;
    target.host = internal.host;
    return target.toString();
  } catch {
    return url;
  }
}

/**
 * Télécharge une image (logo entreprise, tampon/signature ou photo produit)
 * et détecte son format à partir du Content-Type / de l'extension. Ne lève
 * jamais d'exception : retourne `null` si l'image est indisponible, pour ne
 * jamais bloquer la génération d'un PDF à cause d'une image manquante.
 */
export async function fetchImageBytes(url: string | null | undefined): Promise<FetchedImage | null> {
  if (!url) return null;
  try {
    const res = await fetch(resolveInternalFetchUrl(url));
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    const bytes = new Uint8Array(await res.arrayBuffer());
    let kind: ImageKind;
    if (contentType.includes("png") || url.toLowerCase().endsWith(".png")) {
      kind = "png";
    } else if (
      contentType.includes("jpeg") ||
      contentType.includes("jpg") ||
      /\.(jpe?g)$/i.test(url)
    ) {
      kind = "jpg";
    } else {
      // Format non supporté nativement par pdf-lib (ex: webp) : on ignore
      // plutôt que de faire échouer toute la génération du PDF.
      return null;
    }
    return { bytes, kind };
  } catch (err) {
    console.warn(`fetchImageBytes: échec du téléchargement de ${url}`, err);
    return null;
  }
}

/**
 * Les polices standard pdf-lib (Helvetica) utilisent l'encodage WinAnsi
 * (cp1252), qui ne contient pas certains caractères présents dans le
 * catalogue produit GFB (ex: "⌀" pour les diamètres, guillemets typographiques).
 * Sans cette étape, `page.drawText()` lève une exception et bloque toute la
 * génération du PDF pour un simple caractère non supporté.
 */
export function sanitizeForPdf(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .replace(/⌀/g, "Ø")
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...");
}

/** Découpe un texte en lignes qui tiennent chacune dans `maxWidth` pour la police/taille donnée. */
export function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const words = (text ?? "").split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

/**
 * Formatage des montants FCFA — toujours espace fine comme séparateur de
 * milliers, jamais de décimales si .00, sinon 2 décimales (docs/design-system.md §5.5).
 */
export function formatMontant(value: number): string {
  const arrondi = Math.round(value * 100) / 100;
  const aDesDecimales = Math.abs(arrondi % 1) > 0.001;

  const formatte = new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: aDesDecimales ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(arrondi);

  return `${formatte} FCFA`;
}

export function formatQuantite(value: number, unite?: string): string {
  const formatte = new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: 2,
  }).format(value);
  return unite ? `${formatte} ${unite}` : formatte;
}

const LIBELLES_UNITE: Record<string, { singulier: string; pluriel: string }> = {
  piece: { singulier: "pièce", pluriel: "pièces" },
  kit: { singulier: "kit", pluriel: "kits" },
  metre: { singulier: "mètre", pluriel: "mètres" },
  rouleau: { singulier: "rouleau", pluriel: "rouleaux" },
  forfait: { singulier: "forfait", pluriel: "forfaits" },
};

export function libelleUnite(unite: string, quantite: number): string {
  const entree = LIBELLES_UNITE[unite];
  if (!entree) return unite;
  return quantite > 1 ? entree.pluriel : entree.singulier;
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
}

/** Date du jour formatée en toutes lettres, fr-FR (ex. "Lundi 10 août 2026") — en-tête du dashboard Admin. */
export function formatDateLongue(date: Date): string {
  const formatte = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
  return formatte.charAt(0).toUpperCase() + formatte.slice(1);
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/**
 * Normalise un numéro de téléphone sénégalais en format `221XXXXXXXXX`
 * (sans `+`, format attendu par `wa.me`). `clients.telephone` est un champ
 * texte libre sans aucune validation de saisie — les formats rencontrés en
 * pratique incluent `77XXXXXXX`, `0077XXXXXXX`, `+221 77 XXX XX XX`, avec ou
 * sans espaces/tirets. Retourne `null` si le numéro ne peut pas être
 * reconnu comme un mobile sénégalais valide (9 chiffres commençant par 7).
 */
export function normaliserTelephoneSenegal(tel: string | null): string | null {
  if (!tel) return null;

  let chiffres = tel.replace(/\D/g, "");
  if (!chiffres) return null;

  // Préfixe international composé (ex. "0077XXXXXXX") : retiré avant toute
  // autre analyse.
  if (chiffres.startsWith("00")) {
    chiffres = chiffres.slice(2);
  }

  if (chiffres.startsWith("221")) {
    chiffres = chiffres.slice(3);
  } else if (chiffres.startsWith("0")) {
    chiffres = chiffres.slice(1);
  }

  if (chiffres.length !== 9 || !chiffres.startsWith("7")) {
    return null;
  }

  return `221${chiffres}`;
}

/**
 * Message WhatsApp pré-rempli pour l'envoi du PDF d'une facture — texte
 * partagé entre le Web Share API et le lien `wa.me`.
 */
export function construireMessageWhatsapp(numeroFacture: string, montant: number, pdfUrl: string): string {
  return [
    "Bonjour,",
    "",
    `Veuillez trouver votre facture *${numeroFacture}*.`,
    `Montant total : *${formatMontant(montant)}*`,
    "",
    `Consulter ou télécharger le PDF : ${pdfUrl}`,
  ].join("\n");
}

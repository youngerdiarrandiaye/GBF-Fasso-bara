/**
 * Masquage des montants (client qui regarde l'écran) : un attribut
 * `data-montants="masques"` sur <html> floute tout élément portant la classe
 * `.montant` (voir app/globals.css). Préférence mémorisée dans le navigateur,
 * appliquée avant le premier affichage par le script de lib/theme.ts.
 */
export const MONTANTS_STORAGE_KEY = "gfb-montants-masques";
export const MONTANTS_EVENT = "gfb-montants-change";

export function montantsMasques(): boolean {
  return document.documentElement.getAttribute("data-montants") === "masques";
}

export function definirMontantsMasques(masques: boolean) {
  const racine = document.documentElement;
  if (masques) racine.setAttribute("data-montants", "masques");
  else racine.removeAttribute("data-montants");
  try { window.localStorage.setItem(MONTANTS_STORAGE_KEY, masques ? "1" : "0"); } catch { /* Le choix reste actif pour cette session. */ }
  window.dispatchEvent(new CustomEvent(MONTANTS_EVENT, { detail: masques }));
}

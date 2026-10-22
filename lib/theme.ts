/**
 * Thèmes de marque (kit CoachSen) — un thème = fond + cartes + accent. Posé
 * sur <html data-brand="…"> (rien pour « Comptoir », le thème par défaut) et
 * mémorisé dans le navigateur. Les couleurs vivent dans app/globals.css ; la
 * liste ci-dessous ne sert qu'aux aperçus du sélecteur et à la barre du
 * navigateur (<meta name="theme-color">).
 */
export const THEMES = [
  { id: "comptoir", label: "Comptoir", fond: "#F4F6F3", accent: "#15803D", themeColor: "#15803D" },
  { id: "nuit", label: "Nuit citron", fond: "#0A0A0A", accent: "#C8F31D", themeColor: "#0A0A0A" },
  { id: "corail", label: "Corail", fond: "#FBF6F8", accent: "#FF1F6B", themeColor: "#FF1F6B" },
  { id: "lagon", label: "Lagon", fond: "#0C0D0E", accent: "#5FC9D2", themeColor: "#0C0D0E" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export const THEME_STORAGE_KEY = "gfb-theme";
export const THEME_EVENT = "gfb-theme-change";
export const THEME_DEFAUT: ThemeId = "comptoir";

export function estThemeValide(valeur: string | null): valeur is ThemeId {
  return THEMES.some((t) => t.id === valeur);
}

export function lireTheme(): ThemeId {
  try {
    const sauvegarde = window.localStorage.getItem(THEME_STORAGE_KEY);
    return estThemeValide(sauvegarde) ? sauvegarde : THEME_DEFAUT;
  } catch {
    return THEME_DEFAUT;
  }
}

/** Pose le thème sur <html>, met à jour la barre du navigateur, prévient les
 *  autres sélecteurs montés. `memoriser: false` pour une simple relecture. */
export function appliquerTheme(id: ThemeId, memoriser = true) {
  const racine = document.documentElement;
  if (id === THEME_DEFAUT) racine.removeAttribute("data-brand");
  else racine.setAttribute("data-brand", id);

  const theme = THEMES.find((t) => t.id === id) ?? THEMES[0];
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.content = theme.themeColor;

  if (memoriser) {
    try { window.localStorage.setItem(THEME_STORAGE_KEY, id); } catch { /* Le choix reste actif pour cette session. */ }
  }
  window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: id }));
}

/** Script exécuté avant l'affichage (dans <head>) : évite le flash du thème
 *  par défaut quand un autre thème est mémorisé. Doit rester autonome. */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});var m=${JSON.stringify(
  Object.fromEntries(THEMES.map((x) => [x.id, x.themeColor]))
)};if(t&&t!==${JSON.stringify(THEME_DEFAUT)}&&m[t]){document.documentElement.setAttribute("data-brand",t);var e=document.querySelector('meta[name="theme-color"]');if(e)e.setAttribute("content",m[t]);}}catch(e){}})();`;

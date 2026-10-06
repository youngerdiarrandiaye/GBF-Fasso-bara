import type { MetadataRoute } from "next";

/**
 * Manifeste PWA — rend l'application installable (Android, ordinateur,
 * iOS via « Sur l'écran d'accueil »). Couleurs « Comptoir » (D-25) : fond
 * clair de l'écran de démarrage, barre d'état vert foncé identique au
 * `themeColor` du layout racine. Pas de verrouillage d'orientation : l'Espace
 * Admin s'installe aussi sur tablette paysage et ordinateur.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "GFB-STOCK — GIE FASSO BARA",
    short_name: "GFB-STOCK",
    description: "Facturation, livraisons et stock du GIE FASSO BARA.",
    lang: "fr",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#F4F6F3",
    theme_color: "#15803D",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Raccourcis (appui long sur l'icône) pensés pour l'Espace Agent ; un
    // admin qui les ouvre est redirigé vers son tableau de bord.
    shortcuts: [
      {
        name: "Nouvelle facture",
        url: "/nouvelle-facture",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Mes factures",
        url: "/mes-factures",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}

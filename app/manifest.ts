import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GFB-STOCK — GIE FASSO BARA",
    short_name: "GFB-STOCK",
    description: "Gestion de stock et facturation — GIE FASSO BARA.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0F1712",
    theme_color: "#16A34A",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

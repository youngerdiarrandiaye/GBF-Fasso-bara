import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { ServiceWorkerRegister } from "@/components/ui/ServiceWorkerRegister";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "@fontsource-variable/plus-jakarta-sans";
import "./globals.css";
import "./themes.css";

export const metadata: Metadata = {
  title: "GFB-STOCK",
  description: "GIE FASSO BARA — gestion de stock et facturation.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "GFB-STOCK",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#15803D",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning className={`h-full ${GeistSans.variable} ${GeistMono.variable}`}>
      <head>
        {/* Applique le thème mémorisé avant le premier affichage (pas de flash). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="h-full min-h-screen bg-bg font-sans text-text antialiased">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}

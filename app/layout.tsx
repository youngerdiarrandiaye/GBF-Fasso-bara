import type { Metadata, Viewport } from "next";
import { ServiceWorkerRegister } from "@/components/ui/ServiceWorkerRegister";
import "./globals.css";

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
  themeColor: "#16A34A",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className="h-full">
      <body className="h-full min-h-screen bg-bg font-sans text-text antialiased">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}

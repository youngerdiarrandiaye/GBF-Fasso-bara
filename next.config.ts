import type { NextConfig } from "next";

// En-têtes de sécurité appliqués à toutes les pages de l'application.
// Pas de Content-Security-Policy complète volontairement : Next.js (scripts
// inline d'hydratation), Supabase (URL variable selon l'environnement) et
// Tailwind la rendraient fragile ; `frame-ancestors` suffit contre le
// clickjacking. HSTS uniquement en production (HTTPS).
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]
    : []),
];

// Domaine public de Supabase (ex. https://api.mondomaine.sn derrière Caddy),
// figé au build via NEXT_PUBLIC_SUPABASE_URL : autorise next/image à servir
// les photos produit et le logo hors *.supabase.co.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseRemotePattern = (() => {
  try {
    if (!supabaseUrl) return [];
    const u = new URL(supabaseUrl);
    return [
      {
        protocol: u.protocol.replace(":", "") as "http" | "https",
        hostname: u.hostname,
        ...(u.port ? { port: u.port } : {}),
        pathname: "/storage/v1/object/**",
      },
    ];
  } catch {
    return [];
  }
})();

const nextConfig: NextConfig = {
  // Image Docker de production minimale (.next/standalone), cf. Dockerfile.
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Service worker : jamais mis en cache par le navigateur ou un CDN, pour
      // que chaque déploiement soit pris en compte (guide Next « PWAs »).
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
  images: {
    // Photos produit / logo entreprise servis depuis Supabase Storage
    // (buckets publics `produits-photos` et `logo`, cf.
    // supabase/migrations/0001_schema_initial.sql section 15). Motif
    // générique *.supabase.co : couvre tout projet Supabase hébergé sans
    // devoir committer l'URL exacte du projet dans le code applicatif.
    remotePatterns: [
      ...supabaseRemotePattern,
      // Hors production uniquement : Supabase hébergé et stack locale
      // (`supabase start`). En production, seul le domaine public de
      // NEXT_PUBLIC_SUPABASE_URL est autorisé.
      ...(process.env.NODE_ENV === "production"
        ? []
        : [
            {
              protocol: "https" as const,
              hostname: "*.supabase.co",
              pathname: "/storage/v1/object/**",
            },
            {
              protocol: "http" as const,
              hostname: "127.0.0.1",
              port: "54321",
              pathname: "/storage/v1/object/**",
            },
            {
              protocol: "http" as const,
              hostname: "127.0.0.1",
              port: "55321",
              pathname: "/storage/v1/object/**",
            },
          ]),
    ],
  },
};

export default nextConfig;

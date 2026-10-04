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

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  images: {
    // Photos produit / logo entreprise servis depuis Supabase Storage
    // (buckets publics `produits-photos` et `logo`, cf.
    // supabase/migrations/0001_schema_initial.sql section 15). Motif
    // générique *.supabase.co : couvre tout projet Supabase hébergé sans
    // devoir committer l'URL exacte du projet dans le code applicatif.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/**",
      },
      // Stack Supabase local (`supabase start`) : nécessaire uniquement en
      // développement, sans effet en production où l'URL réelle est
      // *.supabase.co ci-dessus.
      {
        protocol: "http",
        hostname: "127.0.0.1",
        port: "54321",
        pathname: "/storage/v1/object/**",
      },
      {
        protocol: "http",
        hostname: "127.0.0.1",
        port: "55321",
        pathname: "/storage/v1/object/**",
      },
    ],
  },
};

export default nextConfig;

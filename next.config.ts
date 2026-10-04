import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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

"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Client Supabase côté navigateur. Utilisé pour les lectures interactives
 * (autocomplétion client/produit, alerte de stock live) qui doivent rester
 * instantanées sans aller-retour Server Action — toujours soumis aux mêmes
 * policies RLS que le reste de l'application (aucune clé service_role ici).
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY doivent être définis (voir .env.local.example)."
    );
  }

  return createBrowserClient(url, anonKey);
}

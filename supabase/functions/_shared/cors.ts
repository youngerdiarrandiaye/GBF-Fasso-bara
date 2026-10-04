// supabase/functions/_shared/cors.ts
//
// En-têtes CORS communs à toutes les Edge Functions GFB-STOCK. Le frontend
// (Next.js) appelle ces fonctions directement depuis le navigateur via
// supabase-js (`supabase.functions.invoke(...)`), il faut donc gérer le
// pre-flight OPTIONS et autoriser l'en-tête Authorization.

//
// Origines autorisées (checklist sécurité 7.1) : plus de "*". La variable
// ALLOWED_ORIGINS (liste séparée par des virgules, ex.
// "https://gfb.exemple.sn") fixe les origines en production ; sans elle,
// seules les origines de développement local sont acceptées. Les appels
// serveur (pg_cron, Server Actions) n'envoient pas d'Origin : non concernés.
const ORIGINES_DEV = ["http://localhost:3000", "http://127.0.0.1:3000"];

function originesAutorisees(): string[] {
  const valeur = Deno.env.get("ALLOWED_ORIGINS");
  if (!valeur) return ORIGINES_DEV;
  return valeur.split(",").map((o) => o.trim()).filter(Boolean);
}

// Sans Access-Control-Allow-Origin : ajouté par `avecCors` selon la requête.
export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function handleCorsPreflight(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  return null;
}

export function jsonResponse(
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      ...extraHeaders,
    },
  });
}

/**
 * Enveloppe le handler d'une Edge Function : renvoie l'origine appelante dans
 * Access-Control-Allow-Origin uniquement si elle est autorisée (sinon le
 * navigateur bloque la lecture de la réponse).
 */
export function avecCors(
  handler: (req: Request) => Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    const reponse = await handler(req);
    const headers = new Headers(reponse.headers);
    const origine = req.headers.get("Origin");
    if (origine && originesAutorisees().includes(origine)) {
      headers.set("Access-Control-Allow-Origin", origine);
    }
    headers.append("Vary", "Origin");
    return new Response(reponse.body, { status: reponse.status, statusText: reponse.statusText, headers });
  };
}

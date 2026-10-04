// supabase/functions/_shared/cors.ts
//
// En-têtes CORS communs à toutes les Edge Functions GFB-STOCK. Le frontend
// (Next.js) appelle ces fonctions directement depuis le navigateur via
// supabase-js (`supabase.functions.invoke(...)`), il faut donc gérer le
// pre-flight OPTIONS et autoriser l'en-tête Authorization.

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
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

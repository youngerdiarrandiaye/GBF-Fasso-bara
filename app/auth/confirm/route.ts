import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Point d'arrivée des liens envoyés par e-mail (réinitialisation du mot de
 * passe). Deux formats acceptés :
 *  - `token_hash` + `type` : modèle d'e-mail du projet
 *    (supabase/templates/recovery.html), indépendant du navigateur d'origine ;
 *  - `code` : modèle Supabase par défaut (flux PKCE), qui exige d'ouvrir le
 *    lien dans le navigateur ayant fait la demande.
 * Ouvre une session puis redirige vers `next` (chemin interne uniquement).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next");
  // Refuse toute URL absolue ou « //hôte » : pas de redirection ouverte.
  const next =
    nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")
      ? nextParam
      : "/reinitialiser-mot-de-passe";

  const supabase = await createClient();
  let ok = false;

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    ok = !error;
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
  }

  if (!ok) {
    return NextResponse.redirect(new URL("/reinitialiser-mot-de-passe?lien=invalide", origin));
  }
  return NextResponse.redirect(new URL(next, origin));
}

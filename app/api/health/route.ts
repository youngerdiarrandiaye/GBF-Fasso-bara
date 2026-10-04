import { NextResponse } from "next/server";

/**
 * Route de santé minimale, utilisée uniquement par
 * `components/ui/NetworkStatusBanner.tsx` comme second signal de
 * connectivité (en complément des événements navigateur `online`/`offline`,
 * qui peuvent produire de faux positifs sur certains réseaux mobiles — voir
 * docs/toast-et-coherence-donnees.md §4f et §9 V3.2). Réponse volontairement
 * minimale, jamais mise en cache.
 */
export async function GET() {
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

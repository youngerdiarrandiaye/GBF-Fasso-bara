"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { traiterErreurAction } from "@/lib/actions/errors";
import type { StatutFacture } from "@/lib/supabase/database.types";

/**
 * Server Actions — Espace Admin / Factures (vue globale tous agents).
 *
 * Fichier séparé de lib/actions/factures.ts (propriété de dev-frontend-agent,
 * NE PAS modifier — annulerBrouillon y est réservé à l'agent propriétaire
 * d'un brouillon). Un admin peut annuler une facture à n'importe quel statut
 * non déjà terminal (policy `factures_admin_all`), y compris une facture déjà
 * `validee` : le trigger SQL `restaurer_stock_annulation()`
 * (0001_schema_initial.sql, section 14) restaure alors automatiquement le
 * stock et journalise l'action dans journal_activites
 * (action='annulation_facture') — cette action ne fait donc qu'un simple
 * UPDATE de statut, sans dupliquer aucune écriture.
 */

type ActionResult<T> = { data: T; error?: undefined } | { data?: undefined; error: string };

const STATUTS_ANNULABLES: StatutFacture[] = [
  "brouillon",
  "proforma",
  "validee",
  "payee_partielle",
];

export async function annulerFactureAdmin(
  factureId: string
): Promise<ActionResult<{ id: string; statut: StatutFacture }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée, veuillez vous reconnecter." };

  const { data: facture, error: erreurLecture } = await supabase
    .from("factures")
    .select("statut")
    .eq("id", factureId)
    .single();

  if (erreurLecture || !facture) {
    return { error: "Facture introuvable." };
  }

  if (!STATUTS_ANNULABLES.includes(facture.statut)) {
    return {
      error:
        facture.statut === "payee"
          ? "Impossible d'annuler une facture déjà entièrement payée. Enregistrez un avoir manuel si nécessaire."
          : "Cette facture est déjà annulée.",
    };
  }

  const { data, error } = await supabase
    .from("factures")
    .update({ statut: "annulee" })
    .eq("id", factureId)
    .select("id, statut")
    .single();

  if (error || !data) {
    return traiterErreurAction(
      "factures-admin.annulerFactureAdmin",
      error,
      "Impossible d'annuler cette facture."
    );
  }

  revalidatePath("/admin/factures");
  revalidatePath(`/admin/factures/${factureId}`);
  revalidatePath("/admin");
  revalidatePath("/admin/stock");
  return { data: { id: data.id, statut: data.statut } };
}

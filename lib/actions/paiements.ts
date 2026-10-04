"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { paiementSchema, type PaiementInput } from "@/lib/validations/schemas";
import { traiterErreurAction } from "@/lib/actions/errors";
import type { PaiementRow, StatutFacture } from "@/lib/supabase/database.types";

/**
 * Server Actions — Espace Admin / Paiements.
 *
 * Le statut de la facture (validee -> payee_partielle -> payee) est
 * recalculé automatiquement par le trigger SQL `appliquer_paiement()`
 * (0001_schema_initial.sql, section 11) dès l'INSERT dans `paiements` :
 * cette action ne recalcule et n'écrit JAMAIS `factures.statut` elle-même,
 * conformément à la consigne explicite de la Phase 4b.
 *
 * Signalé à expert-securite pour audit : ce fichier écrit sur la table
 * paiements (données financières sensibles).
 */

type ActionResult<T> = { data: T; error?: undefined } | { data?: undefined; error: string };

/**
 * Contrat de retour enrichi (docs/toast-et-coherence-donnees.md §9 V3.5) :
 * en plus de la ligne `paiements` insérée, la facture est relue juste après
 * pour exposer le statut à jour et le reste à payer — tous deux déjà
 * recalculés côté SQL par le trigger `appliquer_paiement()` déclenché par cet
 * INSERT. C'est une lecture de données déjà calculées par le serveur, jamais
 * un recalcul côté client (règle 4d) : le modal appelant n'a donc plus besoin
 * de soustraire `resteAPayer - montant` lui-même pour distinguer un paiement
 * partiel d'un solde complet.
 */
export interface ResultatPaiement {
  paiement: PaiementRow;
  factureStatut: StatutFacture;
  resteAPayer: number;
}

export async function enregistrerPaiement(
  input: PaiementInput
): Promise<ActionResult<ResultatPaiement>> {
  const parsed = paiementSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Paiement invalide." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée, veuillez vous reconnecter." };

  const { facture_id, montant, mode_paiement, reference, date_paiement } = parsed.data;

  const { data, error } = await supabase
    .from("paiements")
    .insert({
      facture_id,
      montant,
      mode_paiement,
      reference: reference || null,
      date_paiement,
      utilisateur_id: user.id,
    })
    .select("*")
    .single();

  if (error) {
    // "Impossible d'enregistrer un paiement sur une facture au statut X" est
    // le message levé par le trigger appliquer_paiement() lorsque la facture
    // n'est pas encore validee/payee_partielle : whitelisté ici (pas de fuite
    // de détail d'implémentation, juste la règle métier utile à l'admin).
    if (error.message?.includes("Impossible d'enregistrer un paiement")) {
      return { error: error.message };
    }
    return traiterErreurAction(
      "paiements.enregistrerPaiement",
      error,
      "Impossible d'enregistrer ce paiement."
    );
  }

  revalidatePath("/admin/paiements");
  revalidatePath("/admin/factures");
  revalidatePath(`/admin/factures/${facture_id}`);
  revalidatePath("/admin");

  // Relit la facture : le trigger appliquer_paiement() a déjà recalculé son
  // statut au moment où l'INSERT ci-dessus a réussi. Lecture seule des
  // données déjà écrites côté SQL, jamais un recalcul du reste à payer côté
  // serveur ici — même garantie que la règle 4d appliquée aux deux écrans
  // qui affichent déjà ce chiffre (docs/toast-et-coherence-donnees.md §9 V3.5).
  const [{ data: factureRow }, { data: paiementsRows }, { data: creditsRows }] = await Promise.all([
    supabase.from("factures").select("statut, total_general").eq("id", facture_id).single(),
    supabase.from("paiements").select("montant").eq("facture_id", facture_id),
    supabase.from("credits").select("montant_rembourse").eq("facture_id", facture_id),
  ]);

  const totalPaiements = (paiementsRows ?? []).reduce((somme, p) => somme + p.montant, 0);
  const totalRecouvre = (creditsRows ?? []).reduce((somme, c) => somme + c.montant_rembourse, 0);
  const totalPaye = totalPaiements + totalRecouvre;
  const resteAPayer = factureRow ? Math.max(0, factureRow.total_general - totalPaye) : 0;
  const factureStatut = (factureRow?.statut as StatutFacture | undefined) ?? "payee_partielle";

  return {
    data: {
      paiement: data as PaiementRow,
      factureStatut,
      resteAPayer,
    },
  };
}

export async function supprimerPaiement(
  id: string,
  factureId: string
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée, veuillez vous reconnecter." };

  const { error } = await supabase.from("paiements").delete().eq("id", id);
  if (error) {
    return traiterErreurAction(
      "paiements.supprimerPaiement",
      error,
      "Impossible de supprimer ce paiement."
    );
  }

  revalidatePath("/admin/paiements");
  revalidatePath("/admin/factures");
  revalidatePath(`/admin/factures/${factureId}`);
  return { data: { id } };
}

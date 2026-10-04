"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  remboursementCreditSchema,
  ouvrirCreditSchema,
  type RemboursementCreditInput,
  type OuvrirCreditInput,
} from "@/lib/validations/schemas";
import { traiterErreurAction } from "@/lib/actions/errors";
import type { CreditRow, RemboursementCreditRow, StatutCredit } from "@/lib/supabase/database.types";

/**
 * Server Actions — Espace Admin / Crédits & Recouvrement (règles métier
 * 11-14, supabase/migrations/0013_avenant_credit_entrepots.sql sections
 * 7-8). L'ouverture d'un crédit reste hors périmètre de cet écran (Espace
 * Agent, "Vendre à crédit" — cf. `ouvrirCreditSchema`, propriété de
 * dev-frontend-agent) : cet écran ne fait qu'enregistrer les remboursements
 * ("caisse du soir") sur un crédit déjà `en_cours`.
 *
 * Le cumul `montant_rembourse`/le statut (`en_cours` -> `solde`) sont
 * exclusivement recalculés par le trigger SQL `appliquer_remboursement()`
 * (section 8) dès l'INSERT dans `remboursements_credit` — cette action ne
 * recalcule et n'écrit JAMAIS `credits.statut`/`credits.montant_rembourse`
 * elle-même, même principe que `enregistrerPaiement()` (lib/actions/paiements.ts)
 * pour les factures.
 *
 * Signalé à expert-securite pour audit : ce fichier écrit sur la table
 * remboursements_credit (données financières sensibles), et lit
 * indirectement le solde de crédit de chaque client.
 */

type ActionResult<T> = { data: T; error?: undefined } | { data?: undefined; error: string };

/**
 * Contrat de retour enrichi (même pattern que `ResultatPaiement`,
 * lib/actions/paiements.ts) : la ligne `credits` est relue juste après
 * l'INSERT pour exposer le statut et le cumul déjà recalculés côté SQL par
 * `appliquer_remboursement()` — jamais un recalcul côté client (règle 4d). Le
 * nom du client accompagne directement le résultat pour permettre au modal
 * appelant de construire les deux toasts exacts demandés par le brief sans
 * requête supplémentaire.
 */
export interface ResultatRemboursement {
  remboursement: RemboursementCreditRow;
  creditStatut: StatutCredit;
  montantRembourseCumule: number;
  montantTotal: number;
  clientNom: string;
}

export async function enregistrerRemboursement(
  input: RemboursementCreditInput
): Promise<ActionResult<ResultatRemboursement>> {
  const parsed = remboursementCreditSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Recouvrement invalide." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée, veuillez vous reconnecter." };

  const { credit_id, montant, date_remboursement, notes } = parsed.data;

  const { data, error } = await supabase
    .from("remboursements_credit")
    .insert({
      credit_id,
      montant,
      date_remboursement,
      notes: notes || null,
      utilisateur_id: user.id,
    })
    .select("*")
    .single();

  if (error) {
    // Messages levés explicitement par le trigger appliquer_remboursement()
    // (migration 0013 section 8) : whitelistés ici, pas de fuite de détail
    // d'implémentation, langage métier déjà visible dans l'UI.
    if (error.message?.includes("Impossible d'enregistrer un remboursement sur un crédit au statut")) {
      return { error: "Ce crédit est déjà soldé — aucun nouveau remboursement ne peut y être ajouté." };
    }
    if (error.message?.includes("dépasserait le montant total du crédit")) {
      return { error: "Ce montant dépasserait le solde restant dû sur ce crédit. Vérifiez le montant saisi." };
    }
    return traiterErreurAction(
      "credits.enregistrerRemboursement",
      error,
      "Impossible d'enregistrer ce recouvrement."
    );
  }

  revalidatePath("/admin/credits");
  revalidatePath(`/admin/credits/${credit_id}`);
  revalidatePath("/admin");

  // Relecture : le trigger appliquer_remboursement() a déjà recalculé
  // montant_rembourse/statut au moment où l'INSERT ci-dessus a réussi.
  const { data: creditRow, error: erreurRelecture } = await supabase
    .from("credits")
    .select("statut, montant_rembourse, montant_total, facture_id, client:clients(nom)")
    .eq("id", credit_id)
    .single();

  if (erreurRelecture || !creditRow) {
    return traiterErreurAction(
      "credits.enregistrerRemboursement.relecture",
      erreurRelecture,
      "Le recouvrement a été enregistré mais le crédit n'a pas pu être rechargé."
    );
  }

  const client = creditRow.client as unknown as { nom: string } | null;

  revalidatePath("/admin/factures");
  if (creditRow.facture_id) revalidatePath(`/admin/factures/${creditRow.facture_id}`);

  return {
    data: {
      remboursement: data as RemboursementCreditRow,
      creditStatut: creditRow.statut as StatutCredit,
      montantRembourseCumule: creditRow.montant_rembourse,
      montantTotal: creditRow.montant_total,
      clientNom: client?.nom ?? "ce client",
    },
  };
}

/**
 * Ouverture d'un crédit (Espace Agent, "Vendre à crédit" sur Nouvelle
 * facture — dev-frontend-agent, Phase C) — ajoutée dans ce même fichier
 * plutôt que dans un fichier séparé pour garder toute l'écriture sur la
 * table `credits` au même endroit (cf. commentaire d'en-tête ci-dessus, qui
 * annonçait explicitement ce point d'extension).
 *
 * Appelée UNIQUEMENT au moment de "Valider (facture définitive)" (jamais
 * pour un brouillon/proforma, cf. NouvelleFactureForm.tsx) et SEULEMENT
 * après qu'un pré-contrôle côté client (immédiat, non bloquant côté BDD) a
 * déjà vérifié que ce client n'a pas de crédit `en_cours` et que le montant
 * ne dépasserait pas `entreprise_config.seuil_credit_max`. Ce pré-contrôle
 * ne remplace JAMAIS le trigger serveur `bloquer_nouveau_credit()`
 * (migration 0013 section 7), seul juge final : cet INSERT peut donc encore
 * échouer ici (état client périmé, course concurrente) — les deux messages
 * whitelistés correspondants vivent dans lib/actions/errors.ts
 * (REGEX_CREDIT_DEJA_EN_COURS / REGEX_CREDIT_SEUIL_DEPASSE).
 *
 * Ordre d'appel côté formulaire : enregistrerBrouillon() (facture encore en
 * brouillon) -> ouvrirCreditPourFacture() -> seulement si succès,
 * validerFacture(id, "validee"). Si l'ouverture du crédit échoue, la facture
 * reste au statut brouillon (jamais validée sans crédit associé quand
 * l'agent a explicitement demandé une vente à crédit) — l'agent peut
 * décocher "Vendre à crédit" et valider en comptant, ou corriger la
 * situation puis réessayer.
 */
export async function ouvrirCreditPourFacture(
  input: OuvrirCreditInput
): Promise<{ data: { credit: CreditRow }; error?: undefined } | { data?: undefined; error: string }> {
  const parsed = ouvrirCreditSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Crédit invalide." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée, veuillez vous reconnecter." };

  const { client_id, facture_id, montant_total, frequence_echeance } = parsed.data;

  const { data, error } = await supabase
    .from("credits")
    .insert({ client_id, facture_id, montant_total, frequence_echeance, agent_id: user.id })
    .select("*")
    .single();

  if (error || !data) {
    return traiterErreurAction(
      "credits.ouvrirCreditPourFacture",
      error ?? "no rows",
      "Impossible d'ouvrir un crédit pour cette facture."
    );
  }

  revalidatePath("/mes-factures");
  revalidatePath("/");
  revalidatePath("/admin/credits");
  return { data: { credit: data as CreditRow } };
}

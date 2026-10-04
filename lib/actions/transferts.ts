"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { transfertStockSchema, type TransfertStockInput } from "@/lib/validations/schemas";
import { traiterErreurAction } from "@/lib/actions/errors";
import type { TransfertStockRow } from "@/lib/supabase/database.types";

/**
 * Server Actions — Espace Admin / Transferts de stock inter-entrepôts (règle
 * métier 16, supabase/migrations/0013_avenant_credit_entrepots.sql section
 * 4/15.8). Cycle `demande -> en_transit -> receptionne` (+ `annule`), chaque
 * transition validée par le trigger `traiter_transfert_stock()` côté base
 * (décrément/incrément de `stock_entrepot`, vérification de disponibilité) —
 * cette Server Action ne fait jamais ce calcul elle-même, uniquement l'appel
 * UPDATE et la traduction des messages d'erreur du trigger.
 *
 * RLS (migration 0013 section 4) : SEUL l'admin peut faire progresser un
 * transfert (aucune policy UPDATE pour l'agent, y compris pour la simple
 * réception de sa propre demande) — cohérent avec le brief "réceptionner un
 * transfert (admin only)". Un agent authentifié qui appellerait ces actions
 * se verrait refuser l'UPDATE par RLS (0 ligne affectée) avant même d'écrire
 * quoi que ce soit.
 */

type ActionResult<T> = { data: T; error?: undefined } | { data?: undefined; error: string };

const REGEX_STOCK_INSUFFISANT_TRANSFERT =
  /Stock insuffisant pour transférer "(.+?)" depuis l'entrepôt source : disponible ([\d.,]+), demandé ([\d.,]+)/;

function traduireErreurTransfert(messageBrut: string): string | undefined {
  const matchStock = messageBrut.match(REGEX_STOCK_INSUFFISANT_TRANSFERT);
  if (matchStock) {
    const [, produitNom, disponible, demande] = matchStock;
    return `Stock insuffisant pour transférer "${produitNom}" depuis l'entrepôt source : ${disponible} disponible(s), ${demande} demandé(s).`;
  }
  const messagesWhitelistes = [
    "L'entrepôt source et l'entrepôt destination doivent être différents",
    "Un transfert déjà réceptionné est définitif : créez un nouveau transfert en sens inverse pour le corriger",
    "Un transfert annulé ne peut plus changer de statut",
  ];
  const trouve = messagesWhitelistes.find((m) => messageBrut.includes(m));
  return trouve;
}

export async function creerDemandeTransfert(
  input: TransfertStockInput
): Promise<ActionResult<TransfertStockRow>> {
  const parsed = transfertStockSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Demande de transfert invalide." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée, veuillez vous reconnecter." };

  const { produit_id, entrepot_source_id, entrepot_destination_id, quantite, notes } = parsed.data;

  const { data, error } = await supabase
    .from("transferts_stock")
    .insert({
      produit_id,
      entrepot_source_id,
      entrepot_destination_id,
      quantite,
      notes: notes || null,
      demande_par_id: user.id,
    })
    .select("*")
    .single();

  if (error) {
    const traduit = traduireErreurTransfert(error.message ?? "");
    if (traduit) return { error: traduit };
    if (error.code === "23514") {
      return { error: "L'entrepôt source et l'entrepôt destination doivent être différents." };
    }
    return traiterErreurAction(
      "transferts.creerDemandeTransfert",
      error,
      "Impossible de créer cette demande de transfert."
    );
  }

  revalidatePath("/admin/transferts");
  revalidatePath("/admin/entrepots");
  return { data: data as TransfertStockRow };
}

async function changerStatutTransfert(
  id: string,
  statut: "en_transit" | "receptionne" | "annule",
  contexte: string,
  messageParDefaut: string
): Promise<ActionResult<TransfertStockRow>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée, veuillez vous reconnecter." };

  const { data, error } = await supabase
    .from("transferts_stock")
    .update({ statut })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    const traduit = traduireErreurTransfert(error.message ?? "");
    if (traduit) return { error: traduit };
    return traiterErreurAction(contexte, error, messageParDefaut);
  }

  if (!data) {
    return { error: "Transfert introuvable ou action non autorisée." };
  }

  revalidatePath("/admin/transferts");
  revalidatePath("/admin/entrepots");
  revalidatePath("/admin/stock");
  return { data: data as TransfertStockRow };
}

/** demande -> en_transit : décrémente le stock source (trigger `traiter_transfert_stock`). */
export async function marquerTransfertEnTransit(id: string): Promise<ActionResult<TransfertStockRow>> {
  return changerStatutTransfert(
    id,
    "en_transit",
    "transferts.marquerTransfertEnTransit",
    "Impossible de faire partir ce transfert."
  );
}

/** en_transit -> receptionne : incrémente le stock destination (état terminal, admin only). */
export async function receptionnerTransfert(id: string): Promise<ActionResult<TransfertStockRow>> {
  return changerStatutTransfert(
    id,
    "receptionne",
    "transferts.receptionnerTransfert",
    "Impossible de réceptionner ce transfert."
  );
}

/** Annulation — autorisée uniquement depuis 'demande' ou 'en_transit' (jamais depuis 'receptionne', état terminal, cf. TransfertStatusBadge). */
export async function annulerTransfert(id: string): Promise<ActionResult<TransfertStockRow>> {
  return changerStatutTransfert(
    id,
    "annule",
    "transferts.annulerTransfert",
    "Impossible d'annuler ce transfert."
  );
}

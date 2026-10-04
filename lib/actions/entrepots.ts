"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  entrepotSchema,
  ajustementStockEntrepotSchema,
  seuilAlerteEntrepotSchema,
  type EntrepotInput,
  type AjustementStockEntrepotInput,
  type SeuilAlerteEntrepotInput,
} from "@/lib/validations/schemas";
import { traiterErreurAction } from "@/lib/actions/errors";
import type { EntrepotRow, StockEntrepotRow } from "@/lib/supabase/database.types";

/**
 * Server Actions — Espace Admin / Entrepôts & stock par entrepôt (règle
 * métier 16, supabase/migrations/0013_avenant_credit_entrepots.sql).
 *
 * Fichier séparé de lib/actions/produits.ts (stock V1, propriété conjointe
 * historique) pour éviter tout conflit d'édition avec dev-frontend-agent, qui
 * travaille en parallèle sur les mêmes migrations/design system côté
 * app/(agent)/ et components/agent/.
 *
 * Toute écriture passe par le client Supabase authentifié (cookies de
 * session), jamais service_role : `entrepots` reste filtrée par
 * `entrepots_admin_all` (admin only en écriture), et `stock_entrepot` n'est
 * JAMAIS modifiable par un chemin autre que les RPC SECURITY DEFINER
 * `ajuster_stock_manuel_entrepot()`/`definir_seuil_alerte_entrepot()` (aucun
 * GRANT UPDATE table-level, cf. migration 0013 section 16) — ces deux RPC
 * vérifient is_admin() en interne, un agent qui les appellerait recevrait une
 * exception explicite "Réservé aux administrateurs", jamais un accès
 * silencieux.
 *
 * Signalé à expert-securite pour audit : ce fichier écrit sur les tables
 * entrepots, stock_entrepot (via RPC) et, indirectement (trigger SQL), sur
 * mouvements_stock / journal_activites.
 */

type ActionResult<T> = { data: T; error?: undefined } | { data?: undefined; error: string };

export async function creerEntrepot(input: EntrepotInput): Promise<ActionResult<EntrepotRow>> {
  const parsed = entrepotSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Entrepôt invalide." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée, veuillez vous reconnecter." };

  const { nom, adresse, actif } = parsed.data;
  const { data, error } = await supabase
    .from("entrepots")
    .insert({ nom, adresse: adresse || null, actif })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { error: "Un entrepôt porte déjà ce nom — choisissez-en un autre." };
    }
    return traiterErreurAction("entrepots.creerEntrepot", error, "Impossible de créer cet entrepôt.");
  }

  revalidatePath("/admin/entrepots");
  return { data: data as EntrepotRow };
}

export async function modifierEntrepot(
  id: string,
  input: EntrepotInput
): Promise<ActionResult<EntrepotRow>> {
  const parsed = entrepotSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Entrepôt invalide." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée, veuillez vous reconnecter." };

  const { nom, adresse, actif } = parsed.data;
  const { data, error } = await supabase
    .from("entrepots")
    .update({ nom, adresse: adresse || null, actif })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { error: "Un entrepôt porte déjà ce nom — choisissez-en un autre." };
    }
    return traiterErreurAction("entrepots.modifierEntrepot", error, "Impossible de modifier cet entrepôt.");
  }

  revalidatePath("/admin/entrepots");
  revalidatePath(`/admin/entrepots/${id}`);
  return { data: data as EntrepotRow };
}

/**
 * Ajustement manuel de stock PAR ENTREPÔT — mirroir exact de
 * `produits.ajusterStock()` (V1, RPC `ajuster_stock_manuel`, désormais
 * dépréciée par la migration 0013), mais via `ajuster_stock_manuel_entrepot`
 * (produit_id, entrepot_id, nouvelle_quantite, motif) — seul chemin
 * d'écriture pour `stock_entrepot.quantite_stock`. Motif obligatoire (exigé
 * côté serveur par la RPC elle-même, pas seulement par Zod) : toute action
 * sensible d'ajustement de stock passe par cette Server Action, jamais
 * directement depuis un composant client.
 */
export async function ajusterStockEntrepot(
  input: AjustementStockEntrepotInput
): Promise<ActionResult<{ stock: StockEntrepotRow }>> {
  const parsed = ajustementStockEntrepotSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Ajustement invalide." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée, veuillez vous reconnecter." };

  const { produit_id, entrepot_id, nouvelle_quantite, motif } = parsed.data;

  const { error: rpcError } = await supabase
    .rpc("ajuster_stock_manuel_entrepot", {
      p_produit_id: produit_id,
      p_entrepot_id: entrepot_id,
      p_nouvelle_quantite: nouvelle_quantite,
      p_motif: motif,
    })
    .single();

  if (rpcError) {
    // Messages levés explicitement par la RPC (RAISE EXCEPTION, migration
    // 0013 section 15.1) : sûrs à renvoyer tels quels, langage métier déjà
    // visible dans l'UI (motif, quantité, rôle) — aucun détail d'implémentation.
    const messagesWhitelistes = new Set([
      "Réservé aux administrateurs",
      "Le motif est obligatoire pour un ajustement de stock",
      "La nouvelle quantité en stock ne peut pas être négative",
      "La nouvelle quantité est identique au stock actuel : aucun ajustement à enregistrer",
    ]);
    const messageBrut = rpcError.message ?? "";
    if (messagesWhitelistes.has(messageBrut)) {
      return { error: messageBrut };
    }
    return traiterErreurAction(
      "entrepots.ajusterStockEntrepot",
      rpcError,
      "Impossible d'ajuster le stock de ce produit dans cet entrepôt."
    );
  }

  const { data: stock, error: erreurRelecture } = await supabase
    .from("stock_entrepot")
    .select("*")
    .eq("produit_id", produit_id)
    .eq("entrepot_id", entrepot_id)
    .single();

  if (erreurRelecture || !stock) {
    return traiterErreurAction(
      "entrepots.ajusterStockEntrepot.relecture",
      erreurRelecture,
      "Le stock a été ajusté mais n'a pas pu être rechargé."
    );
  }

  revalidatePath("/admin/entrepots");
  revalidatePath(`/admin/entrepots/${entrepot_id}`);
  revalidatePath("/admin/stock");
  revalidatePath(`/admin/stock/${produit_id}`);
  revalidatePath("/admin");
  return { data: { stock: stock as StockEntrepotRow } };
}

/** Modification du seuil d'alerte PAR ENTREPÔT — RPC dédiée `definir_seuil_alerte_entrepot`, jamais un mouvement de stock (migration 0013 section 15.2). */
export async function definirSeuilAlerteEntrepot(
  input: SeuilAlerteEntrepotInput
): Promise<ActionResult<{ stock: StockEntrepotRow }>> {
  const parsed = seuilAlerteEntrepotSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Seuil invalide." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée, veuillez vous reconnecter." };

  const { produit_id, entrepot_id, seuil } = parsed.data;

  const { error: rpcError } = await supabase.rpc("definir_seuil_alerte_entrepot", {
    p_produit_id: produit_id,
    p_entrepot_id: entrepot_id,
    p_seuil: seuil,
  });

  if (rpcError) {
    const messagesWhitelistes = new Set([
      "Réservé aux administrateurs",
      "Le seuil d'alerte ne peut pas être négatif",
    ]);
    const messageBrut = rpcError.message ?? "";
    if (messagesWhitelistes.has(messageBrut)) {
      return { error: messageBrut };
    }
    return traiterErreurAction(
      "entrepots.definirSeuilAlerteEntrepot",
      rpcError,
      "Impossible de modifier le seuil d'alerte de ce produit dans cet entrepôt."
    );
  }

  const { data: stock, error: erreurRelecture } = await supabase
    .from("stock_entrepot")
    .select("*")
    .eq("produit_id", produit_id)
    .eq("entrepot_id", entrepot_id)
    .single();

  if (erreurRelecture || !stock) {
    return traiterErreurAction(
      "entrepots.definirSeuilAlerteEntrepot.relecture",
      erreurRelecture,
      "Le seuil a été modifié mais le stock n'a pas pu être rechargé."
    );
  }

  revalidatePath("/admin/entrepots");
  revalidatePath(`/admin/entrepots/${entrepot_id}`);
  return { data: { stock: stock as StockEntrepotRow } };
}

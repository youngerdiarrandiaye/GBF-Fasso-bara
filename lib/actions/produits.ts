"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  ajustementStockSchema,
  categorieProduitSchema,
  produitSchema,
  type AjustementStockInput,
  type CategorieProduitInput,
  type ProduitInput,
} from "@/lib/validations/schemas";
import { traiterErreurAction } from "@/lib/actions/errors";
import type { CategorieProduitRow, ProduitRow } from "@/lib/supabase/database.types";

/**
 * Server Actions — Espace Admin / Stock & catalogue produit.
 *
 * Fichier séparé de lib/actions/factures.ts (propriété de dev-frontend-agent)
 * pour éviter tout conflit d'édition simultané, conformément à la consigne de
 * méthode de la Phase 4b.
 *
 * Toute écriture passe par le client Supabase authentifié (cookies de
 * session) — jamais service_role — donc reste filtrée par les policies RLS
 * (`produits_admin_all`, `categories_produits_admin_all`) : un agent qui
 * appellerait ces fonctions par erreur se ferait refuser l'écriture par RLS,
 * qui reste la garantie ultime.
 *
 * Signalé à expert-securite pour audit : ce fichier écrit sur les tables
 * produits, categories_produits et (indirectement, via trigger SQL) sur
 * mouvements_stock / journal_activites.
 */

type ActionResult<T> = { data: T; error?: undefined } | { data?: undefined; error: string };

export async function creerProduit(input: ProduitInput): Promise<ActionResult<ProduitRow>> {
  const parsed = produitSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Produit invalide." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée, veuillez vous reconnecter." };

  const v = parsed.data;
  const { data, error } = await supabase
    .from("produits")
    .insert({
      // `code` volontairement omis : généré côté serveur au format GBF-XX
      // par le trigger `generer_code_produit()` (BEFORE INSERT, voir
      // 0012_generation_code_produit.sql) — toute valeur envoyée ici serait
      // de toute façon ignorée si vide/absente, cohérent avec le formulaire
      // qui n'en envoie plus.
      nom: v.nom,
      description: v.description || null,
      categorie_id: v.categorie_id || null,
      unite: v.unite,
      type_ligne_produit: v.type_ligne_produit,
      kit_parent_id: v.type_ligne_produit === "inclus_dans_kit" ? v.kit_parent_id || null : null,
      prix_unitaire: v.type_ligne_produit === "inclus_dans_kit" ? null : (v.prix_unitaire ?? 0),
      quantite_stock: v.quantite_stock,
      seuil_alerte: v.seuil_alerte,
      photos_urls: v.photos_urls,
      actif: v.actif,
    })
    .select("*")
    .single();

  if (error) {
    return traiterErreurAction(
      "produits.creerProduit",
      error,
      "Impossible de créer ce produit (code déjà utilisé ou données invalides)."
    );
  }

  revalidatePath("/admin/stock");
  return { data: data as ProduitRow };
}

export async function modifierProduit(
  id: string,
  input: ProduitInput
): Promise<ActionResult<ProduitRow>> {
  const parsed = produitSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Produit invalide." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée, veuillez vous reconnecter." };

  const v = parsed.data;
  const { data, error } = await supabase
    .from("produits")
    .update({
      // `code` volontairement exclu : généré une fois pour toutes à la
      // création (trigger `generer_code_produit()`), jamais modifiable
      // ensuite — même logique d'immutabilité que `factures.numero`.
      nom: v.nom,
      description: v.description || null,
      categorie_id: v.categorie_id || null,
      unite: v.unite,
      type_ligne_produit: v.type_ligne_produit,
      kit_parent_id: v.type_ligne_produit === "inclus_dans_kit" ? v.kit_parent_id || null : null,
      prix_unitaire: v.type_ligne_produit === "inclus_dans_kit" ? null : (v.prix_unitaire ?? 0),
      seuil_alerte: v.seuil_alerte,
      photos_urls: v.photos_urls,
      actif: v.actif,
      // quantite_stock volontairement exclu de cette mutation générique : tout
      // changement de stock doit passer par ajusterStock() ci-dessous, seul
      // chemin qui impose un motif et reste cohérent avec le trigger SQL
      // gerer_ajustement_stock_manuel() (voir commentaire détaillé).
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return traiterErreurAction(
      "produits.modifierProduit",
      error,
      "Impossible de modifier ce produit."
    );
  }

  revalidatePath("/admin/stock");
  revalidatePath(`/admin/stock/${id}`);
  return { data: data as ProduitRow };
}

/**
 * Ajustement manuel de stock — écran Stock, formulaire avec motif obligatoire.
 *
 * MIGRATION 0010 (audit sécurité du 2026-08-13, supabase/migrations/
 * 0010_verrouillage_ajustement_stock.sql) : `produits.quantite_stock` n'est
 * PLUS modifiable par un UPDATE direct pour le rôle `authenticated` (le
 * privilège colonne a été révoqué au niveau SQL, admin compris — même
 * l'ancienne policy `produits_admin_all` ne suffit plus, le GRANT/REVOKE
 * colonne par colonne est un filtre orthogonal et cumulatif avec RLS). Le
 * SEUL chemin désormais possible pour faire varier le stock hors validation/
 * annulation de facture est la fonction RPC SECURITY DEFINER
 * `ajuster_stock_manuel(p_produit_id uuid, p_nouvelle_quantite numeric,
 * p_motif text)`, qui :
 *   - vérifie is_admin() en interne (un agent reçoit une exception explicite,
 *     jamais un accès silencieux) ;
 *   - exige un motif non vide (sinon exception) ;
 *   - relit la quantité réellement en base avec un verrou `FOR UPDATE`
 *     (protection contre une race condition entre deux ajustements
 *     concurrents : le second s'applique toujours sur la valeur réelle au
 *     moment de sa validation, jamais sur une valeur obsolète capturée avant
 *     l'appel) ;
 *   - insère elle-même l'unique ligne `mouvements_stock` avec le motif réel
 *     et l'unique ligne `journal_activites` (plus besoin du second UPDATE
 *     correctif qu'exigeait l'ancienne implémentation basée sur le trigger
 *     générique `gerer_ajustement_stock_manuel`, neutralisé côté SQL pour cet
 *     appel via le même flag de session que decrementer_stock()/
 *     restaurer_stock_annulation()).
 * Cette Server Action ne fait donc plus qu'un seul aller-retour réseau (RPC)
 * suivi d'une relecture de la fiche produit à jour, au lieu des quatre
 * requêtes précédentes (SELECT avant + UPDATE + SELECT mouvement + UPDATE
 * motif).
 */
export async function ajusterStock(
  input: AjustementStockInput
): Promise<ActionResult<{ produit: ProduitRow }>> {
  const parsed = ajustementStockSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Ajustement invalide." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée, veuillez vous reconnecter." };

  const { produit_id, nouvelle_quantite, motif } = parsed.data;

  const { error: rpcError } = await supabase
    .rpc("ajuster_stock_manuel", {
      p_produit_id: produit_id,
      p_nouvelle_quantite: nouvelle_quantite,
      p_motif: motif,
    })
    .single();

  if (rpcError) {
    // Messages levés explicitement par la RPC (RAISE EXCEPTION) : sûrs à
    // renvoyer tels quels au client, ils ne contiennent aucun détail
    // d'implémentation (pas de nom de colonne/contrainte/table) — seulement
    // du langage métier déjà visible dans l'UI (motif, quantité, rôle).
    const messagesWhitelistes = new Set([
      "Réservé aux administrateurs",
      "Le motif est obligatoire pour un ajustement de stock",
      "La nouvelle quantité en stock ne peut pas être négative",
      "La nouvelle quantité est identique au stock actuel : aucun ajustement à enregistrer",
    ]);
    const messageBrut = rpcError.message ?? "";
    if (messagesWhitelistes.has(messageBrut) || messageBrut.startsWith("Produit introuvable")) {
      return { error: messageBrut };
    }
    return traiterErreurAction(
      "produits.ajusterStock",
      rpcError,
      "Impossible d'ajuster le stock de ce produit."
    );
  }

  // La RPC ne renvoie que (ancienne_quantite, nouvelle_quantite) : on relit
  // la fiche produit complète pour conserver le contrat de retour existant
  // (ActionResult<{ produit: ProduitRow }>) attendu par les appelants.
  const { data: produit, error: erreurRelecture } = await supabase
    .from("produits")
    .select("*")
    .eq("id", produit_id)
    .single();

  if (erreurRelecture || !produit) {
    return traiterErreurAction(
      "produits.ajusterStock",
      erreurRelecture,
      "Le stock a été ajusté mais la fiche produit n'a pas pu être rechargée."
    );
  }

  revalidatePath("/admin/stock");
  revalidatePath(`/admin/stock/${produit_id}`);
  revalidatePath("/admin");
  return { data: { produit: produit as ProduitRow } };
}

/**
 * Désactive un produit directement depuis la fiche produit (sans passer par
 * le formulaire de modification complet). Ne touche JAMAIS `quantite_stock`
 * (hors périmètre de cette action — verrouillage RPC 0010 inchangé) : seule
 * la colonne `actif`, librement modifiable par `produits_admin_all`, est
 * écrite ici.
 *
 * Avant d'écrire, compte le nombre de `lignes_facture` référençant ce
 * produit (historique de ventes) pour permettre à l'appelant d'afficher un
 * message d'information ("désactivé, pas supprimé, pour préserver
 * l'historique") — jamais un nombre inventé côté client.
 */
export async function desactiverProduit(
  id: string
): Promise<ActionResult<{ produit: ProduitRow; nombreFactures: number }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée, veuillez vous reconnecter." };

  const { count } = await supabase
    .from("lignes_facture")
    .select("id", { count: "exact", head: true })
    .eq("produit_id", id);

  const { data, error } = await supabase
    .from("produits")
    .update({ actif: false })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return traiterErreurAction(
      "produits.desactiverProduit",
      error,
      "Impossible de désactiver ce produit."
    );
  }

  revalidatePath("/admin/stock");
  revalidatePath(`/admin/stock/${id}`);
  return { data: { produit: data as ProduitRow, nombreFactures: count ?? 0 } };
}

export async function reactiverProduit(id: string): Promise<ActionResult<ProduitRow>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée, veuillez vous reconnecter." };

  const { data, error } = await supabase
    .from("produits")
    .update({ actif: true })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return traiterErreurAction(
      "produits.reactiverProduit",
      error,
      "Impossible de réactiver ce produit."
    );
  }

  revalidatePath("/admin/stock");
  revalidatePath(`/admin/stock/${id}`);
  return { data: data as ProduitRow };
}

export async function creerCategorie(
  input: CategorieProduitInput
): Promise<ActionResult<CategorieProduitRow>> {
  const parsed = categorieProduitSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Catégorie invalide." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée, veuillez vous reconnecter." };

  const { data, error } = await supabase
    .from("categories_produits")
    .insert({ nom: parsed.data.nom })
    .select("*")
    .single();

  if (error) {
    return traiterErreurAction(
      "produits.creerCategorie",
      error,
      "Impossible de créer cette catégorie (nom déjà utilisé ?)."
    );
  }

  revalidatePath("/admin/parametres");
  revalidatePath("/admin/stock");
  revalidatePath("/admin/stock/nouveau");
  return { data: data as CategorieProduitRow };
}

export async function supprimerCategorie(id: string): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée, veuillez vous reconnecter." };

  const { error } = await supabase.from("categories_produits").delete().eq("id", id);
  if (error) {
    return traiterErreurAction(
      "produits.supprimerCategorie",
      error,
      "Impossible de supprimer cette catégorie (peut-être encore utilisée par des produits)."
    );
  }

  revalidatePath("/admin/parametres");
  return { data: { id } };
}

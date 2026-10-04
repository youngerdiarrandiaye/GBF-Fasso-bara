"use server";

import { z } from "zod";
import { readAll } from "@/lib/supabase/read-all";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { bonLivraisonSchema, type BonLivraisonInput, type LigneBonLivraisonInput } from "@/lib/validations/schemas";
import { traiterErreurAction } from "@/lib/actions/errors";
import type { ClientRow, BonLivraisonRow, StatutBonLivraison } from "@/lib/supabase/database.types";

type ActionResult<T> = { data: T; error?: undefined } | { data?: undefined; error: string };

export async function creerBonLivraison(
  input: BonLivraisonInput
): Promise<ActionResult<{ bonLivraison: BonLivraisonRow }>> {
  const parsed = bonLivraisonSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Bon de livraison invalide." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée, veuillez vous reconnecter." };

  const { data: bl, error } = await supabase.rpc("creer_bon_livraison_atomique", {
    p_document: parsed.data,
  }).single();
  if (error || !bl) {
    return traiterErreurAction("bons-livraison.creerBonLivraison", error,
      "Impossible de créer le bon de livraison. Veuillez réessayer.");
  }
  revalidatePath("/bons-livraison");
  revalidatePath("/mes-factures");
  revalidatePath("/admin/factures");
  revalidatePath("/admin/bons-livraison");
  revalidatePath("/admin/entrepots");
  revalidatePath("/admin/stock");
  return { data: { bonLivraison: bl as BonLivraisonRow } };
}

/**
 * Bascule livré-non-payé <-> livré-payé — aucune règle serveur particulière
 * au-delà de RLS (bons_livraison_admin_all), contrairement au décrément de
 * stock qui reste, lui, entièrement géré par le trigger à la saisie des
 * lignes (jamais reproduit ici).
 */
export async function changerStatutBonLivraison(
  id: string,
  statut: StatutBonLivraison
): Promise<ActionResult<BonLivraisonRow>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée, veuillez vous reconnecter." };

  const { data, error } = await supabase
    .from("bons_livraison")
    .update({ statut })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return traiterErreurAction(
      "bons-livraison.changerStatutBonLivraison",
      error,
      "Impossible de modifier le statut de ce bon de livraison."
    );
  }

  revalidatePath("/admin/bons-livraison");
  revalidatePath(`/admin/bons-livraison/${id}`);
  return { data: data as BonLivraisonRow };
}

export interface FactureLivraisonOption {
  id: string;
  numero: string;
  statut: string;
  client: { nom: string };
}

/** Recherche combinée numéro/client, sous les droits de la session. */
export async function rechercherFacturesLivraison(texte: string): Promise<ActionResult<FactureLivraisonOption[]>> {
  const supabase = await createClient();
  const recherche = texte.trim().toLocaleLowerCase("fr");
  try {
    const { data } = await readAll(supabase.from("factures")
      .select("id, numero, statut, client:clients!factures_client_id_fkey(nom), bons_livraison!bons_livraison_facture_id_fkey(id)")
      .in("statut", ["validee", "payee_partielle", "payee"])
      .is("bon_livraison_id", null)
      .order("created_at", { ascending: false }).order("id"));
    const factures = data as unknown as (FactureLivraisonOption & { bons_livraison: { id: string }[] })[];
    return { data: factures.filter(f => !f.bons_livraison.length &&
      `${f.numero} ${f.client?.nom ?? ""}`.toLocaleLowerCase("fr").includes(recherche))
      .slice(0, 30).map(({ id, numero, statut, client }) => ({ id, numero, statut, client })) };
  } catch (error) {
    return traiterErreurAction("rechercherFacturesLivraison", error, "Impossible de rechercher les factures.");
  }
}

export async function chargerFactureLivraison(id: string): Promise<ActionResult<{
  client: ClientRow;
  entrepot_id: string;
  lignes: LigneBonLivraisonInput[];
}>> {
  if (!z.string().uuid().safeParse(id).success) return { error: "Facture invalide." };
  const supabase = await createClient();
  const { data: facture, error } = await supabase.from("factures")
    .select("id, entrepot_id, client:clients!factures_client_id_fkey(*)")
    .eq("id", id).in("statut", ["validee", "payee_partielle", "payee"]).single();
  if (error || !facture) return { error: "Cette facture n’est plus disponible. Actualisez la recherche." };
  try {
    const [{ data: lignes }, { data: stock }] = await Promise.all([
      readAll(supabase.from("lignes_facture")
        .select("id, produit_id, quantite, produit:produits(code, nom, unite)")
        .eq("facture_id", id).order("id")),
      readAll(supabase.from("stock_entrepot").select("produit_id, quantite_stock")
        .eq("entrepot_id", facture.entrepot_id).order("produit_id")),
    ]);
    const stocks = new Map(stock.map(s => [s.produit_id, Number(s.quantite_stock)]));
    const details = lignes as unknown as { produit_id: string; quantite: number; produit: { code: string; nom: string; unite: string } }[];
    const groupes = new Map<string, LigneBonLivraisonInput>();
    for (const l of details) {
      if (!l.produit) throw new Error("Produit introuvable");
      const precedent = groupes.get(l.produit_id);
      groupes.set(l.produit_id, { ...l.produit, produit_id: l.produit_id,
        quantite: Math.round(((precedent?.quantite ?? 0) + Number(l.quantite)) * 100) / 100,
        stock_disponible: stocks.get(l.produit_id) ?? 0 });
    }
    if (!groupes.size) return { error: "Cette facture ne contient aucun produit à livrer." };
    return { data: { client: facture.client as unknown as ClientRow,
      entrepot_id: facture.entrepot_id, lignes: [...groupes.values()] } };
  } catch (error) {
    return traiterErreurAction("chargerFactureLivraison", error, "Impossible de charger les produits de la facture.");
  }
}

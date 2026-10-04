"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  clientRapideSchema,
  factureSchema,
  type ClientRapideInput,
  type FactureInput,
} from "@/lib/validations/schemas";
import { traiterErreurAction } from "@/lib/actions/errors";
import type { ClientRow, StatutFacture } from "@/lib/supabase/database.types";

/**
 * Server Actions — Espace Agent / Nouvelle facture.
 *
 * Règle absolue : la validation Zod ici est REJOUÉE côté serveur (jamais de
 * confiance dans la validation client déjà faite par le formulaire), et
 * chaque écriture passe par le client Supabase authentifié (cookies de
 * session), donc reste filtrée par les policies RLS de architecte-bdd —
 * aucun contournement, aucune clé service_role utilisée ici.
 *
 * Signalé à expert-securite pour audit : ce fichier écrit sur les tables
 * clients, factures et lignes_facture.
 *
 * Avenant Crédit / Bon de Livraison / Multi-entrepôts (0013_avenant_credit_
 * entrepots.sql, règle 16) : `enregistrerBrouillon` persiste désormais
 * `entrepot_id` (obligatoire, NOT NULL en base, y compris pour un brouillon)
 * — depuis 0017, la validation ne modifie pas le stock. Seule la création
 * du bon de livraison contrôle et retire les quantités de cet entrepôt. L'ouverture
 * d'un crédit associé (le cas échéant) est gérée par une Server Action
 * séparée, `lib/actions/credits.ts` (`ouvrirCreditPourFacture`), signalée à
 * expert-securite séparément (écrit sur la table `credits`).
 */

type ActionResult<T> =
  | { data: T; error?: undefined }
  | { data?: undefined; error: string; ligneProduitNom?: string };

export async function creerClientRapide(
  input: ClientRapideInput
): Promise<ActionResult<ClientRow>> {
  const parsed = clientRapideSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données client invalides." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée, veuillez vous reconnecter." };

  const { nom, type_client, telephone, adresse, email } = parsed.data;

  const { data, error } = await supabase
    .from("clients")
    .insert({
      nom,
      type_client,
      telephone: telephone || null,
      adresse: adresse || null,
      email: email || null,
    })
    .select("id, nom, type_client, adresse, telephone, email, ninea, created_by, created_at, updated_at")
    .single();

  if (error) {
    return traiterErreurAction(
      "creerClientRapide",
      error,
      "Impossible de créer le client. Veuillez réessayer."
    );
  }

  revalidatePath("/clients");
  return { data: data as ClientRow };
}

interface EnregistrerBrouillonInput extends FactureInput {
  factureId?: string;
}

export async function enregistrerBrouillon(
  input: EnregistrerBrouillonInput
): Promise<ActionResult<{ id: string; numero: string }>> {
  const parsed = factureSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Facture invalide." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée, veuillez vous reconnecter." };

  const { client_id, entrepot_id, remise, forfait_transport, tva_active, tva_taux, notes, lignes } =
    parsed.data;
  const tauxEffectif = tva_active ? tva_taux : 0;

  let factureId: string;
  let numero: string;

  if (input.factureId) {
    const { data: factureMaj, error: errMaj } = await supabase
      .from("factures")
      .update({
        client_id,
        entrepot_id,
        remise_montant: remise,
        forfait_transport,
        tva_taux: tauxEffectif,
        notes: notes || null,
      })
      .eq("id", input.factureId)
      .select("id, numero")
      .single();

    if (errMaj || !factureMaj) {
      return traiterErreurAction(
        "enregistrerBrouillon.update",
        errMaj ?? "no rows",
        "Cette facture n'est plus modifiable (déjà validée ou appartenant à un autre agent)."
      );
    }
    factureId = input.factureId;
    numero = factureMaj.numero;

    // Remplacement complet des lignes (delete puis insert) : approche simple
    // adaptée au cas d'usage (un seul agent édite son propre brouillon), mais
    // non atomique côté client Supabase (pas de transaction multi-requêtes
    // exposée par supabase-js). Limite connue signalée à expert-securite/
    // qa-testeur : en cas d'échec de l'insert qui suit, le brouillon peut
    // temporairement se retrouver sans lignes — l'agent peut ré-ajouter ses
    // lignes et ré-enregistrer sans perte définitive tant que la facture
    // reste au statut brouillon.
    const { error: errDelete } = await supabase
      .from("lignes_facture")
      .delete()
      .eq("facture_id", factureId);
    if (errDelete) {
      return traiterErreurAction(
        "enregistrerBrouillon.delete",
        errDelete,
        "Impossible de mettre à jour les lignes de cette facture."
      );
    }
  } else {
    const { data: factureCreee, error: errCreation } = await supabase
      .from("factures")
      .insert({
        client_id,
        entrepot_id,
        remise_montant: remise,
        forfait_transport,
        tva_taux: tauxEffectif,
        notes: notes || null,
      })
      .select("id, numero")
      .single();

    if (errCreation || !factureCreee) {
      return traiterErreurAction(
        "enregistrerBrouillon.insert",
        errCreation ?? "no rows",
        "Impossible de créer la facture."
      );
    }
    factureId = factureCreee.id;
    numero = factureCreee.numero;
  }

  const { error: errLignes } = await supabase.from("lignes_facture").insert(
    lignes.map((ligne) => ({
      facture_id: factureId,
      produit_id: ligne.produit_id,
      quantite: ligne.quantite,
      prix_unitaire: ligne.prix_unitaire,
    }))
  );

  if (errLignes) {
    return traiterErreurAction(
      "enregistrerBrouillon.insertLignes",
      errLignes,
      "Impossible d'enregistrer les lignes produit de cette facture."
    );
  }

  revalidatePath("/mes-factures");
  revalidatePath("/");
  return { data: { id: factureId, numero } };
}

const validerFactureSchema = z.object({
  factureId: z.string().uuid("Identifiant de facture invalide."),
  statutCible: z.enum(["proforma", "validee"]),
});

export async function validerFacture(
  factureId: string,
  statutCible: Extract<StatutFacture, "proforma" | "validee">
): Promise<ActionResult<{ numero: string; statut: StatutFacture }>> {
  const parsed = validerFactureSchema.safeParse({ factureId, statutCible });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Requête de validation invalide." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée, veuillez vous reconnecter." };

  const { data, error } = await supabase
    .from("factures")
    .update({ statut: parsed.data.statutCible })
    .eq("id", parsed.data.factureId)
    .select("id, numero, statut")
    .single();

  if (error || !data) {
    return traiterErreurAction(
      "validerFacture",
      error ?? "no rows",
      "Impossible de valider cette facture (elle a peut-être déjà été traitée par ailleurs, ou ne vous appartient pas)."
    );
  }

  revalidatePath("/mes-factures");
  revalidatePath("/");
  return { data: { numero: data.numero, statut: data.statut } };
}

const annulerBrouillonSchema = z.object({
  factureId: z.string().uuid("Identifiant de facture invalide."),
});

export async function annulerBrouillon(factureId: string): Promise<ActionResult<{ id: string }>> {
  const parsed = annulerBrouillonSchema.safeParse({ factureId });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Requête d'annulation invalide." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée, veuillez vous reconnecter." };

  // .select("id").single() est indispensable ici : sans lui, une policy RLS
  // qui filtre silencieusement 0 ligne (facture d'un autre agent, ou déjà
  // validée) donnerait `error: null` et laisserait croire à un succès alors
  // qu'aucune écriture n'a eu lieu.
  const { data, error } = await supabase
    .from("factures")
    .update({ statut: "annulee" })
    .eq("id", parsed.data.factureId)
    .select("id")
    .single();

  if (error || !data) {
    return traiterErreurAction(
      "annulerBrouillon",
      error ?? "no rows",
      "Cette facture n'est plus modifiable ou ne vous appartient pas."
    );
  }

  revalidatePath("/mes-factures");
  return { data: { id: data.id } };
}

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/Button";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { NouvelleFactureForm } from "./NouvelleFactureForm";
import type { ClientRow, LigneFactureAvecProduit } from "@/lib/supabase/database.types";
import type { LigneFactureInput } from "@/lib/validations/schemas";

/** Ligne de facture enrichie du produit, SANS `quantite_stock` (dépréciée
 * depuis l'avenant multi-entrepôts, règle 16 — cf. migration 0013 en-tête) :
 * le stock affiché à la reprise d'un brouillon vient d'une requête distincte
 * sur `stock_entrepot`, scopée à `facture.entrepot_id`, plus bas dans ce
 * fichier. */
type LigneFactureAvecProduitSansStockDeprecie = Omit<LigneFactureAvecProduit, "produit"> & {
  produit: Omit<LigneFactureAvecProduit["produit"], "quantite_stock">;
};

export const dynamic = "force-dynamic";

/**
 * Écran prioritaire du MVP — création d'une facture complète en moins de
 * 2 minutes. Avec ?id=<factureId>, reprend une facture existante en statut
 * 'brouillon' OU 'proforma' (créée précédemment par ce même agent, cf. "Mes
 * factures" > Continuer/Modifier). EF-FAC-12 : une proforma reste éditable
 * et peut être convertie en facture définitive sans ressaisie tant qu'elle
 * n'a pas franchi l'étape de validation (cf. supabase/migrations/
 * 0004_edition_proforma.sql). La policy RLS `factures_lecture_agent_propre`
 * garantit qu'un agent ne peut jamais charger la facture d'un autre agent
 * ici, quel qu'en soit le statut.
 */
export default async function NouvelleFacturePage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;

  if (!id) {
    return <NouvelleFactureForm />;
  }

  const supabase = await createClient();

  const { data: facture } = await supabase
    .from("factures")
    .select(
      "id, numero, statut, total_ht, remise_montant, forfait_transport, tva_taux, total_general, client_id, agent_id, entrepot_id, date_facture, date_validation, notes, created_at, updated_at"
    )
    .eq("id", id)
    .single();

  if (!facture) {
    return (
      <div className="flex flex-col gap-4">
        <InlineAlert tone="red">Facture introuvable.</InlineAlert>
        <Link href="/mes-factures">
          <Button variant="outline">Retour à mes factures</Button>
        </Link>
      </div>
    );
  }

  if (!["brouillon", "proforma"].includes(facture.statut)) {
    return (
      <div className="flex flex-col gap-4">
        <InlineAlert tone="blue">
          Cette facture n&apos;est plus modifiable (statut « {facture.statut} »).
        </InlineAlert>
        <Link href="/mes-factures">
          <Button variant="outline">Retour à mes factures</Button>
        </Link>
      </div>
    );
  }

  const [{ data: client }, { data: lignesData }] = await Promise.all([
    supabase
      .from("clients")
      .select("id, nom, type_client, adresse, telephone, email, ninea, created_by, created_at, updated_at")
      .eq("id", facture.client_id)
      .single(),
    supabase
      .from("lignes_facture")
      .select(
        "id, facture_id, produit_id, quantite, prix_unitaire, total_ligne, created_at, updated_at, produit:produits(id, code, nom, unite, type_ligne_produit)"
      )
      .eq("facture_id", facture.id),
  ]);

  const lignesBrutes = (lignesData as unknown as LigneFactureAvecProduitSansStockDeprecie[]) ?? [];

  // Règle métier 16 (0013_avenant_credit_entrepots.sql) : le stock affiché à
  // la reprise d'un brouillon/proforma vient de `stock_entrepot`, scopé à
  // `facture.entrepot_id` — jamais de `produits.quantite_stock` (dépréciée,
  // gelée, cf. en-tête de la migration). Requête séparée (plutôt qu'un embed
  // à 3 niveaux lignes_facture -> produit -> stock_entrepot, plus fragile à
  // filtrer côté PostgREST) sur les seuls produits déjà présents sur cette
  // facture.
  const produitIds = lignesBrutes.map((l) => l.produit_id);
  const { data: stockData } = produitIds.length
    ? await supabase
        .from("stock_entrepot")
        .select("produit_id, quantite_stock")
        .eq("entrepot_id", facture.entrepot_id)
        .in("produit_id", produitIds)
    : { data: [] };
  const stockParProduit = new Map<string, number>(
    ((stockData as { produit_id: string; quantite_stock: number }[]) ?? []).map((s) => [
      s.produit_id,
      s.quantite_stock,
    ])
  );

  const lignesInitiales: LigneFactureInput[] = lignesBrutes.map((ligne) => ({
    produit_id: ligne.produit_id,
    code: ligne.produit.code,
    nom: ligne.produit.nom,
    unite: ligne.produit.unite,
    quantite: ligne.quantite,
    prix_unitaire: ligne.prix_unitaire,
    stock_disponible: stockParProduit.get(ligne.produit_id) ?? 0,
    type_ligne_produit: ligne.produit.type_ligne_produit,
  }));

  return (
    <NouvelleFactureForm
      initial={{
        factureId: facture.id,
        numero: facture.numero,
        statut: facture.statut,
        client: client as ClientRow,
        lignes: lignesInitiales,
        remise: facture.remise_montant,
        forfaitTransport: facture.forfait_transport,
        tvaActive: facture.tva_taux > 0,
        notes: facture.notes ?? "",
        entrepotId: facture.entrepot_id,
      }}
    />
  );
}

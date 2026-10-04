import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/Button";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { Breadcrumbs } from "@/components/admin/Breadcrumbs";
import { NouvelleFactureForm } from "@/app/(agent)/nouvelle-facture/NouvelleFactureForm";
import type { ClientRow, EntrepriseConfigRow, LigneFactureAvecProduit } from "@/lib/supabase/database.types";
import type { LigneFactureInput } from "@/lib/validations/schemas";

export const dynamic = "force-dynamic";

/**
 * Équivalent Admin de app/(agent)/nouvelle-facture/page.tsx — même formulaire
 * (`NouvelleFactureForm`, RLS-agnostique du rôle : `factures_admin_all`
 * couvre déjà l'admin en écriture, `agent_id` se réplit via
 * `DEFAULT auth.uid()`), seuls les liens de retour et la redirection après
 * validation changent (routes admin, pas /mes-factures qui est agent-only et
 * redirigerait un admin vers /login).
 */
export default async function NouvelleFactureAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  const supabase = await createClient();

  const { data: entreprise } = await supabase
    .from("entreprise_config")
    .select("nom, logo_url")
    .eq("id", true)
    .single();
  const config = entreprise as Pick<EntrepriseConfigRow, "nom" | "logo_url"> | null;
  const brand = { nom: config?.nom ?? "GIE FASSO BARA", logoUrl: config?.logo_url ?? null };

  if (!id) {
    return (
      <div className="flex flex-col gap-6 pb-8">
        <Breadcrumbs items={[{ label: "Factures", href: "/admin/factures" }, { label: "Nouvelle facture" }]} />
        <NouvelleFactureForm redirectApresValidation="/admin/factures" sansBarreOngletsMobile brand={brand} />
      </div>
    );
  }

  const { data: facture } = await supabase
    .from("factures")
    .select(
      "id, numero, statut, total_ht, remise_montant, forfait_transport, tva_taux, total_general, client_id, agent_id, date_facture, date_validation, notes, created_at, updated_at"
    )
    .eq("id", id)
    .single();

  if (!facture) {
    return (
      <div className="flex flex-col gap-4">
        <InlineAlert tone="red">Facture introuvable.</InlineAlert>
        <Link href="/admin/factures">
          <Button variant="outline">Retour aux factures</Button>
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
        <Link href="/admin/factures">
          <Button variant="outline">Retour aux factures</Button>
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
        "id, facture_id, produit_id, quantite, prix_unitaire, total_ligne, created_at, updated_at, produit:produits(id, code, nom, unite, type_ligne_produit, quantite_stock)"
      )
      .eq("facture_id", facture.id),
  ]);

  const lignesInitiales: LigneFactureInput[] = ((lignesData as unknown as LigneFactureAvecProduit[]) ?? []).map(
    (ligne) => ({
      produit_id: ligne.produit_id,
      code: ligne.produit.code,
      nom: ligne.produit.nom,
      unite: ligne.produit.unite,
      quantite: ligne.quantite,
      prix_unitaire: ligne.prix_unitaire,
      stock_disponible: ligne.produit.quantite_stock,
      type_ligne_produit: ligne.produit.type_ligne_produit,
    })
  );

  return (
    <div className="flex flex-col gap-6 pb-8">
      <Breadcrumbs items={[{ label: "Factures", href: "/admin/factures" }, { label: facture.numero }]} />
      <NouvelleFactureForm
        redirectApresValidation="/admin/factures"
        sansBarreOngletsMobile
        brand={brand}
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
        }}
      />
    </div>
  );
}

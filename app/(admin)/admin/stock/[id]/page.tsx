import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatMontant } from "@/lib/format";
import { Card } from "@/components/ui/Card";
import { StockGauge } from "@/components/ui/StockGauge";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { Breadcrumbs } from "@/components/admin/Breadcrumbs";
import { StockLevelBadge } from "@/components/admin/StockLevelBadge";
import { Badge } from "@/components/ui/Badge";
import { ProductDetailActions } from "@/components/admin/ProductDetailActions";
import { ProductPhotoGallery } from "@/components/admin/ProductPhotoGallery";
import { ProductTabs, type MouvementAffiche, type VenteAffichee } from "@/components/admin/ProductTabs";
import { RealtimeRevalidate } from "@/components/admin/RealtimeRevalidate";
import { CompanyBrandMark } from "@/components/facture/CompanyBrandMark";
import type { EntrepriseConfigRow, ProduitRow } from "@/lib/supabase/database.types";

export const dynamic = "force-dynamic";

export default async function ProduitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: produit } = await supabase
    .from("produits")
    .select("*, categorie:categories_produits(id, nom)")
    .eq("id", id)
    .single();

  if (!produit) {
    notFound();
  }

  const [{ data: mouvementsData }, { data: lignesData }, { data: composants }, { data: kitParent }, { data: entreprise }] =
    await Promise.all([
      supabase
        .from("mouvements_stock")
        .select(
          "id, type, quantite, motif, created_at, reference_facture_id, utilisateur:utilisateurs(nom), facture:factures(id, numero)"
        )
        .eq("produit_id", id)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("lignes_facture")
        .select("id, quantite, total_ligne, facture:factures(id, numero, date_facture, statut, client:clients(nom))")
        .eq("produit_id", id)
        .order("created_at", { ascending: false })
        .limit(50),
      produit.type_ligne_produit === "vendu_separement"
        ? supabase.from("produits").select("id, nom, code").eq("kit_parent_id", id)
        : Promise.resolve({ data: [] as { id: string; nom: string; code: string }[] }),
      // kit_parent_id est le nom réel de la colonne (pas produit_parent_id) —
      // requête déclenchée uniquement quand le produit est "inclus dans kit",
      // pour construire le lien vers la fiche du parent et détecter un parent
      // désactivé (InlineAlert amber ci-dessous).
      produit.type_ligne_produit === "inclus_dans_kit" && produit.kit_parent_id
        ? supabase.from("produits").select("id, nom, actif").eq("id", produit.kit_parent_id).single()
        : Promise.resolve({ data: null as { id: string; nom: string; actif: boolean } | null }),
      supabase.from("entreprise_config").select("nom, logo_url").eq("id", true).single(),
    ]);
  const config = entreprise as Pick<EntrepriseConfigRow, "nom" | "logo_url"> | null;

  const mouvements: MouvementAffiche[] = (mouvementsData ?? []).map((m) => ({
    id: m.id,
    type: m.type,
    quantite: m.quantite,
    motif: m.motif,
    created_at: m.created_at,
    utilisateur_nom: (m.utilisateur as unknown as { nom: string } | null)?.nom ?? null,
    facture_id: m.reference_facture_id,
    facture_numero: (m.facture as unknown as { numero: string } | null)?.numero ?? null,
  }));

  const STATUTS_VENTE_CONCLUE = ["validee", "payee_partielle", "payee"];
  const ventes: VenteAffichee[] = (lignesData ?? [])
    .map((l) => {
      const facture = l.facture as unknown as {
        id: string;
        numero: string;
        date_facture: string;
        statut: string;
        client: { nom: string } | null;
      } | null;
      if (!facture || !STATUTS_VENTE_CONCLUE.includes(facture.statut)) return null;
      return {
        id: l.id,
        facture_id: facture.id,
        numero: facture.numero,
        date_facture: facture.date_facture,
        client_nom: facture.client?.nom ?? "—",
        quantite: l.quantite,
        total_ligne: l.total_ligne,
      };
    })
    .filter((v): v is VenteAffichee => v !== null);

  const produitTyped = produit as unknown as ProduitRow & { categorie: { id: string; nom: string } | null };

  return (
    <div className="flex flex-col gap-6">
      <RealtimeRevalidate tables={["produits", "mouvements_stock"]} />

      <Breadcrumbs
        items={[{ label: "Stock", href: "/admin/stock" }, { label: produitTyped.nom }]}
      />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-wrap items-start gap-4">
          <ProductPhotoGallery photosUrls={produitTyped.photos_urls} nom={produitTyped.nom} />
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <CompanyBrandMark nom={config?.nom ?? "GIE FASSO BARA"} logoUrl={config?.logo_url ?? null} size="sm" />
              <h1 className="text-h1 font-semibold tracking-tight text-text">{produitTyped.nom}</h1>
              <StockLevelBadge
                quantiteStock={produitTyped.quantite_stock}
                seuilAlerte={produitTyped.seuil_alerte}
              />
            </div>
            <p className="mt-1 font-mono text-body-sm text-muted">{produitTyped.code}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {produitTyped.categorie && <Badge>{produitTyped.categorie.nom}</Badge>}
              {produitTyped.type_ligne_produit === "inclus_dans_kit" && (
                <Badge tone="blue">Inclus dans un kit</Badge>
              )}
              {!produitTyped.actif && <Badge tone="red">Inactif</Badge>}
              {composants && composants.length > 0 && (
                <Badge tone="blue">Kit · {composants.length} composants</Badge>
              )}
            </div>
          </div>
        </div>
        <ProductDetailActions produit={produitTyped} />
      </div>

      {produitTyped.type_ligne_produit === "inclus_dans_kit" && kitParent && !kitParent.actif && (
        <InlineAlert tone="amber">
          Le produit parent &quot;{kitParent.nom}&quot; est désactivé. Cet accessoire peut avoir un
          usage résiduel.
        </InlineAlert>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="rounded-card-lg lg:col-span-2">
          <p className="mb-2 text-body-sm text-muted">Niveau de stock</p>
          <StockGauge
            quantiteStock={produitTyped.quantite_stock}
            seuilAlerte={produitTyped.seuil_alerte}
            unite={produitTyped.unite}
          />
          {produitTyped.description && (
            <p className="mt-4 text-body text-text">{produitTyped.description}</p>
          )}
        </Card>
        <Card>
          <p className="text-body-sm text-muted">Prix unitaire</p>
          {produitTyped.type_ligne_produit === "inclus_dans_kit" ? (
            kitParent ? (
              <Link
                href={`/admin/stock/${kitParent.id}`}
                className="focus-ring mt-1 inline-block rounded-input text-body text-text hover:underline"
              >
                Inclus dans kit — voir <span className="font-medium">{kitParent.nom}</span>
              </Link>
            ) : (
              <p className="mt-1 font-mono text-h2 text-text">Inclus</p>
            )
          ) : (
            <p className="mt-1 font-mono text-h2 text-text">
              {formatMontant(produitTyped.prix_unitaire ?? 0)}
            </p>
          )}
        </Card>
      </div>

      <Card className="!p-0">
        <ProductTabs unite={produitTyped.unite} mouvements={mouvements} ventes={ventes} />
      </Card>
    </div>
  );
}

import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Breadcrumbs } from "@/components/admin/Breadcrumbs";
import { ProductForm } from "@/components/admin/ProductForm";
import { CompanyBrandMark } from "@/components/facture/CompanyBrandMark";
import type { CategorieProduitRow, EntrepriseConfigRow, ProduitRow } from "@/lib/supabase/database.types";

export const dynamic = "force-dynamic";

export default async function NouveauProduitPage() {
  const supabase = await createClient();

  const [{ data: categories }, { data: kits }, { data: entreprise }] = await Promise.all([
    supabase.from("categories_produits").select("*").order("nom"),
    supabase
      .from("produits")
      .select("id, nom, code, actif")
      .eq("type_ligne_produit", "vendu_separement")
      .order("nom"),
    supabase.from("entreprise_config").select("nom, logo_url").eq("id", true).single(),
  ]);
  const config = entreprise as Pick<EntrepriseConfigRow, "nom" | "logo_url"> | null;

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs items={[{ label: "Stock", href: "/admin/stock" }, { label: "Nouveau produit" }]} />
      <div className="flex items-center gap-3">
        <CompanyBrandMark nom={config?.nom ?? "GIE FASSO BARA"} logoUrl={config?.logo_url ?? null} size="sm" />
        <div>
          <h1 className="text-h1 font-semibold tracking-tight text-text">Nouveau produit</h1>
          <p className="text-body text-muted">Ajouter un produit au catalogue.</p>
        </div>
      </div>
      <Card className="max-w-2xl">
        <ProductForm
          categories={(categories as CategorieProduitRow[]) ?? []}
          kitsDisponibles={(kits as Pick<ProduitRow, "id" | "nom" | "code" | "actif">[]) ?? []}
        />
      </Card>
    </div>
  );
}

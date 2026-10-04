import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Breadcrumbs } from "@/components/admin/Breadcrumbs";
import { ProductForm } from "@/components/admin/ProductForm";
import { CompanyBrandMark } from "@/components/facture/CompanyBrandMark";
import type { CategorieProduitRow, EntrepriseConfigRow, ProduitRow } from "@/lib/supabase/database.types";

export const dynamic = "force-dynamic";

export default async function ModifierProduitPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: produit }, { data: categories }, { data: kits }, { data: entreprise }] = await Promise.all([
    supabase.from("produits").select("*").eq("id", id).single(),
    supabase.from("categories_produits").select("*").order("nom"),
    supabase
      .from("produits")
      .select("id, nom, code, actif")
      .eq("type_ligne_produit", "vendu_separement")
      .neq("id", id)
      .order("nom"),
    supabase.from("entreprise_config").select("nom, logo_url").eq("id", true).single(),
  ]);
  const config = entreprise as Pick<EntrepriseConfigRow, "nom" | "logo_url"> | null;

  if (!produit) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs
        items={[
          { label: "Stock", href: "/admin/stock" },
          { label: produit.nom, href: `/admin/stock/${id}` },
          { label: "Modifier" },
        ]}
      />
      <div className="flex items-center gap-3">
        <CompanyBrandMark nom={config?.nom ?? "GIE FASSO BARA"} logoUrl={config?.logo_url ?? null} size="sm" />
        <h1 className="text-h1 font-semibold tracking-tight text-text">Modifier {produit.nom}</h1>
      </div>
      <Card className="max-w-2xl">
        <ProductForm
          categories={(categories as CategorieProduitRow[]) ?? []}
          kitsDisponibles={(kits as Pick<ProduitRow, "id" | "nom" | "code" | "actif">[]) ?? []}
          produit={produit as ProduitRow}
        />
      </Card>
    </div>
  );
}

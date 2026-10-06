import { readAll } from "@/lib/supabase/read-all";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatMontant } from "@/lib/format";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { StockGauge } from "@/components/ui/StockGauge";
import { QuickActionGrid } from "@/components/ui/QuickActionGrid";
import { StockFilters } from "@/components/admin/StockFilters";
import { RealtimeRevalidate } from "@/components/admin/RealtimeRevalidate";
import { BrandedListPanel } from "@/components/admin/BrandedListPanel";
import { ClickableTableRow } from "@/components/admin/ClickableTableRow";
import { Pagination } from "@/components/admin/Pagination";
import { faBoxesStacked, faPlus, faRightLeft, faWarehouse } from "@fortawesome/free-solid-svg-icons";
import type { CategorieProduitRow, EntrepriseConfigRow, ProduitAvecCategorie } from "@/lib/supabase/database.types";
import { EmptyState } from "@/components/ui/EmptyState";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 10;

export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; categorie?: string; niveau?: string; page?: string; actif?: string }>;
}) {
  const { q, categorie, niveau, page, actif } = await searchParams;
  const pageActuelle = Math.max(1, parseInt(page ?? "1", 10) || 1);
  const supabase = await createClient();

  const [{ data: categories }, { data: entreprise }] = await Promise.all([
    supabase.from("categories_produits").select("*").order("nom"),
    supabase.from("entreprise_config").select("nom, logo_url").eq("id", true).single(),
  ]);
  const config = entreprise as Pick<EntrepriseConfigRow, "nom" | "logo_url"> | null;

  // Construit la requête filtrée (q/categorie) sur `produits`, triée par nom
  // côté serveur (ordre alphabétique de base, réutilisé comme ordre
  // secondaire stable après le tri "stock critique d'abord" appliqué en JS
  // ci-dessous).
  function requeteFiltree() {
    let r = supabase.from("produits").select("*, categorie:categories_produits(id, nom)");
    r = r.order("nom").order("id");
    if (actif === "1") r = r.eq("actif", true);
    if (q) r = r.or(`nom.ilike.%${q}%,code.ilike.%${q}%`);
    if (categorie) r = r.eq("categorie_id", categorie);
    return r;
  }

  // Le tri par défaut ("stock critique d'abord", quantite_stock <=
  // seuil_alerte) et le filtre `niveau` (bas/sain, quantite_stock <=
  // seuil_alerte * 1.5) comparent tous les deux DEUX colonnes de la même
  // ligne, ce que PostgREST/Supabase-js ne sait pas exprimer nativement
  // (`.order()`/`.filter()` ne comparent qu'une colonne à une valeur
  // littérale, jamais à une autre colonne). On charge donc TOUJOURS toutes
  // les lignes correspondant aux filtres q/categorie sans `.range()`, on
  // trie/filtre en JS, puis on pagine en JS (slice) — moins efficace que la
  // pagination serveur, mais c'est le seul moyen d'obtenir ce tri par défaut
  // sur l'ensemble du catalogue (pas seulement sur la page courante).
  const { data } = await readAll(requeteFiltree());
  let tousLesProduits = (data as unknown as ProduitAvecCategorie[]) ?? [];

  // Array.prototype.sort est stable (spec ES2019+) : à égalité de criticité,
  // l'ordre alphabétique déjà renvoyé par `.order("nom")` est préservé.
  tousLesProduits = [...tousLesProduits].sort((a, b) => {
    const critiqueA = a.quantite_stock <= a.seuil_alerte ? 0 : 1;
    const critiqueB = b.quantite_stock <= b.seuil_alerte ? 0 : 1;
    return critiqueA - critiqueB;
  });

  if (niveau) {
    tousLesProduits =
      niveau === "bas"
        ? tousLesProduits.filter((p) => p.quantite_stock <= p.seuil_alerte * 1.5)
        : tousLesProduits.filter((p) => p.quantite_stock > p.seuil_alerte * 1.5);
  }

  const totalCount = tousLesProduits.length;
  const offset = (pageActuelle - 1) * PAGE_SIZE;
  const produits = tousLesProduits.slice(offset, offset + PAGE_SIZE);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  function buildHref(cible: number) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (categorie) params.set("categorie", categorie);
    if (niveau) params.set("niveau", niveau);
    if (actif === "1") params.set("actif", "1");
    if (cible > 1) params.set("page", String(cible));
    const qs = params.toString();
    return qs ? `/admin/stock?${qs}` : "/admin/stock";
  }

  return (
    <div className="flex flex-col gap-6">
      <RealtimeRevalidate tables={["produits"]} />

      <BrandedListPanel
        nom={config?.nom ?? "GIE FASSO BARA"}
        logoUrl={config?.logo_url ?? null}
        title="Stock"
        subtitle="Catalogue produit et niveaux de stock."
        actions={
          <Link href="/admin/stock/nouveau">
            <Button>+ Nouveau produit</Button>
          </Link>
        }
      >
        <QuickActionGrid
          actions={[
            { href: "/admin/stock/nouveau", label: "Ajouter", description: "Produit", icon: faPlus, tone: "green" },
            { href: "/admin/entrepots", label: "Entrepôts", description: "Stocks par dépôt", icon: faWarehouse, tone: "blue" },
            { href: "/admin/transferts", label: "Transférer", description: "Entre dépôts", icon: faRightLeft, tone: "amber" },
            { href: "/admin/stock?niveau=bas", label: "Alertes", description: "Stock bas", icon: faBoxesStacked, tone: "red" },
          ]}
          columns={4}
        />

        <Card>
          <StockFilters categories={(categories as CategorieProduitRow[]) ?? []} />
        </Card>

        <Card className="!p-0">
          <div className="divide-y divide-border md:hidden">
            {produits.length === 0 ? (
              <EmptyState icone={faBoxesStacked} titre="Aucun produit ne correspond à ces filtres." description="Modifiez ou effacez les filtres pour élargir la recherche." action={{ href: "/admin/stock", label: "Effacer les filtres", variante: "outline" }} />
            ) : produits.map((produit) => (
              <Link key={produit.id} href={`/admin/stock/${produit.id}`} className="focus-ring block p-4 transition-colors hover:bg-surface-2">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="min-w-0 truncate text-body font-semibold text-text">{produit.nom}</p>
                  {produit.type_ligne_produit === "inclus_dans_kit" ? (
                    <span className="shrink-0 whitespace-nowrap text-body-sm text-muted">Inclus dans le kit</span>
                  ) : (
                    <span className="shrink-0 whitespace-nowrap font-mono text-body font-semibold text-text">{formatMontant(produit.prix_unitaire ?? 0)}</span>
                  )}
                </div>
                <p className="mt-0.5 flex min-w-0 items-center gap-2 text-body-sm text-muted">
                  <span className="shrink-0 font-mono">{produit.code}</span>
                  <span className="truncate">· {produit.categorie?.nom ?? "Sans catégorie"}</span>
                  {!produit.actif && <Badge tone="red">Inactif</Badge>}
                </p>
                <div className="mt-2.5"><StockGauge quantiteStock={produit.quantite_stock} seuilAlerte={produit.seuil_alerte} unite={produit.unite} compact /></div>
              </Link>
            ))}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-[680px] w-full border-collapse">
              <thead>
                <tr className="border-b border-border text-left text-caption uppercase tracking-[0.06em] text-muted">
                  <th className="px-4 py-2.5 font-medium">Produit</th>
                  <th className="px-4 py-2.5 font-medium">Catégorie</th>
                  <th className="px-4 py-2.5 font-medium">Niveau de stock</th>
                  <th className="px-4 py-2.5 text-right font-medium">Prix</th>
                </tr>
              </thead>
              <tbody>
                {produits.length === 0 ? (
                  <tr>
                    <td colSpan={4}><EmptyState icone={faBoxesStacked} titre="Aucun produit ne correspond à ces filtres." description="Modifiez ou effacez les filtres pour élargir la recherche." action={{ href: "/admin/stock", label: "Effacer les filtres", variante: "outline" }} /></td>
                  </tr>
                ) : (
                  produits.map((produit) => (
                    <ClickableTableRow
                      key={produit.id}
                      href={`/admin/stock/${produit.id}`}
                      className="border-t border-border hover:bg-surface-2"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/stock/${produit.id}`}
                          className="focus-ring flex flex-col gap-0.5 rounded-input"
                        >
                          <span className="text-body font-medium text-text hover:underline">{produit.nom}</span>
                          <span className="flex items-center gap-2">
                            <span className="font-mono text-body-sm text-muted">{produit.code}</span>
                            {!produit.actif && <Badge tone="red">Inactif</Badge>}
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-body-sm text-muted">{produit.categorie?.nom ?? "—"}</td>
                      <td className="px-4 py-3">
                        <div className="max-w-[220px]">
                          <StockGauge
                            quantiteStock={produit.quantite_stock}
                            seuilAlerte={produit.seuil_alerte}
                            unite={produit.unite}
                            compact
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-body text-text">
                        {produit.type_ligne_produit === "inclus_dans_kit" ? (
                          <span className="whitespace-nowrap font-sans text-body-sm text-muted">Inclus dans le kit</span>
                        ) : (
                          formatMontant(produit.prix_unitaire ?? 0)
                        )}
                      </td>
                    </ClickableTableRow>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <Pagination
            page={pageActuelle}
            totalPages={totalPages}
            totalCount={totalCount}
            pageSize={PAGE_SIZE}
            buildHref={buildHref}
            itemLabel="produit"
          />
        </Card>
      </BrandedListPanel>
    </div>
  );
}

import Link from "next/link";
import { faBoxesStacked, faPlus, faRightLeft, faWarehouse } from "@fortawesome/free-solid-svg-icons";
import { createClient } from "@/lib/supabase/server";
import { formatQuantite, libelleUnite } from "@/lib/format";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { QuickActionGrid } from "@/components/ui/QuickActionGrid";
import { StockLevelBadge } from "@/components/admin/StockLevelBadge";
import { BrandedListPanel } from "@/components/admin/BrandedListPanel";
import { NewEntrepotButton } from "@/components/admin/NewEntrepotButton";
import { RealtimeRevalidate } from "@/components/admin/RealtimeRevalidate";
import type {
  EntrepotRow,
  EntrepriseConfigRow,
  StockEntrepotAvecProduit,
} from "@/lib/supabase/database.types";

export const dynamic = "force-dynamic";

/**
 * Écran "Entrepôts" — règle métier 16 (0013_avenant_credit_entrepots.sql).
 * Liste des entrepôts (création admin only, RLS `entrepots_admin_all`) + vue
 * du stock par entrepôt et par produit (`stock_entrepot`, source de vérité
 * du stock depuis l'avenant — remplace produits.quantite_stock/seuil_alerte,
 * dépréciées).
 *
 * Décision de placement Sidebar (voir components/admin/Sidebar.tsx) :
 * groupe MENU, juste après "Stock" — cet écran est une extension directe de
 * la gestion de stock existante, pas un outil d'administration séparé.
 */
export default async function EntrepotsPage({
  searchParams,
}: {
  searchParams: Promise<{ entrepot?: string; q?: string }>;
}) {
  const { entrepot: entrepotFiltre, q } = await searchParams;
  const supabase = await createClient();

  const [{ data: entrepots }, { data: entreprise }] = await Promise.all([
    supabase.from("entrepots").select("*").order("nom"),
    supabase.from("entreprise_config").select("nom, logo_url").eq("id", true).single(),
  ]);
  const config = entreprise as Pick<EntrepriseConfigRow, "nom" | "logo_url"> | null;
  const tousLesEntrepots = (entrepots as EntrepotRow[]) ?? [];

  let requeteStock = supabase
    .from("stock_entrepot")
    .select("*, produit:produits(id, code, nom, unite, actif)")
    .order("entrepot_id");
  if (entrepotFiltre) requeteStock = requeteStock.eq("entrepot_id", entrepotFiltre);

  const { data: stockData } = await requeteStock;
  let lignesStock = (stockData as unknown as StockEntrepotAvecProduit[]) ?? [];
  if (q) {
    const terme = q.toLowerCase();
    lignesStock = lignesStock.filter(
      (l) => l.produit.nom.toLowerCase().includes(terme) || l.produit.code.toLowerCase().includes(terme)
    );
  }
  // Stock critique d'abord (même convention que /admin/stock).
  lignesStock = [...lignesStock].sort((a, b) => {
    const critiqueA = a.quantite_stock <= a.seuil_alerte ? 0 : 1;
    const critiqueB = b.quantite_stock <= b.seuil_alerte ? 0 : 1;
    return critiqueA - critiqueB;
  });

  const entrepotParId = new Map(tousLesEntrepots.map((e) => [e.id, e]));

  return (
    <div className="flex flex-col gap-6">
      <RealtimeRevalidate tables={["entrepots", "stock_entrepot"]} />

      <BrandedListPanel
        nom={config?.nom ?? "GIE FASSO BARA"}
        logoUrl={config?.logo_url ?? null}
        title="Entrepôts"
        subtitle="Sites de stockage et niveaux de stock par entrepôt."
        actions={<NewEntrepotButton />}
      >
        <QuickActionGrid
          actions={[
            { href: "/admin/stock/nouveau", label: "Ajouter", description: "Produit", icon: faPlus, tone: "green" },
            { href: "/admin/stock", label: "Catalogue", description: "Tous les produits", icon: faBoxesStacked, tone: "blue" },
            { href: "/admin/transferts", label: "Transférer", description: "Entre dépôts", icon: faRightLeft, tone: "amber" },
            { href: "/admin/entrepots", label: "Sites", description: "Stocks par dépôt", icon: faWarehouse, tone: "purple" },
          ]}
          columns={4}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tousLesEntrepots.length === 0 ? (
            <Card className="sm:col-span-2 lg:col-span-3">
              <p className="text-body text-muted">
                Aucun entrepôt configuré. Créez le premier avec le bouton « + Nouvel entrepôt ».
              </p>
            </Card>
          ) : (
            tousLesEntrepots.map((e) => (
              <Link key={e.id} href={`/admin/entrepots/${e.id}`} className="focus-ring block rounded-card-lg">
                <Card interactive className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-h3 text-text">{e.nom}</p>
                    <Badge tone={e.actif ? "green" : "red"}>{e.actif ? "Actif" : "Inactif"}</Badge>
                  </div>
                  <p className="text-body-sm text-muted">{e.adresse ?? "Aucune adresse renseignée"}</p>
                </Card>
              </Link>
            ))
          )}
        </div>

        <Card className="!p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 p-4">
            <h2 className="text-h2 text-text">Stock par entrepôt et par produit</h2>
            <form className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center" method="get">
              <select
                name="entrepot"
                defaultValue={entrepotFiltre ?? ""}
                className="focus-ring h-tap rounded-input border border-border bg-surface px-3 text-body-sm text-text"
              >
                <option value="">Tous les entrepôts</option>
                {tousLesEntrepots.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nom}
                  </option>
                ))}
              </select>
              <input
                type="text"
                name="q"
                defaultValue={q ?? ""}
                placeholder="Rechercher un produit..."
                className="focus-ring h-tap rounded-input border border-border bg-surface px-3 text-body-sm text-text"
              />
              <button
                type="submit"
                className="focus-ring h-tap rounded-input border border-border bg-surface-2 px-3 text-body-sm text-text hover:bg-border/60"
              >
                Filtrer
              </button>
            </form>
          </div>
          <div className="divide-y divide-border md:hidden">
            {lignesStock.length === 0 ? (
              <p className="p-6 text-center text-body text-muted">Aucune ligne de stock pour ces filtres.</p>
            ) : lignesStock.map((l) => {
              const entrepotLigne = entrepotParId.get(l.entrepot_id);
              return (
                <div key={l.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <Link href={`/admin/stock/${l.produit.id}`} className="focus-ring min-w-0 rounded-input"><p className="truncate text-body font-semibold text-text">{l.produit.nom}</p><p className="font-mono text-body-sm text-muted">{l.produit.code}</p></Link>
                    <StockLevelBadge quantiteStock={l.quantite_stock} seuilAlerte={l.seuil_alerte} />
                  </div>
                  <Link href={`/admin/entrepots/${l.entrepot_id}`} className="focus-ring mt-2 inline-block rounded-input text-body-sm text-muted hover:underline">{entrepotLigne?.nom ?? "—"}</Link>
                  <div className="mt-3 grid grid-cols-2 gap-3 rounded-input bg-surface-2 p-3">
                    <div><p className="text-caption text-muted">Quantité</p><p className="font-mono text-body font-semibold text-text">{formatQuantite(l.quantite_stock, libelleUnite(l.produit.unite, l.quantite_stock))}</p></div>
                    <div className="text-right"><p className="text-caption text-muted">Seuil d’alerte</p><p className="font-mono text-body text-muted">{formatQuantite(l.seuil_alerte)}</p></div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-[720px] w-full border-collapse">
              <thead>
                <tr className="bg-surface-2 text-left text-caption uppercase tracking-[0.1em] text-muted">
                  <th className="px-4 py-2.5 font-medium">Produit</th>
                  <th className="px-4 py-2.5 font-medium">Entrepôt</th>
                  <th className="px-4 py-2.5 text-right font-medium">Quantité</th>
                  <th className="px-4 py-2.5 text-right font-medium">Seuil d&apos;alerte</th>
                  <th className="px-4 py-2.5 font-medium">Niveau</th>
                </tr>
              </thead>
              <tbody>
                {lignesStock.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-body text-muted">
                      Aucune ligne de stock pour ces filtres.
                    </td>
                  </tr>
                ) : (
                  lignesStock.map((l) => {
                    const entrepotLigne = entrepotParId.get(l.entrepot_id);
                    return (
                      <tr key={l.id} className="border-t border-border hover:bg-surface-2">
                        <td className="px-4 py-3">
                          <Link
                            href={`/admin/stock/${l.produit.id}`}
                            className="focus-ring flex flex-col gap-0.5 rounded-input"
                          >
                            <span className="text-body font-medium text-text hover:underline">{l.produit.nom}</span>
                            <span className="font-mono text-body-sm text-muted">{l.produit.code}</span>
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/admin/entrepots/${l.entrepot_id}`}
                            className="focus-ring rounded-input text-body-sm text-text hover:underline"
                          >
                            {entrepotLigne?.nom ?? "—"}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-body text-text">
                          {formatQuantite(l.quantite_stock, libelleUnite(l.produit.unite, l.quantite_stock))}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-body text-muted">
                          {formatQuantite(l.seuil_alerte)}
                        </td>
                        <td className="px-4 py-3">
                          <StockLevelBadge quantiteStock={l.quantite_stock} seuilAlerte={l.seuil_alerte} />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </BrandedListPanel>
    </div>
  );
}

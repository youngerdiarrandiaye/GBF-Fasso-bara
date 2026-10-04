import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatQuantite, libelleUnite } from "@/lib/format";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { StockLevelBadge } from "@/components/admin/StockLevelBadge";
import { Breadcrumbs } from "@/components/admin/Breadcrumbs";
import { RealtimeRevalidate } from "@/components/admin/RealtimeRevalidate";
import { StockEntrepotRowActions } from "@/components/admin/StockEntrepotRowActions";
import { AddProductToEntrepotButton } from "@/components/admin/AddProductToEntrepotButton";
import type { EntrepotRow, StockEntrepotAvecProduit } from "@/lib/supabase/database.types";
import { EmptyState } from "@/components/ui/EmptyState";
import { faBoxesStacked } from "@fortawesome/free-solid-svg-icons";

export const dynamic = "force-dynamic";

export default async function EntrepotDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: entrepot } = await supabase.from("entrepots").select("*").eq("id", id).single();
  if (!entrepot) {
    notFound();
  }

  const [{ data: stockData }, { data: tousLesProduitsActifs }] = await Promise.all([
    supabase
      .from("stock_entrepot")
      .select("*, produit:produits(id, code, nom, unite, actif)")
      .eq("entrepot_id", id)
      .order("produit_id"),
    supabase.from("produits").select("id, code, nom, unite").eq("actif", true).order("nom"),
  ]);

  let lignesStock = (stockData as unknown as StockEntrepotAvecProduit[]) ?? [];
  lignesStock = [...lignesStock].sort((a, b) => {
    const critiqueA = a.quantite_stock <= a.seuil_alerte ? 0 : 1;
    const critiqueB = b.quantite_stock <= b.seuil_alerte ? 0 : 1;
    return critiqueA - critiqueB;
  });

  // Produits actifs qui n'ont encore aucune ligne stock_entrepot pour CET
  // entrepôt (première mise en stock, cf. AddProductToEntrepotButton) —
  // calculé en JS plutôt qu'en SQL (NOT IN sous-requête) : volume de
  // catalogue attendu (quelques dizaines de produits) rend ce calcul trivial
  // côté serveur, même approche que /admin/stock (tri stock critique).
  const idsAvecStock = new Set(lignesStock.map((l) => l.produit_id));
  const produitsSansStock = (tousLesProduitsActifs ?? []).filter((p) => !idsAvecStock.has(p.id));

  const entrepotTyped = entrepot as EntrepotRow;

  return (
    <div className="flex flex-col gap-6">
      <RealtimeRevalidate tables={["entrepots", "stock_entrepot"]} />

      <Breadcrumbs items={[{ label: "Entrepôts", href: "/admin/entrepots" }, { label: entrepotTyped.nom }]} />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-h1 font-semibold tracking-tight text-text">{entrepotTyped.nom}</h1>
            <Badge tone={entrepotTyped.actif ? "green" : "red"}>
              {entrepotTyped.actif ? "Actif" : "Inactif"}
            </Badge>
          </div>
          <p className="mt-1 text-body text-muted">{entrepotTyped.adresse ?? "Aucune adresse renseignée"}</p>
        </div>
        <AddProductToEntrepotButton
          entrepotId={entrepotTyped.id}
          entrepotNom={entrepotTyped.nom}
          produitsSansStock={produitsSansStock}
        />
      </div>

      <Card className="!p-0">
        <div className="p-4">
          <h2 className="text-h2 text-text">Stock de cet entrepôt</h2>
          <p className="text-body-sm text-muted">
            Source de vérité du stock (règle métier 16) — ajustement manuel avec motif obligatoire.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[700px] w-full border-collapse">
            <thead>
              <tr className="border-b border-border text-left text-caption uppercase tracking-[0.06em] text-muted">
                <th className="px-4 py-2.5 font-medium">Produit</th>
                <th className="px-4 py-2.5 text-right font-medium">Quantité</th>
                <th className="px-4 py-2.5 text-right font-medium">Seuil d&apos;alerte</th>
                <th className="px-4 py-2.5 font-medium">Niveau</th>
                <th className="px-4 py-2.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {lignesStock.length === 0 ? (
                <tr>
                  <td colSpan={5}><EmptyState icone={faBoxesStacked} titre="Aucun produit en stock dans cet entrepôt pour le moment." /></td>
                </tr>
              ) : (
                lignesStock.map((l) => (
                  <tr key={l.id} className="border-t border-border hover:bg-surface-2">
                    <td className="px-4 py-3">
                      <span className="text-body font-medium text-text">{l.produit.nom}</span>
                      <span className="ml-2 font-mono text-body-sm text-muted">{l.produit.code}</span>
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
                    <td className="px-4 py-3">
                      <StockEntrepotRowActions
                        produitId={l.produit.id}
                        produitNom={l.produit.nom}
                        produitCode={l.produit.code}
                        unite={l.produit.unite}
                        entrepotId={entrepotTyped.id}
                        entrepotNom={entrepotTyped.nom}
                        quantiteStock={l.quantite_stock}
                        seuilAlerte={l.seuil_alerte}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

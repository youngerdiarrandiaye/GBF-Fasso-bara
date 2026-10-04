import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, formatQuantite, libelleUnite } from "@/lib/format";
import { Card } from "@/components/ui/Card";
import { TransfertStatusBadge } from "@/components/ui/TransfertStatusBadge";
import { QuickActionGrid } from "@/components/ui/QuickActionGrid";
import { BrandedListPanel } from "@/components/admin/BrandedListPanel";
import { RealtimeRevalidate } from "@/components/admin/RealtimeRevalidate";
import { NewTransfertButton } from "@/components/admin/NewTransfertButton";
import { TransfertActions } from "@/components/admin/TransfertActions";
import { Pagination } from "@/components/admin/Pagination";
import type {
  EntrepotRow,
  EntrepriseConfigRow,
  StatutTransfertStock,
  TransfertAvecDetails,
} from "@/lib/supabase/database.types";
import { faBoxesStacked, faCheck, faClock, faRightLeft } from "@fortawesome/free-solid-svg-icons";
import { EmptyState } from "@/components/ui/EmptyState";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 15;
const STATUTS: { value: StatutTransfertStock; label: string }[] = [
  { value: "demande", label: "Demandé" },
  { value: "en_transit", label: "En transit" },
  { value: "receptionne", label: "Réceptionné" },
  { value: "annule", label: "Annulé" },
];

/**
 * Écran "Transferts de stock" — règle métier 16. Historique
 * `demande -> en_transit -> receptionne` (+ `annule`), création d'une
 * demande (deux `EntrepotSelector`, exclusion croisée), réception réservée
 * admin (RLS, cf. TransfertActions).
 */
export default async function TransfertsPage({
  searchParams,
}: {
  searchParams: Promise<{ statut?: string; page?: string }>;
}) {
  const { statut, page } = await searchParams;
  const pageActuelle = Math.max(1, parseInt(page ?? "1", 10) || 1);
  const supabase = await createClient();

  const [{ data: entrepots }, { data: produits }, { data: stockData }, { data: entreprise }] = await Promise.all([
    supabase.from("entrepots").select("*").order("nom"),
    supabase.from("produits").select("id, code, nom, unite").eq("actif", true).order("nom"),
    supabase.from("stock_entrepot").select("produit_id, entrepot_id, quantite_stock"),
    supabase.from("entreprise_config").select("nom, logo_url").eq("id", true).single(),
  ]);
  const config = entreprise as Pick<EntrepriseConfigRow, "nom" | "logo_url"> | null;
  const tousLesEntrepots = (entrepots as EntrepotRow[]) ?? [];

  const stockParProduit: Record<string, Record<string, number>> = {};
  (stockData ?? []).forEach((s) => {
    if (!stockParProduit[s.produit_id]) stockParProduit[s.produit_id] = {};
    stockParProduit[s.produit_id][s.entrepot_id] = s.quantite_stock;
  });

  let requete = supabase
    .from("transferts_stock")
    .select(
      "*, produit:produits(id, code, nom, unite), entrepot_source:entrepots!transferts_stock_entrepot_source_id_fkey(id, nom), entrepot_destination:entrepots!transferts_stock_entrepot_destination_id_fkey(id, nom), demande_par:utilisateurs!transferts_stock_demande_par_id_fkey(id, nom), receptionne_par:utilisateurs!transferts_stock_receptionne_par_id_fkey(id, nom)",
      { count: "exact" }
    )
    .order("date_demande", { ascending: false });

  if (statut) requete = requete.eq("statut", statut);

  const offset = (pageActuelle - 1) * PAGE_SIZE;
  const { data, count } = await requete.range(offset, offset + PAGE_SIZE - 1);
  const transferts = (data as unknown as TransfertAvecDetails[]) ?? [];
  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  function buildHref(cible: number) {
    const params = new URLSearchParams();
    if (statut) params.set("statut", statut);
    if (cible > 1) params.set("page", String(cible));
    const qs = params.toString();
    return qs ? `/admin/transferts?${qs}` : "/admin/transferts";
  }

  return (
    <div className="flex flex-col gap-6">
      <RealtimeRevalidate tables={["transferts_stock", "stock_entrepot"]} />

      <BrandedListPanel
        nom={config?.nom ?? "GIE FASSO BARA"}
        logoUrl={config?.logo_url ?? null}
        title="Transferts de stock"
        subtitle="Demandes de transfert entre entrepôts, de la demande à la réception."
        actions={
          <NewTransfertButton
            entrepots={tousLesEntrepots}
            produits={produits ?? []}
            stockParProduit={stockParProduit}
          />
        }
      >
        <QuickActionGrid
          actions={[
            { href: "/admin/transferts", label: "Demandes", description: "Tous les transferts", icon: faRightLeft, tone: "blue" },
            { href: "/admin/transferts?statut=demande", label: "À traiter", description: "Demandes ouvertes", icon: faClock, tone: "amber" },
            { href: "/admin/transferts?statut=receptionne", label: "Reçus", description: "Transferts validés", icon: faCheck, tone: "green" },
            { href: "/admin/stock", label: "Stock", description: "Voir produits", icon: faBoxesStacked, tone: "purple" },
          ]}
          columns={4}
        />

        <Card>
          <form className="flex flex-wrap items-center gap-2" method="get">
            <label htmlFor="f-statut" className="text-body font-medium text-text">
              Statut
            </label>
            <select
              id="f-statut"
              name="statut"
              defaultValue={statut ?? ""}
              className="focus-ring h-tap rounded-input border border-border bg-surface px-3 text-body-sm text-text"
            >
              <option value="">Tous les statuts</option>
              {STATUTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="focus-ring h-tap rounded-input border border-border bg-surface-2 px-3 text-body-sm text-text hover:bg-border/60"
            >
              Filtrer
            </button>
            {statut && <Link href="/admin/transferts" className="focus-ring min-h-11 rounded-input px-3 py-2.5 text-body-sm font-medium text-green-text hover:underline">Réinitialiser</Link>}
          </form>
        </Card>

        <Card className="!p-0">
          <div className="divide-y divide-border md:hidden">
            {transferts.length === 0 ? (
              <EmptyState icone={faRightLeft} titre="Aucun transfert pour ces filtres." description="Modifiez ou effacez les filtres pour élargir la recherche." action={{ href: "/admin/transferts", label: "Effacer les filtres", variante: "outline" }} />
            ) : transferts.map((t) => (
              <div key={t.id} className="p-4">
                <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-body font-semibold text-text">{t.produit.nom}</p><p className="font-mono text-body-sm text-muted">{t.produit.code}</p></div><TransfertStatusBadge statut={t.statut} /></div>
                <p className="mt-3 text-body-sm text-text">{t.entrepot_source.nom} → {t.entrepot_destination.nom}</p>
                <div className="mt-2 flex items-end justify-between gap-3"><div><p className="font-mono text-body font-semibold text-text">{formatQuantite(t.quantite, libelleUnite(t.produit.unite, t.quantite))}</p><p className="text-caption text-muted">{formatDateTime(t.date_demande)}</p></div><TransfertActions transfertId={t.id} statut={t.statut} produitNom={t.produit.nom} entrepotSourceNom={t.entrepot_source.nom} entrepotDestinationNom={t.entrepot_destination.nom} /></div>
              </div>
            ))}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-surface-2 text-left text-caption uppercase tracking-[0.1em] text-muted">
                  <th className="px-4 py-2.5 font-medium">Produit</th>
                  <th className="px-4 py-2.5 font-medium">Source → Destination</th>
                  <th className="px-4 py-2.5 text-right font-medium">Quantité</th>
                  <th className="px-4 py-2.5 font-medium">Statut</th>
                  <th className="px-4 py-2.5 font-medium">Demandé par</th>
                  <th className="px-4 py-2.5 font-medium">Date</th>
                  <th className="px-4 py-2.5 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {transferts.length === 0 ? (
                  <tr>
                    <td colSpan={7}><EmptyState icone={faRightLeft} titre="Aucun transfert pour ces filtres." description="Modifiez ou effacez les filtres pour élargir la recherche." action={{ href: "/admin/transferts", label: "Effacer les filtres", variante: "outline" }} /></td>
                  </tr>
                ) : (
                  transferts.map((t) => (
                    <tr key={t.id} className="border-t border-border hover:bg-surface-2">
                      <td className="px-4 py-3">
                        <span className="text-body font-medium text-text">{t.produit.nom}</span>
                        <span className="ml-2 font-mono text-body-sm text-muted">{t.produit.code}</span>
                      </td>
                      <td className="px-4 py-3 text-body-sm text-text">
                        {t.entrepot_source.nom} → {t.entrepot_destination.nom}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-body text-text">
                        {formatQuantite(t.quantite, libelleUnite(t.produit.unite, t.quantite))}
                      </td>
                      <td className="px-4 py-3">
                        <TransfertStatusBadge statut={t.statut} />
                      </td>
                      <td className="px-4 py-3 text-body-sm text-muted">{t.demande_par?.nom ?? "—"}</td>
                      <td className="px-4 py-3 text-body-sm text-muted">{formatDateTime(t.date_demande)}</td>
                      <td className="px-4 py-3">
                        <TransfertActions
                          transfertId={t.id}
                          statut={t.statut}
                          produitNom={t.produit.nom}
                          entrepotSourceNom={t.entrepot_source.nom}
                          entrepotDestinationNom={t.entrepot_destination.nom}
                        />
                      </td>
                    </tr>
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
            itemLabel="transfert"
          />
        </Card>
      </BrandedListPanel>
    </div>
  );
}

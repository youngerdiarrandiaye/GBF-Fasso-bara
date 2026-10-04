import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { BonLivraisonStatusBadge } from "@/components/ui/BonLivraisonStatusBadge";
import { QuickActionGrid } from "@/components/ui/QuickActionGrid";
import { BrandedListPanel } from "@/components/admin/BrandedListPanel";
import { RealtimeRevalidate } from "@/components/admin/RealtimeRevalidate";
import { ClickableTableRow } from "@/components/admin/ClickableTableRow";
import { Pagination } from "@/components/admin/Pagination";
import type {
  BonLivraisonAvecDetails,
  EntrepriseConfigRow,
  StatutBonLivraison,
} from "@/lib/supabase/database.types";
import { faFileInvoice, faMoneyBillWave, faPlus, faTruck } from "@fortawesome/free-solid-svg-icons";
import { EmptyState } from "@/components/ui/EmptyState";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 15;
const STATUTS: { value: StatutBonLivraison; label: string }[] = [
  { value: "livre_non_paye", label: "Livré, non payé" },
  { value: "livre_paye", label: "Livré, payé" },
];

/** Écran "Bons de livraison" — règle métier 15. Vue globale tous agents confondus (admin). */
export default async function BonsLivraisonPage({
  searchParams,
}: {
  searchParams: Promise<{ statut?: string; page?: string }>;
}) {
  const { statut, page } = await searchParams;
  const pageActuelle = Math.max(1, parseInt(page ?? "1", 10) || 1);
  const supabase = await createClient();

  const { data: entreprise } = await supabase
    .from("entreprise_config")
    .select("nom, logo_url")
    .eq("id", true)
    .single();
  const config = entreprise as Pick<EntrepriseConfigRow, "nom" | "logo_url"> | null;

  let requete = supabase
    .from("bons_livraison")
    .select(
      "*, client:clients(id, nom, telephone), agent:utilisateurs!bons_livraison_agent_id_fkey(id, nom), entrepot:entrepots(id, nom)",
      { count: "exact" }
    )
    .order("created_at", { ascending: false });

  if (statut) requete = requete.eq("statut", statut);

  const offset = (pageActuelle - 1) * PAGE_SIZE;
  const { data, count } = await requete.range(offset, offset + PAGE_SIZE - 1);
  const bonsLivraison = (data as unknown as BonLivraisonAvecDetails[]) ?? [];
  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  function buildHref(cible: number) {
    const params = new URLSearchParams();
    if (statut) params.set("statut", statut);
    if (cible > 1) params.set("page", String(cible));
    const qs = params.toString();
    return qs ? `/admin/bons-livraison?${qs}` : "/admin/bons-livraison";
  }

  return (
    <div className="flex flex-col gap-6">
      <RealtimeRevalidate tables={["bons_livraison"]} />

      <BrandedListPanel
        nom={config?.nom ?? "GIE FASSO BARA"}
        logoUrl={config?.logo_url ?? null}
        title="Bons de livraison"
        subtitle="Livraisons physiques, avec ou sans facture associée."
        actions={
          <Link href="/admin/bons-livraison/nouveau">
            <Button>+ Nouveau bon de livraison</Button>
          </Link>
        }
      >
        <QuickActionGrid
          actions={[
            { href: "/admin/bons-livraison/nouveau", label: "Créer", description: "Bon de livraison", icon: faPlus, tone: "green" },
            { href: "/admin/bons-livraison?statut=livre_non_paye", label: "À payer", description: "Livrés non payés", icon: faMoneyBillWave, tone: "amber" },
            { href: "/admin/factures", label: "Factures", description: "Lier une vente", icon: faFileInvoice, tone: "blue" },
            { href: "/admin/bons-livraison?statut=livre_paye", label: "Livrés", description: "Historique payé", icon: faTruck, tone: "green" },
          ]}
          columns={4}
        />

        <Card>
          <form className="flex flex-wrap items-center gap-2" method="get">
            <label htmlFor="f-statut-bl" className="text-body font-medium text-text">
              Statut
            </label>
            <select
              id="f-statut-bl"
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
            {statut && <Link href="/admin/bons-livraison" className="focus-ring min-h-11 rounded-input px-3 py-2.5 text-body-sm font-medium text-green-text hover:underline">Réinitialiser</Link>}
          </form>
        </Card>

        <Card className="!p-0">
          <div className="divide-y divide-border md:hidden">
            {bonsLivraison.length === 0 ? (
              <EmptyState icone={faTruck} titre="Aucun bon de livraison pour ces filtres." description="Modifiez ou effacez les filtres pour élargir la recherche." action={{ href: "/admin/bons-livraison", label: "Effacer les filtres", variante: "outline" }} />
            ) : bonsLivraison.map((bl) => (
              <Link key={bl.id} href={`/admin/bons-livraison/${bl.id}`} className="focus-ring block p-4 transition-colors hover:bg-surface-2">
                <div className="flex items-start justify-between gap-3"><div><p className="font-mono text-body-sm font-semibold text-text">{bl.numero}</p><p className="mt-1 text-body font-medium text-text">{bl.client?.nom}</p></div><BonLivraisonStatusBadge statut={bl.statut} /></div>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-body-sm text-muted"><span>{formatDate(bl.date_livraison)}</span><span>{bl.entrepot?.nom}</span><span>{bl.agent?.nom}</span></div>
              </Link>
            ))}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border text-left text-caption uppercase tracking-[0.06em] text-muted">
                  <th className="px-4 py-2.5 font-medium">Numéro</th>
                  <th className="px-4 py-2.5 font-medium">Client</th>
                  <th className="px-4 py-2.5 font-medium">Entrepôt</th>
                  <th className="px-4 py-2.5 font-medium">Agent</th>
                  <th className="px-4 py-2.5 font-medium">Date</th>
                  <th className="px-4 py-2.5 font-medium">Statut</th>
                </tr>
              </thead>
              <tbody>
                {bonsLivraison.length === 0 ? (
                  <tr>
                    <td colSpan={6}><EmptyState icone={faTruck} titre="Aucun bon de livraison pour ces filtres." description="Modifiez ou effacez les filtres pour élargir la recherche." action={{ href: "/admin/bons-livraison", label: "Effacer les filtres", variante: "outline" }} /></td>
                  </tr>
                ) : (
                  bonsLivraison.map((bl) => (
                    <ClickableTableRow
                      key={bl.id}
                      href={`/admin/bons-livraison/${bl.id}`}
                      className="border-t border-border hover:bg-surface-2"
                    >
                      <td className="px-4 py-3">
                        <span className="rounded-input bg-surface-2 px-2 py-1 font-mono text-body-sm text-text">
                          {bl.numero}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-body text-text">{bl.client?.nom}</td>
                      <td className="px-4 py-3 text-body-sm text-muted">{bl.entrepot?.nom}</td>
                      <td className="px-4 py-3 text-body-sm text-muted">{bl.agent?.nom}</td>
                      <td className="px-4 py-3 text-body-sm text-muted">{formatDate(bl.date_livraison)}</td>
                      <td className="px-4 py-3">
                        <BonLivraisonStatusBadge statut={bl.statut} />
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
            itemLabel="bon de livraison"
          />
        </Card>
      </BrandedListPanel>
    </div>
  );
}

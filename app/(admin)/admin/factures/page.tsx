import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatMontant, formatDate } from "@/lib/format";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { QuickActionGrid } from "@/components/ui/QuickActionGrid";
import { OverdueBadge } from "@/components/facture/OverdueBadge";
import { InvoicesFilters } from "@/components/admin/InvoicesFilters";
import { Pagination } from "@/components/admin/Pagination";
import { RealtimeRevalidate } from "@/components/admin/RealtimeRevalidate";
import { BrandedListPanel } from "@/components/admin/BrandedListPanel";
import { faFileCirclePlus, faFileInvoice, faMoneyBillWave, faTruck, faUsers } from "@fortawesome/free-solid-svg-icons";
import type {
  ClientRow,
  EntrepriseConfigRow,
  FactureAvecClientEtAgent,
  FactureRetardPaiementRow,
  StatutFacture,
  UtilisateurRow,
} from "@/lib/supabase/database.types";
import { EmptyState } from "@/components/ui/EmptyState";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 10;

export default async function FacturesAdminPage({
  searchParams,
}: {
  searchParams: Promise<{
    numero?: string;
    statut?: string;
    client?: string;
    agent?: string;
    debut?: string;
    fin?: string;
    page?: string;
  }>;
}) {
  const { numero, statut, client, agent, debut, fin, page } = await searchParams;
  const pageActuelle = Math.max(1, parseInt(page ?? "1", 10) || 1);
  const supabase = await createClient();

  const [{ data: clients }, { data: agents }, { data: entreprise }] = await Promise.all([
    supabase.from("clients").select("id, nom").order("nom"),
    supabase.from("utilisateurs").select("id, nom").eq("role", "agent").order("nom"),
    supabase.from("entreprise_config").select("nom, logo_url").eq("id", true).single(),
  ]);
  const config = entreprise as Pick<EntrepriseConfigRow, "nom" | "logo_url"> | null;

  let requete = supabase
    .from("factures")
    .select(
      "id, numero, client_id, agent_id, statut, total_ht, forfait_transport, tva_taux, total_general, date_facture, date_validation, notes, created_at, updated_at, client:clients(id, nom, telephone, type_client), agent:utilisateurs!factures_agent_id_fkey(id, nom)",
      { count: "exact" }
    )
    .order("created_at", { ascending: false });

  if (numero) requete = requete.ilike("numero", `%${numero}%`);
  if (statut) requete = requete.eq("statut", statut as StatutFacture);
  if (client) requete = requete.eq("client_id", client);
  if (agent) requete = requete.eq("agent_id", agent);
  if (debut) requete = requete.gte("date_facture", debut);
  if (fin) requete = requete.lte("date_facture", fin);

  const offset = (pageActuelle - 1) * PAGE_SIZE;
  const { data, count } = await requete.range(offset, offset + PAGE_SIZE - 1);
  const factures = (data as unknown as FactureAvecClientEtAgent[]) ?? [];
  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  function buildHref(cible: number) {
    const params = new URLSearchParams();
    if (numero) params.set("numero", numero);
    if (statut) params.set("statut", statut);
    if (client) params.set("client", client);
    if (agent) params.set("agent", agent);
    if (debut) params.set("debut", debut);
    if (fin) params.set("fin", fin);
    if (cible > 1) params.set("page", String(cible));
    const qs = params.toString();
    return qs ? `/admin/factures?${qs}` : "/admin/factures";
  }

  const idsFactures = factures.map((f) => f.id);
  const { data: retardsData } = idsFactures.length
    ? await supabase
        .from("v_factures_retard_paiement")
        .select("facture_id, jours_de_retard")
        .in("facture_id", idsFactures)
    : { data: [] };

  const joursDeRetardParFacture = new Map<string, number>(
    ((retardsData as Pick<FactureRetardPaiementRow, "facture_id" | "jours_de_retard">[]) ?? []).map((r) => [
      r.facture_id,
      r.jours_de_retard,
    ])
  );

  return (
    <div className="flex flex-col gap-6">
      <RealtimeRevalidate tables={["factures"]} />

      <BrandedListPanel
        nom={config?.nom ?? "GIE FASSO BARA"}
        logoUrl={config?.logo_url ?? null}
        title="Factures"
        subtitle="Vue globale, tous agents confondus."
        actions={
          <Link href="/admin/nouvelle-facture">
            <Button>+ Nouvelle facture</Button>
          </Link>
        }
      >
        <QuickActionGrid
          actions={[
            { href: "/admin/nouvelle-facture", label: "Créer", description: "Nouvelle facture", icon: faFileCirclePlus, tone: "green" },
            { href: "/admin/paiements", label: "Encaisser", description: "Factures à payer", icon: faMoneyBillWave, tone: "amber" },
            { href: "/admin/bons-livraison/nouveau", label: "Livrer", description: "Bon de livraison", icon: faTruck, tone: "blue" },
            { href: "/admin/clients", label: "Clients", description: "Répertoire", icon: faUsers, tone: "purple" },
          ]}
          columns={4}
        />

        <Card>
          <InvoicesFilters
            clients={(clients as Pick<ClientRow, "id" | "nom">[]) ?? []}
            agents={(agents as Pick<UtilisateurRow, "id" | "nom">[]) ?? []}
          />
        </Card>

        <Card className="!p-0">
          <div className="divide-y divide-border md:hidden">
            {factures.length === 0 ? (
              <EmptyState icone={faFileInvoice} titre="Aucune facture ne correspond à ces filtres." description="Modifiez ou effacez les filtres pour élargir la recherche." action={{ href: "/admin/factures", label: "Effacer les filtres", variante: "outline" }} />
            ) : factures.map((facture) => (
              <Link key={facture.id} href={`/admin/factures/${facture.id}`} className="focus-ring block p-4 transition-colors hover:bg-surface-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-body-sm font-semibold text-text">{facture.numero}</p>
                    <p className="mt-1 truncate text-body font-medium text-text">{facture.client?.nom}</p>
                  </div>
                  <p className="shrink-0 font-mono text-body font-semibold text-text">{formatMontant(facture.total_general)}</p>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <StatusBadge statut={facture.statut} />
                  {joursDeRetardParFacture.has(facture.id) && <OverdueBadge joursDeRetard={joursDeRetardParFacture.get(facture.id)!} />}
                </div>
                <p className="mt-3 text-body-sm text-muted">{facture.agent?.nom} · {formatDate(facture.date_facture)}</p>
              </Link>
            ))}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-[800px] w-full border-collapse">
              <thead>
                <tr className="border-b border-border text-left text-caption uppercase tracking-[0.06em] text-muted">
                  <th className="px-4 py-2.5 font-medium">Numéro</th>
                  <th className="px-4 py-2.5 font-medium">Client</th>
                  <th className="px-4 py-2.5 font-medium">Agent</th>
                  <th className="px-4 py-2.5 font-medium">Date</th>
                  <th className="px-4 py-2.5 font-medium">Statut</th>
                  <th className="px-4 py-2.5 text-right font-medium">Montant</th>
                </tr>
              </thead>
              <tbody>
                {factures.length === 0 ? (
                  <tr>
                    <td colSpan={6}><EmptyState icone={faFileInvoice} titre="Aucune facture ne correspond à ces filtres." description="Modifiez ou effacez les filtres pour élargir la recherche." action={{ href: "/admin/factures", label: "Effacer les filtres", variante: "outline" }} /></td>
                  </tr>
                ) : (
                  factures.map((facture) => (
                    <tr key={facture.id} className="border-t border-border hover:bg-surface-2">
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/factures/${facture.id}`}
                          className="focus-ring rounded-input bg-surface-2 px-2 py-1 font-mono text-body-sm text-text hover:underline"
                        >
                          {facture.numero}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-body text-text">{facture.client?.nom}</td>
                      <td className="px-4 py-3 text-body-sm text-muted">{facture.agent?.nom}</td>
                      <td className="px-4 py-3 text-body-sm text-muted">{formatDate(facture.date_facture)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge statut={facture.statut} />
                          {joursDeRetardParFacture.has(facture.id) && (
                            <OverdueBadge joursDeRetard={joursDeRetardParFacture.get(facture.id)!} />
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-body text-text">
                        {formatMontant(facture.total_general)}
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
          />
        </Card>
      </BrandedListPanel>
    </div>
  );
}

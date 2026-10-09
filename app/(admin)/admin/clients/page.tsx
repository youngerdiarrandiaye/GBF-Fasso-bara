import { Suspense } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatMontant } from "@/lib/format";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { QuickActionGrid } from "@/components/ui/QuickActionGrid";
import { SearchInput } from "@/components/admin/SearchInput";
import { NewClientButton } from "@/components/admin/NewClientButton";
import { BrandedListPanel } from "@/components/admin/BrandedListPanel";
import { ClickableTableRow } from "@/components/admin/ClickableTableRow";
import { Pagination } from "@/components/admin/Pagination";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFileCirclePlus, faFileImport, faMoneyBillWave, faUserPlus, faUsers, faWallet } from "@fortawesome/free-solid-svg-icons";
import type { ClientRow, EntrepriseConfigRow } from "@/lib/supabase/database.types";
import { EmptyState } from "@/components/ui/EmptyState";

export const dynamic = "force-dynamic";

const STATUTS_SOLDE = ["validee", "payee_partielle"];
const LIBELLES_TYPE: Record<string, string> = {
  particulier: "Particulier",
  entreprise: "Entreprise",
  cooperative: "Coopérative",
};
const PAGE_SIZE = 10;

export default async function ClientsAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q, page } = await searchParams;
  const pageActuelle = Math.max(1, parseInt(page ?? "1", 10) || 1);
  const supabase = await createClient();

  const { data: entreprise } = await supabase
    .from("entreprise_config")
    .select("nom, logo_url")
    .eq("id", true)
    .single();
  const config = entreprise as Pick<EntrepriseConfigRow, "nom" | "logo_url"> | null;

  let requete = supabase.from("clients").select("*", { count: "exact" }).order("nom");
  if (q) {
    requete = requete.or(`nom.ilike.%${q}%,telephone.ilike.%${q}%,region.ilike.%${q}%`);
  }

  const offset = (pageActuelle - 1) * PAGE_SIZE;
  const { data: clientsData, count } = await requete.range(offset, offset + PAGE_SIZE - 1);
  const clients = (clientsData as ClientRow[]) ?? [];
  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  function buildHref(cible: number) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (cible > 1) params.set("page", String(cible));
    const qs = params.toString();
    return qs ? `/admin/clients?${qs}` : "/admin/clients";
  }

  const clientIds = clients.map((c) => c.id);

  const { data: facturesData } = clientIds.length
    ? await supabase
        .from("factures")
        .select("id, client_id, statut, total_general")
        .in("client_id", clientIds)
    : { data: [] };

  const facturesImpayees = (facturesData ?? []).filter((f) => STATUTS_SOLDE.includes(f.statut));
  const factureIdsImpayees = facturesImpayees.map((f) => f.id);

  const { data: paiementsData } = factureIdsImpayees.length
    ? await supabase.from("paiements").select("facture_id, montant").in("facture_id", factureIdsImpayees)
    : { data: [] };
  const { data: creditsData } = factureIdsImpayees.length
    ? await supabase.from("credits").select("facture_id, montant_rembourse").in("facture_id", factureIdsImpayees)
    : { data: [] };

  const paiementsParFacture = new Map<string, number>();
  (paiementsData ?? []).forEach((p) => {
    paiementsParFacture.set(p.facture_id, (paiementsParFacture.get(p.facture_id) ?? 0) + p.montant);
  });
  (creditsData ?? []).forEach((c) => {
    if (!c.facture_id) return;
    paiementsParFacture.set(c.facture_id, (paiementsParFacture.get(c.facture_id) ?? 0) + c.montant_rembourse);
  });

  const soldeParClient = new Map<string, number>();
  const nbFacturesParClient = new Map<string, number>();
  (facturesData ?? []).forEach((f) => {
    nbFacturesParClient.set(f.client_id, (nbFacturesParClient.get(f.client_id) ?? 0) + 1);
  });
  facturesImpayees.forEach((f) => {
    const paye = paiementsParFacture.get(f.id) ?? 0;
    const reste = Math.max(0, f.total_general - paye);
    soldeParClient.set(f.client_id, (soldeParClient.get(f.client_id) ?? 0) + reste);
  });

  return (
    <div className="flex flex-col gap-6">
      <BrandedListPanel
        nom={config?.nom ?? "GIE FASSO BARA"}
        logoUrl={config?.logo_url ?? null}
        title="Clients"
        subtitle="Répertoire client et solde impayé."
        actions={
          <>
            <Link
              href="/admin/clients/importer"
              className="focus-ring inline-flex h-tap items-center gap-2 rounded-input border border-border bg-surface px-4 text-body font-medium text-text hover:bg-surface-2"
            >
              <FontAwesomeIcon icon={faFileImport} className="h-4 w-4" aria-hidden="true" />
              Importer
            </Link>
            <NewClientButton />
          </>
        }
      >
        <QuickActionGrid
          actions={[
            { href: "/admin/clients", label: "Chercher", description: "Client existant", icon: faUserPlus, tone: "blue" },
            { href: "/admin/nouvelle-facture", label: "Facturer", description: "Vente client", icon: faFileCirclePlus, tone: "green" },
            { href: "/admin/credits", label: "Crédits", description: "Encours client", icon: faWallet, tone: "amber" },
            { href: "/admin/paiements", label: "Paiements", description: "Encaisser", icon: faMoneyBillWave, tone: "purple" },
          ]}
          columns={4}
        />

        <Card>
          <Suspense>
            <SearchInput label="Rechercher" placeholder="Nom, téléphone ou région..." />
          </Suspense>
        </Card>

        <Card className="!p-0">
          <div className="divide-y divide-border md:hidden">
            {clients.length === 0 ? (
              <EmptyState icone={faUsers} titre="Aucun client trouvé." description="Modifiez la recherche ou ajoutez un nouveau client." />
            ) : clients.map((client) => {
              const solde = soldeParClient.get(client.id) ?? 0;
              return (
                <Link key={client.id} href={`/admin/clients/${client.id}`} className="focus-ring block p-4 transition-colors hover:bg-surface-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><p className="truncate text-body font-semibold text-text">{client.nom}</p><p className="mt-1 text-body-sm text-muted">{client.telephone ?? "Aucun téléphone"}{client.region ? ` · ${client.region}` : ""}</p></div>
                    <Badge>{LIBELLES_TYPE[client.type_client]}</Badge>
                  </div>
                  <div className="mt-3 flex items-end justify-between gap-3"><p className="text-body-sm text-muted">{nbFacturesParClient.get(client.id) ?? 0} facture(s)</p><div className="text-right"><p className="text-caption uppercase tracking-wide text-muted">Impayé</p><p className={`font-mono text-body font-semibold ${solde > 0 ? "text-red-text" : "text-text"}`}>{formatMontant(solde)}</p></div></div>
                </Link>
              );
            })}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border text-left text-caption uppercase tracking-[0.06em] text-muted">
                  <th className="px-4 py-2.5 font-medium">Client</th>
                  <th className="px-4 py-2.5 font-medium">Type</th>
                  <th className="px-4 py-2.5 font-medium">Téléphone</th>
                  <th className="px-4 py-2.5 text-right font-medium">Factures</th>
                  <th className="px-4 py-2.5 text-right font-medium">Solde impayé</th>
                </tr>
              </thead>
              <tbody>
                {clients.length === 0 ? (
                  <tr>
                    <td colSpan={5}><EmptyState icone={faUsers} titre="Aucun client trouvé." description="Modifiez la recherche ou ajoutez un nouveau client." /></td>
                  </tr>
                ) : (
                  clients.map((client) => {
                    const solde = soldeParClient.get(client.id) ?? 0;
                    return (
                      <ClickableTableRow
                        key={client.id}
                        href={`/admin/clients/${client.id}`}
                        className="border-t border-border hover:bg-surface-2"
                      >
                        <td className="px-4 py-3">
                          <Link
                            href={`/admin/clients/${client.id}`}
                            className="focus-ring rounded-input text-body font-medium text-text hover:underline"
                          >
                            {client.nom}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <Badge>{LIBELLES_TYPE[client.type_client]}</Badge>
                        </td>
                        <td className="px-4 py-3 text-body-sm text-muted">{client.telephone ?? "—"}{client.region && <span className="block text-caption">{client.region}</span>}</td>
                        <td className="px-4 py-3 text-right font-mono text-body text-muted">
                          {nbFacturesParClient.get(client.id) ?? 0}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-body text-text">
                          {solde > 0 ? (
                            <span className="text-red-text">{formatMontant(solde)}</span>
                          ) : (
                            formatMontant(0)
                          )}
                        </td>
                      </ClickableTableRow>
                    );
                  })
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
            itemLabel="client"
          />
        </Card>
      </BrandedListPanel>
    </div>
  );
}

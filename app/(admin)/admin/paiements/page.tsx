import { Suspense } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatMontant, formatDate } from "@/lib/format";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/admin/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { QuickActionGrid } from "@/components/ui/QuickActionGrid";
import { RegisterPaymentButton } from "@/components/admin/RegisterPaymentButton";
import { RealtimeRevalidate } from "@/components/admin/RealtimeRevalidate";
import { SearchInput } from "@/components/admin/SearchInput";
import { BrandedListPanel } from "@/components/admin/BrandedListPanel";
import { ClickableTableRow } from "@/components/admin/ClickableTableRow";
import { StopClickPropagation } from "@/components/admin/StopClickPropagation";
import { Pagination } from "@/components/admin/Pagination";
import { faFileInvoice, faMagnifyingGlass, faMoneyBillWave, faWallet } from "@fortawesome/free-solid-svg-icons";
import type { EntrepriseConfigRow, FactureAvecClientEtAgent } from "@/lib/supabase/database.types";

export const dynamic = "force-dynamic";

const STATUTS_IMPAYES = ["validee", "payee_partielle"];
const PAGE_SIZE = 10;

export default async function PaiementsAdminPage({
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

  let requete = supabase
    .from("factures")
    .select(
      "id, numero, client_id, agent_id, statut, total_ht, forfait_transport, tva_taux, total_general, date_facture, date_validation, notes, created_at, updated_at, client:clients(id, nom, telephone, type_client), agent:utilisateurs!factures_agent_id_fkey(id, nom)"
    )
    .in("statut", STATUTS_IMPAYES)
    .order("date_facture", { ascending: true });

  if (q) requete = requete.ilike("numero", `%${q}%`);

  // Contrairement aux autres écrans-listes, les cartes de stats
  // ("Montant total facturé"/"impayé") doivent porter sur TOUTES les
  // factures impayées correspondant au filtre, pas seulement sur les 10 de
  // la page affichée : on charge donc l'ensemble filtré sans `.range()`, on
  // calcule les agrégats sur cet ensemble complet, puis on pagine (slice) en
  // JS uniquement pour l'affichage du tableau.
  const { data: facturesData } = await requete;
  const toutesLesFactures = (facturesData as unknown as FactureAvecClientEtAgent[]) ?? [];
  const totalCount = toutesLesFactures.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  function buildHref(cible: number) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (cible > 1) params.set("page", String(cible));
    const qs = params.toString();
    return qs ? `/admin/paiements?${qs}` : "/admin/paiements";
  }

  const factureIds = toutesLesFactures.map((f) => f.id);

  const { data: paiementsData } = factureIds.length
    ? await supabase.from("paiements").select("facture_id, montant").in("facture_id", factureIds)
    : { data: [] };
  const { data: creditsData } = factureIds.length
    ? await supabase.from("credits").select("facture_id, montant_rembourse").in("facture_id", factureIds)
    : { data: [] };

  const paiementsParFacture = new Map<string, number>();
  (paiementsData ?? []).forEach((p) => {
    paiementsParFacture.set(p.facture_id, (paiementsParFacture.get(p.facture_id) ?? 0) + p.montant);
  });
  (creditsData ?? []).forEach((c) => {
    if (!c.facture_id) return;
    paiementsParFacture.set(c.facture_id, (paiementsParFacture.get(c.facture_id) ?? 0) + c.montant_rembourse);
  });

  const toutesLesLignes = toutesLesFactures.map((f) => {
    const paye = paiementsParFacture.get(f.id) ?? 0;
    return { facture: f, paye, reste: Math.max(0, f.total_general - paye) };
  });

  const totalImpaye = toutesLesLignes.reduce((sum, l) => sum + l.reste, 0);
  const totalFacture = toutesLesLignes.reduce((sum, l) => sum + l.facture.total_general, 0);

  const offset = (pageActuelle - 1) * PAGE_SIZE;
  const lignes = toutesLesLignes.slice(offset, offset + PAGE_SIZE);

  return (
    <div className="flex flex-col gap-6">
      <RealtimeRevalidate tables={["factures", "paiements", "credits", "remboursements_credit"]} />

      <BrandedListPanel
        nom={config?.nom ?? "GIE FASSO BARA"}
        logoUrl={config?.logo_url ?? null}
        title="Paiements"
        subtitle="Vue consolidée des factures impayées et partiellement payées."
      >
        <QuickActionGrid
          actions={[
            { href: "/admin/paiements", label: "À encaisser", description: "Factures ouvertes", icon: faMoneyBillWave, tone: "green" },
            { href: "/admin/credits", label: "Crédits", description: "Recouvrement", icon: faWallet, tone: "amber" },
            { href: "/admin/factures", label: "Factures", description: "Toutes les ventes", icon: faFileInvoice, tone: "blue" },
            { href: "/admin/clients", label: "Rechercher", description: "Par client", icon: faMagnifyingGlass, tone: "purple" },
          ]}
          columns={4}
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard label="Factures en attente" value={String(totalCount)} tone="blue" />
          <StatCard label="Montant total facturé" value={formatMontant(totalFacture)} />
          <StatCard label="Montant total impayé" value={formatMontant(totalImpaye)} tone="red" />
        </div>

        <Card>
          <Suspense>
            <SearchInput label="Rechercher" placeholder="Numéro de facture..." />
          </Suspense>
        </Card>

        <Card className="!p-0">
          <div className="divide-y divide-border md:hidden">
            {lignes.length === 0 ? (
              <p className="p-6 text-center text-body text-muted">Aucune facture impayée pour le moment.</p>
            ) : lignes.map(({ facture, paye, reste }) => (
              <div key={facture.id} className="p-4">
                <div className="flex items-start justify-between gap-3"><div className="min-w-0"><Link href={`/admin/factures/${facture.id}`} className="focus-ring font-mono text-body-sm font-semibold text-text hover:underline">{facture.numero}</Link><p className="mt-1 truncate text-body text-text">{facture.client?.nom}</p></div><StatusBadge statut={facture.statut} /></div>
                <div className="mt-3 grid grid-cols-3 gap-2 rounded-input bg-surface-2 p-3 text-right"><div><p className="text-caption text-muted">Total</p><p className="font-mono text-body text-text">{formatMontant(facture.total_general)}</p></div><div><p className="text-caption text-muted">Payé</p><p className="font-mono text-body text-green-text">{formatMontant(paye)}</p></div><div><p className="text-caption text-muted">Reste</p><p className="font-mono text-body font-semibold text-red-text">{formatMontant(reste)}</p></div></div>
                <div className="mt-3"><RegisterPaymentButton factureId={facture.id} factureNumero={facture.numero} resteAPayer={reste} /></div>
              </div>
            ))}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-surface-2 text-left text-caption uppercase tracking-[0.1em] text-muted">
                  <th className="px-4 py-2.5 font-medium">Numéro</th>
                  <th className="px-4 py-2.5 font-medium">Client</th>
                  <th className="px-4 py-2.5 font-medium">Date</th>
                  <th className="px-4 py-2.5 font-medium">Statut</th>
                  <th className="px-4 py-2.5 text-right font-medium">Total</th>
                  <th className="px-4 py-2.5 text-right font-medium">Payé</th>
                  <th className="px-4 py-2.5 text-right font-medium">Reste</th>
                  <th className="px-4 py-2.5 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {lignes.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-center text-body text-muted">
                      Aucune facture impayée pour le moment.
                    </td>
                  </tr>
                ) : (
                  lignes.map(({ facture, paye, reste }) => (
                    <ClickableTableRow
                      key={facture.id}
                      href={`/admin/factures/${facture.id}`}
                      className="border-t border-border hover:bg-surface-2"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/factures/${facture.id}`}
                          className="focus-ring rounded-input bg-surface-2 px-2 py-1 font-mono text-body-sm text-text hover:underline"
                        >
                          {facture.numero}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-body text-text">{facture.client?.nom}</td>
                      <td className="px-4 py-3 text-body-sm text-muted">{formatDate(facture.date_facture)}</td>
                      <td className="px-4 py-3">
                        <StatusBadge statut={facture.statut} />
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-body text-text">
                        {formatMontant(facture.total_general)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-body text-green-text">
                        {formatMontant(paye)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-body font-medium text-red-text">
                        {formatMontant(reste)}
                      </td>
                      <td className="px-4 py-3">
                        <StopClickPropagation>
                          <RegisterPaymentButton
                            factureId={facture.id}
                            factureNumero={facture.numero}
                            resteAPayer={reste}
                          />
                        </StopClickPropagation>
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
          />
        </Card>
      </BrandedListPanel>
    </div>
  );
}

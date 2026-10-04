import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatMontant, formatDate } from "@/lib/format";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { OverdueBadge } from "@/components/facture/OverdueBadge";
import { Breadcrumbs } from "@/components/admin/Breadcrumbs";
import { EditClientButton } from "@/components/admin/EditClientButton";
import { CompanyBrandMark } from "@/components/facture/CompanyBrandMark";
import type {
  ClientRow,
  EntrepriseConfigRow,
  FactureRetardPaiementRow,
  FactureRow,
} from "@/lib/supabase/database.types";
import { EmptyState } from "@/components/ui/EmptyState";
import { faFileInvoice } from "@fortawesome/free-solid-svg-icons";

export const dynamic = "force-dynamic";

const STATUTS_SOLDE = ["validee", "payee_partielle"];
const LIBELLES_TYPE: Record<string, string> = {
  particulier: "Particulier",
  entreprise: "Entreprise",
  cooperative: "Coopérative",
};

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: client }, { data: entreprise }] = await Promise.all([
    supabase.from("clients").select("*").eq("id", id).single(),
    supabase.from("entreprise_config").select("nom, logo_url").eq("id", true).single(),
  ]);
  if (!client) {
    notFound();
  }
  const config = entreprise as Pick<EntrepriseConfigRow, "nom" | "logo_url"> | null;

  const { data: facturesData } = await supabase
    .from("factures")
    .select("*")
    .eq("client_id", id)
    .order("date_facture", { ascending: false });

  const factures = (facturesData as FactureRow[]) ?? [];

  const facturesImpayeesIds = factures
    .filter((f) => STATUTS_SOLDE.includes(f.statut))
    .map((f) => f.id);

  const { data: paiementsData } = facturesImpayeesIds.length
    ? await supabase
        .from("paiements")
        .select("facture_id, montant")
        .in("facture_id", facturesImpayeesIds)
    : { data: [] };
  const { data: creditsData } = facturesImpayeesIds.length
    ? await supabase
        .from("credits")
        .select("facture_id, montant_rembourse")
        .in("facture_id", facturesImpayeesIds)
    : { data: [] };

  const paiementsParFacture = new Map<string, number>();
  (paiementsData ?? []).forEach((p) => {
    paiementsParFacture.set(p.facture_id, (paiementsParFacture.get(p.facture_id) ?? 0) + p.montant);
  });
  (creditsData ?? []).forEach((c) => {
    if (!c.facture_id) return;
    paiementsParFacture.set(c.facture_id, (paiementsParFacture.get(c.facture_id) ?? 0) + c.montant_rembourse);
  });

  const solde = factures
    .filter((f) => STATUTS_SOLDE.includes(f.statut))
    .reduce((sum, f) => sum + Math.max(0, f.total_general - (paiementsParFacture.get(f.id) ?? 0)), 0);

  const clientTyped = client as ClientRow;

  const { data: retardsData } = await supabase
    .from("v_factures_retard_paiement")
    .select("facture_id, jours_de_retard")
    .eq("client_id", id);

  const joursDeRetardParFacture = new Map<string, number>(
    ((retardsData as Pick<FactureRetardPaiementRow, "facture_id" | "jours_de_retard">[]) ?? []).map((r) => [
      r.facture_id,
      r.jours_de_retard,
    ])
  );

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs items={[{ label: "Clients", href: "/admin/clients" }, { label: clientTyped.nom }]} />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-wrap items-start gap-3">
          <CompanyBrandMark nom={config?.nom ?? "GIE FASSO BARA"} logoUrl={config?.logo_url ?? null} />
          <div>
            <h1 className="text-h1 font-semibold tracking-tight text-text">{clientTyped.nom}</h1>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge>{LIBELLES_TYPE[clientTyped.type_client]}</Badge>
            </div>
          </div>
        </div>
        <EditClientButton client={clientTyped} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-body-sm text-muted">Téléphone</p>
          <p className="mt-1 text-body text-text">{clientTyped.telephone ?? "—"}</p>
        </Card>
        <Card>
          <p className="text-body-sm text-muted">E-mail</p>
          <p className="mt-1 text-body text-text">{clientTyped.email ?? "—"}</p>
        </Card>
        <Card className="rounded-card-lg">
          <p className="text-body-sm text-muted">Solde impayé</p>
          <p className={`mt-1 font-mono text-display ${solde > 0 ? "text-red-text" : "text-text"}`}>
            {formatMontant(solde)}
          </p>
        </Card>
      </div>

      {clientTyped.adresse && (
        <Card>
          <p className="text-body-sm text-muted">Adresse</p>
          <p className="mt-1 text-body text-text">{clientTyped.adresse}</p>
        </Card>
      )}

      <Card className="!p-0">
        <h2 className="p-4 text-h2 text-text">Historique des factures</h2>
        <div className="overflow-x-auto">
          <table className="min-w-[600px] w-full border-collapse">
            <thead>
              <tr className="border-b border-border text-left text-caption uppercase tracking-[0.06em] text-muted">
                <th className="px-4 py-2.5 font-medium">Numéro</th>
                <th className="px-4 py-2.5 font-medium">Date</th>
                <th className="px-4 py-2.5 font-medium">Statut</th>
                <th className="px-4 py-2.5 text-right font-medium">Montant</th>
              </tr>
            </thead>
            <tbody>
              {factures.length === 0 ? (
                <tr>
                  <td colSpan={4}><EmptyState icone={faFileInvoice} titre="Aucune facture pour ce client." /></td>
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
      </Card>
    </div>
  );
}

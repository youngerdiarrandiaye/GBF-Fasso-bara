import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime, formatMontant } from "@/lib/format";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { CreditStatusBadge } from "@/components/ui/CreditStatusBadge";
import { Breadcrumbs } from "@/components/admin/Breadcrumbs";
import { RealtimeRevalidate } from "@/components/admin/RealtimeRevalidate";
import { NewRecouvrementButton } from "@/components/admin/NewRecouvrementButton";
import type { CreditAvecClient, RemboursementCreditRow } from "@/lib/supabase/database.types";
import { EmptyState } from "@/components/ui/EmptyState";
import { faHandHoldingDollar } from "@fortawesome/free-solid-svg-icons";

export const dynamic = "force-dynamic";

const LIBELLE_FREQUENCE: Record<string, string> = {
  journalier: "Journalier",
  mensuel: "Mensuel",
};

export default async function CreditDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: credit } = await supabase
    .from("credits")
    .select(
      "*, client:clients(id, nom, telephone), agent:utilisateurs!credits_agent_id_fkey(id, nom)"
    )
    .eq("id", id)
    .single();

  if (!credit) {
    notFound();
  }
  const creditTyped = credit as unknown as CreditAvecClient;

  const [{ data: remboursementsData }, { data: facture }] = await Promise.all([
    supabase
      .from("remboursements_credit")
      .select("*, utilisateur:utilisateurs(nom)")
      .eq("credit_id", id)
      .order("date_remboursement", { ascending: false })
      .order("created_at", { ascending: false }),
    creditTyped.facture_id
      ? supabase.from("factures").select("id, numero").eq("id", creditTyped.facture_id).single()
      : Promise.resolve({ data: null as { id: string; numero: string } | null }),
  ]);

  const remboursements =
    (remboursementsData as unknown as (RemboursementCreditRow & { utilisateur: { nom: string } | null })[]) ?? [];

  const creditsEligibles =
    creditTyped.statut === "en_cours"
      ? [
          {
            id: creditTyped.id,
            clientNom: creditTyped.client?.nom ?? "Client",
            soldeRestant: creditTyped.solde_restant,
            montantTotal: creditTyped.montant_total,
          },
        ]
      : [];

  return (
    <div className="flex flex-col gap-6">
      <RealtimeRevalidate tables={["credits", "remboursements_credit"]} />

      <Breadcrumbs
        items={[{ label: "Crédits & Recouvrement", href: "/admin/credits" }, { label: creditTyped.client?.nom ?? "Crédit" }]}
      />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-h1 text-text">{creditTyped.client?.nom}</h1>
            <CreditStatusBadge statut={creditTyped.statut} />
          </div>
          <p className="mt-1 text-body-sm text-muted">
            Solde restant :{" "}
            <span className="font-mono font-medium text-text">{formatMontant(creditTyped.solde_restant)}</span>
          </p>
          {creditTyped.client?.telephone && (
            <p className="mt-0.5 text-body-sm text-muted">{creditTyped.client.telephone}</p>
          )}
        </div>
        {creditTyped.statut === "en_cours" && (
          <NewRecouvrementButton
            credits={creditsEligibles}
            creditPreselectionne={creditTyped.id}
            label="Enregistrer un recouvrement"
          />
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <p className="text-body-sm text-muted">Montant total du crédit</p>
          <p className="mt-1 font-mono text-h2 text-text">{formatMontant(creditTyped.montant_total)}</p>
        </Card>
        <Card>
          <p className="text-body-sm text-muted">Déjà remboursé</p>
          <p className="mt-1 font-mono text-h2 text-green-text">{formatMontant(creditTyped.montant_rembourse)}</p>
        </Card>
        <Card>
          <p className="text-body-sm text-muted">Solde restant dû</p>
          <p className="mt-1 font-mono text-h2 text-red-text">{formatMontant(creditTyped.solde_restant)}</p>
        </Card>
      </div>

      <Card className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <p className="text-body-sm text-muted">Ouvert le</p>
          <p className="text-body text-text">{formatDate(creditTyped.date_ouverture)}</p>
        </div>
        <div>
          <p className="text-body-sm text-muted">Échéancier</p>
          <Badge>{LIBELLE_FREQUENCE[creditTyped.frequence_echeance] ?? creditTyped.frequence_echeance}</Badge>
        </div>
        <div>
          <p className="text-body-sm text-muted">Agent</p>
          <p className="text-body text-text">{creditTyped.agent?.nom}</p>
        </div>
        {facture && (
          <div>
            <p className="text-body-sm text-muted">Facture liée</p>
            <Link
              href={`/admin/factures/${facture.id}`}
              className="focus-ring rounded-input bg-surface-2 px-2 py-1 font-mono text-body-sm text-text hover:underline"
            >
              {facture.numero}
            </Link>
          </div>
        )}
        {creditTyped.date_solde && (
          <div>
            <p className="text-body-sm text-muted">Soldé le</p>
            <p className="text-body text-text">{formatDateTime(creditTyped.date_solde)}</p>
          </div>
        )}
      </Card>

      {creditTyped.notes && (
        <Card>
          <p className="text-body-sm text-muted">Notes</p>
          <p className="mt-1 text-body text-text">{creditTyped.notes}</p>
        </Card>
      )}

      <Card className="!p-0">
        <div className="p-4">
          <h2 className="text-h2 text-text">Historique des remboursements</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[600px] w-full border-collapse">
            <thead>
              <tr className="text-left text-body-sm uppercase tracking-wide text-muted">
                <th className="px-4 py-2.5 font-medium">Date</th>
                <th className="px-4 py-2.5 text-right font-medium">Montant</th>
                <th className="px-4 py-2.5 font-medium">Enregistré par</th>
                <th className="px-4 py-2.5 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {remboursements.length === 0 ? (
                <tr>
                  <td colSpan={4}><EmptyState icone={faHandHoldingDollar} titre="Aucun remboursement enregistré pour ce crédit." /></td>
                </tr>
              ) : (
                remboursements.map((r) => (
                  <tr key={r.id} className="border-t border-border hover:bg-surface-2">
                    <td className="px-4 py-3 text-body-sm text-muted">{formatDate(r.date_remboursement)}</td>
                    <td className="px-4 py-3 text-right font-mono text-body text-green-text">
                      {formatMontant(r.montant)}
                    </td>
                    <td className="px-4 py-3 text-body-sm text-muted">{r.utilisateur?.nom ?? "—"}</td>
                    <td className="px-4 py-3 text-body-sm text-muted">{r.notes ?? "—"}</td>
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

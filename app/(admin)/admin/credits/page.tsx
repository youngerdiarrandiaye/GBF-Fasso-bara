import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatMontant } from "@/lib/format";
import { Card } from "@/components/ui/Card";
import { CreditStatusBadge } from "@/components/ui/CreditStatusBadge";
import { QuickActionGrid } from "@/components/ui/QuickActionGrid";
import { StatCard } from "@/components/admin/StatCard";
import { BrandedListPanel } from "@/components/admin/BrandedListPanel";
import { RealtimeRevalidate } from "@/components/admin/RealtimeRevalidate";
import { ClickableTableRow } from "@/components/admin/ClickableTableRow";
import { NewRecouvrementButton } from "@/components/admin/NewRecouvrementButton";
import { faClockRotateLeft, faFileCirclePlus, faMoneyBillWave, faWallet } from "@fortawesome/free-solid-svg-icons";
import type { CreditAvecClient, EntrepriseConfigRow, StatutCredit } from "@/lib/supabase/database.types";

export const dynamic = "force-dynamic";

/**
 * Écran "Crédits & Recouvrement" — règles métier 11-14. Liste des crédits
 * `en_cours` triés par ancienneté (le plus vieux en premier — priorité de
 * recouvrement), formulaire rapide "caisse du soir", accès à l'historique
 * des crédits soldés via le filtre `?statut=solde`.
 */
export default async function CreditsPage({
  searchParams,
}: {
  searchParams: Promise<{ statut?: string }>;
}) {
  const { statut } = await searchParams;
  const vueStatut: StatutCredit = statut === "solde" ? "solde" : "en_cours";
  const supabase = await createClient();

  const { data: entreprise } = await supabase
    .from("entreprise_config")
    .select("nom, logo_url")
    .eq("id", true)
    .single();
  const config = entreprise as Pick<EntrepriseConfigRow, "nom" | "logo_url"> | null;

  const { data } = await supabase
    .from("credits")
    .select("*, client:clients(id, nom, telephone), agent:utilisateurs!credits_agent_id_fkey(id, nom)")
    .eq("statut", vueStatut)
    // Ancienneté = date_ouverture croissante (le plus vieux d'abord) pour la
    // vue "en_cours" (priorité de recouvrement) ; pour l'historique "solde",
    // le plus récent d'abord reste plus utile (dernier crédit soldé en haut).
    .order("date_ouverture", { ascending: vueStatut === "en_cours" });

  const credits = (data as unknown as CreditAvecClient[]) ?? [];

  const { data: tousLesCreditsEnCours } = await supabase
    .from("credits")
    .select("id, montant_total, solde_restant, client:clients(nom)")
    .eq("statut", "en_cours")
    .order("date_ouverture", { ascending: true });

  const creditsEligibles = (tousLesCreditsEnCours ?? []).map((c) => ({
    id: c.id,
    clientNom: (c.client as unknown as { nom: string } | null)?.nom ?? "Client",
    soldeRestant: c.solde_restant,
    montantTotal: c.montant_total,
  }));

  const encoursTotal = creditsEligibles.reduce((sum, c) => sum + c.soldeRestant, 0);

  return (
    <div className="flex flex-col gap-6">
      <RealtimeRevalidate tables={["credits", "remboursements_credit"]} />

      <BrandedListPanel
        nom={config?.nom ?? "GIE FASSO BARA"}
        logoUrl={config?.logo_url ?? null}
        title="Crédits & Recouvrement"
        subtitle="Encours de crédit client et recouvrement quotidien (caisse du soir)."
        actions={<NewRecouvrementButton credits={creditsEligibles} />}
      >
        <QuickActionGrid
          actions={[
            { href: "/admin/credits", label: "À recouvrer", description: "Crédits ouverts", icon: faWallet, tone: "amber" },
            { href: "/admin/credits?statut=solde", label: "Soldés", description: "Historique", icon: faClockRotateLeft, tone: "green" },
            { href: "/admin/paiements", label: "Encaisser", description: "Paiement facture", icon: faMoneyBillWave, tone: "blue" },
            { href: "/admin/nouvelle-facture", label: "Facturer", description: "Nouvelle vente", icon: faFileCirclePlus, tone: "purple" },
          ]}
          columns={4}
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <StatCard label="Crédits en cours" value={String(creditsEligibles.length)} tone="amber" />
          <StatCard label="Encours total à recouvrer" value={formatMontant(encoursTotal)} tone="red" />
        </div>

        <div className="flex gap-2">
          <Link
            href="/admin/credits"
            className={`focus-ring rounded-input px-3 py-2 text-body-sm font-medium ${
              vueStatut === "en_cours" ? "bg-green-dk text-white" : "bg-surface-2 text-muted hover:text-text"
            }`}
          >
            En cours
          </Link>
          <Link
            href="/admin/credits?statut=solde"
            className={`focus-ring rounded-input px-3 py-2 text-body-sm font-medium ${
              vueStatut === "solde" ? "bg-green-dk text-white" : "bg-surface-2 text-muted hover:text-text"
            }`}
          >
            Historique (soldés)
          </Link>
        </div>

        <Card className="!p-0">
          <div className="divide-y divide-border md:hidden">
            {credits.length === 0 ? (
              <p className="p-6 text-center text-body text-muted">{vueStatut === "en_cours" ? "Aucun crédit en cours." : "Aucun crédit soldé pour le moment."}</p>
            ) : credits.map((c) => (
              <Link key={c.id} href={`/admin/credits/${c.id}`} className="focus-ring block p-4 transition-colors hover:bg-surface-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><p className="truncate text-body font-semibold text-text">{c.client?.nom}</p><p className="mt-1 text-body-sm text-muted">{c.agent?.nom} · {formatDate(c.date_ouverture)}</p></div>
                  <CreditStatusBadge statut={c.statut} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 rounded-input bg-surface-2 p-3">
                  <div><p className="text-caption text-muted">Montant total</p><p className="font-mono text-body text-text">{formatMontant(c.montant_total)}</p></div>
                  <div className="text-right"><p className="text-caption text-muted">Solde restant</p><p className="font-mono text-body font-semibold text-red-text">{formatMontant(c.solde_restant)}</p></div>
                </div>
              </Link>
            ))}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-[800px] w-full border-collapse">
              <thead>
                <tr className="bg-surface-2 text-left text-caption uppercase tracking-[0.1em] text-muted">
                  <th className="px-4 py-2.5 font-medium">Client</th>
                  <th className="px-4 py-2.5 font-medium">Agent</th>
                  <th className="px-4 py-2.5 font-medium">Ouvert le</th>
                  <th className="px-4 py-2.5 text-right font-medium">Montant total</th>
                  <th className="px-4 py-2.5 text-right font-medium">Solde restant</th>
                  <th className="px-4 py-2.5 font-medium">Statut</th>
                </tr>
              </thead>
              <tbody>
                {credits.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-body text-muted">
                      {vueStatut === "en_cours" ? "Aucun crédit en cours." : "Aucun crédit soldé pour le moment."}
                    </td>
                  </tr>
                ) : (
                  credits.map((c) => (
                    <ClickableTableRow
                      key={c.id}
                      href={`/admin/credits/${c.id}`}
                      className="border-t border-border hover:bg-surface-2"
                    >
                      <td className="px-4 py-3 text-body font-medium text-text">{c.client?.nom}</td>
                      <td className="px-4 py-3 text-body-sm text-muted">{c.agent?.nom}</td>
                      <td className="px-4 py-3 text-body-sm text-muted">{formatDate(c.date_ouverture)}</td>
                      <td className="px-4 py-3 text-right font-mono text-body text-text">
                        {formatMontant(c.montant_total)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-body font-medium text-red-text">
                        {formatMontant(c.solde_restant)}
                      </td>
                      <td className="px-4 py-3">
                        <CreditStatusBadge statut={c.statut} />
                      </td>
                    </ClickableTableRow>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </BrandedListPanel>
    </div>
  );
}

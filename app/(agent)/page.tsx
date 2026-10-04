import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatMontant } from "@/lib/format";
import { Card } from "@/components/ui/Card";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFileCirclePlus, faFileLines, faTruck, faUsers } from "@fortawesome/free-solid-svg-icons";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { FactureAvecClient, StatutFacture } from "@/lib/supabase/database.types";

export const dynamic = "force-dynamic";

const STATUTS_VENTE_CONCLUE: StatutFacture[] = ["validee", "payee_partielle", "payee"];

export default async function AccueilAgentPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const aujourdhui = new Date().toISOString().slice(0, 10);

  const { data: facturesDuJour } = await supabase
    .from("factures")
    .select("id, numero, statut, total_general, date_facture, created_at, client:clients(id, nom, telephone)")
    .eq("agent_id", user?.id ?? "")
    .eq("date_facture", aujourdhui)
    .order("created_at", { ascending: false });

  const factures = (facturesDuJour as unknown as FactureAvecClient[]) ?? [];
  const totalDuJour = factures
    .filter((f) => STATUTS_VENTE_CONCLUE.includes(f.statut))
    .reduce((sum, f) => sum + f.total_general, 0);
  const nombreVentes = factures.filter((f) => STATUTS_VENTE_CONCLUE.includes(f.statut)).length;
  const nombreBrouillons = factures.filter((f) => f.statut === "brouillon").length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <p className="text-caption font-semibold uppercase tracking-[0.14em] text-green-text">Aujourd&apos;hui</p>
        <h1 className="text-h1 text-text">Votre activité</h1>
      </div>

      <nav aria-label="Actions du quotidien" className="cascade grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { href: "/nouvelle-facture", label: "Créer une facture", icon: faFileCirclePlus, primary: true },
          { href: "/mes-factures", label: "Mes factures", icon: faFileLines, primary: false },
          { href: "/bons-livraison/nouveau", label: "Créer une livraison", icon: faTruck, primary: false },
          { href: "/clients", label: "Mes clients", icon: faUsers, primary: false },
        ].map((action) => (
          <Link key={action.href} href={action.href} className="focus-ring flex min-h-28 min-w-0 flex-col items-center justify-center gap-3 rounded-card bg-surface-2 p-3 text-center text-body font-semibold text-text transition-colors hover:bg-green/10">
            <span className={`flex h-14 w-14 items-center justify-center rounded-full ${action.primary ? "bg-green text-white" : "bg-green/10 text-green-text"}`}>
              <FontAwesomeIcon icon={action.icon} className="h-6 w-6" aria-hidden="true" />
            </span>
            {action.label}
          </Link>
        ))}
      </nav>

      <div className="cascade grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-body text-muted">Total du jour</p>
          <p className="mt-1 break-words font-mono text-[1.6rem] font-semibold leading-tight text-text">{formatMontant(totalDuJour)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-body text-muted">Ventes conclues</p>
          <p className="mt-1 break-words font-mono text-[1.6rem] font-semibold leading-tight text-text">{nombreVentes}</p>
        </Card>
        <Card className="col-span-2 p-4 sm:col-span-1">
          <p className="text-body text-muted">Brouillons</p>
          <p className="mt-1 break-words font-mono text-[1.6rem] font-semibold leading-tight text-text">{nombreBrouillons}</p>
        </Card>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-h2 text-text">Factures du jour</h2>
        {factures.length === 0 ? (
          <p className="rounded-card border border-dashed border-border bg-surface-2 p-4 text-center text-body text-muted">
            Aucune facture créée aujourd&apos;hui.
          </p>
        ) : (
          factures.map((facture) => (
            <Link key={facture.id} href={`/mes-factures/${facture.id}`} className="focus-ring block rounded-card">
            <Card interactive>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-body font-medium text-text">{facture.client?.nom}</p>
                  <p className="font-mono text-body text-muted">{facture.numero}</p>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <span className="font-mono text-body text-text">
                    {formatMontant(facture.total_general)}
                  </span>
                  <StatusBadge statut={facture.statut} />
                </div>
              </div>
            </Card>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

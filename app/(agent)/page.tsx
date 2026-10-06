import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatMontant, formatDateLongue } from "@/lib/format";
import { Card } from "@/components/ui/Card";
import { Ticket, type LigneTicket } from "@/components/ui/Ticket";
import { InstallAppPrompt } from "@/components/ui/InstallAppPrompt";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFileCirclePlus, faFileLines, faTruck, faUsers } from "@fortawesome/free-solid-svg-icons";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { FactureAvecClient, StatutFacture } from "@/lib/supabase/database.types";

export const dynamic = "force-dynamic";

const STATUTS_VENTE_CONCLUE: StatutFacture[] = ["validee", "payee_partielle", "payee"];

interface FactureALivrer {
  id: string;
  numero: string;
  client_nom: string;
  total_general: number;
}

/**
 * Accueil Agent — direction « Comptoir » (docs/design-system.md D-25/D-26) :
 * ticket « Mes ventes du jour » en tête (même composant que le dashboard
 * Admin), une seule grande action « Nouvelle facture » sur mobile (la barre
 * d'onglets porte déjà les autres) et 4 tuiles à partir de md, puis les
 * factures à livrer (`factures_a_livrer()`, 0023) — section masquée s'il n'y
 * en a aucune — et les factures du jour.
 */
export default async function AccueilAgentPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const maintenant = new Date();
  const aujourdhui = maintenant.toISOString().slice(0, 10);

  const [{ data: facturesDuJour }, { data: aLivrer }] = await Promise.all([
    supabase
      .from("factures")
      .select("id, numero, statut, total_general, date_facture, created_at, client:clients(id, nom, telephone)")
      .eq("agent_id", user?.id ?? "")
      .eq("date_facture", aujourdhui)
      .order("created_at", { ascending: false }),
    supabase.rpc("factures_a_livrer"),
  ]);

  const factures = (facturesDuJour as unknown as FactureAvecClient[]) ?? [];
  const facturesALivrer = (aLivrer as FactureALivrer[] | null) ?? [];
  const totalDuJour = factures
    .filter((f) => STATUTS_VENTE_CONCLUE.includes(f.statut))
    .reduce((sum, f) => sum + f.total_general, 0);
  const nombreVentes = factures.filter((f) => STATUTS_VENTE_CONCLUE.includes(f.statut)).length;
  const nombreBrouillons = factures.filter((f) => f.statut === "brouillon").length;
  const pluriel = (n: number, mot: string) => `${mot}${n > 1 ? "s" : ""}`;
  const lignesTicket: LigneTicket[] = [
    {
      href: "#factures-du-jour",
      libelle: pluriel(nombreVentes, "Vente") + " " + pluriel(nombreVentes, "conclue"),
      valeur: String(nombreVentes),
    },
    {
      href: "#factures-du-jour",
      libelle: "Brouillons à finir",
      valeur: String(nombreBrouillons),
      signal: nombreBrouillons > 0 ? "amber" : undefined,
    },
    {
      href: facturesALivrer.length > 0 ? "#a-livrer" : "/bons-livraison",
      libelle: "À livrer",
      valeur: String(facturesALivrer.length),
      signal: facturesALivrer.length > 0 ? "amber" : undefined,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-h1 font-semibold tracking-tight text-text">Bonjour</h1>
        <p className="text-body text-muted first-letter:uppercase">{formatDateLongue(maintenant)}</p>
      </div>

      <Ticket
        id="ventes-du-jour"
        titre="Mes ventes du jour"
        montant={totalDuJour}
        lien={{ href: "/mes-factures", label: "Voir mes factures" }}
        lignes={lignesTicket}
      />

      <Link
        href="/nouvelle-facture"
        className="focus-ring flex min-h-14 items-center justify-center gap-3 rounded-modal bg-green-dk px-5 text-h3 font-semibold text-white transition-transform duration-btn ease-standard hover:scale-[1.02] active:scale-[0.98] md:hidden"
      >
        <FontAwesomeIcon icon={faFileCirclePlus} className="h-5 w-5" aria-hidden="true" />
        Nouvelle facture
      </Link>

      <InstallAppPrompt />

      <nav aria-label="Actions du quotidien" className="cascade hidden grid-cols-4 gap-3 md:grid">
        {[
          { href: "/nouvelle-facture", label: "Nouvelle facture", icon: faFileCirclePlus, primary: true },
          { href: "/bons-livraison/nouveau", label: "Livrer", icon: faTruck, primary: false },
          { href: "/mes-factures", label: "Mes factures", icon: faFileLines, primary: false },
          { href: "/clients", label: "Clients", icon: faUsers, primary: false },
        ].map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className={`focus-ring flex min-h-24 min-w-0 flex-col justify-between gap-3 rounded-modal border p-4 text-body font-semibold transition-transform duration-btn ease-standard hover:scale-[1.02] active:scale-[0.98] ${
              action.primary ? "border-green-dk bg-green-dk text-white" : "border-border bg-surface text-text"
            }`}
          >
            <FontAwesomeIcon icon={action.icon} className="h-6 w-6" aria-hidden="true" />
            {action.label}
          </Link>
        ))}
      </nav>

      {facturesALivrer.length > 0 && (
        <section aria-labelledby="a-livrer" className="flex scroll-mt-24 flex-col gap-3">
          <div className="flex items-center gap-2">
            <h2 id="a-livrer" className="text-h3 font-semibold text-text">À livrer</h2>
            <span className="badge-pastel-amber rounded-pill px-2.5 py-0.5 text-body font-semibold">{facturesALivrer.length}</span>
          </div>
          <ul className="cascade flex flex-col gap-2">
            {facturesALivrer.map((f) => (
              <li key={f.id}>
                <Card className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body font-semibold text-text">{f.client_nom}</p>
                    <p className="truncate font-mono text-body text-muted">
                      {f.numero} · {formatMontant(f.total_general)}
                    </p>
                  </div>
                  <Link
                    href={`/bons-livraison/nouveau?facture=${f.id}`}
                    className="focus-ring inline-flex h-tap shrink-0 items-center rounded-input border border-green-dk px-4 text-body font-semibold text-green-text hover:bg-surface-2"
                  >
                    Livrer
                  </Link>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="factures-du-jour" className="flex scroll-mt-24 flex-col gap-3">
        <h2 id="factures-du-jour" className="text-h3 font-semibold text-text">Factures du jour</h2>
        {factures.length === 0 ? (
          <p className="rounded-card border border-dashed border-border px-4 py-5 text-center text-body text-muted">
            Aucune facture aujourd&apos;hui. Vos factures du jour s&apos;afficheront ici.
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
                    <span className="font-mono text-body text-text">{formatMontant(facture.total_general)}</span>
                    <StatusBadge statut={facture.statut} />
                  </div>
                </div>
              </Card>
            </Link>
          ))
        )}
      </section>
    </div>
  );
}

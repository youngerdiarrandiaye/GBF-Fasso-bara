import { redirect } from "next/navigation";
import { WeeklySalesBarChart, DonutChart } from "@/components/admin/LazyCharts";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowRight,
  faBoxesStacked,
  faFileCirclePlus,
  faTriangleExclamation,
  faWallet,
  faTruck,
  faUsers,
} from "@fortawesome/free-solid-svg-icons";
import { createClient } from "@/lib/supabase/server";
import { formatMontant, formatDate, formatDateLongue } from "@/lib/format";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { StatCard } from "@/components/admin/StatCard";
import type { PointVenteSemaine } from "@/components/admin/WeeklySalesBarChart";
import type { PointCategorieProduit } from "@/components/admin/DonutChart";
import { NestedRadialProgress, type PointAgentCA } from "@/components/admin/NestedRadialProgress";
import { RealtimeRevalidate } from "@/components/admin/RealtimeRevalidate";
import { RegisterPaymentButton } from "@/components/admin/RegisterPaymentButton";
import { QuickWhatsappButton } from "@/components/facture/QuickWhatsappButton";
import { OverdueBadge } from "@/components/facture/OverdueBadge";
import { CompanyBrandMark } from "@/components/facture/CompanyBrandMark";
import { ChartPeriodControl } from "@/components/admin/ChartPeriodControl";
import { Pagination } from "@/components/admin/Pagination";
import { CreditGaugeCard } from "@/components/admin/CreditGaugeCard";
import { CreditStatusBadge } from "@/components/ui/CreditStatusBadge";
import { readAll } from "@/lib/supabase/read-all";
import { DashboardRefresh } from "@/components/admin/DashboardRefresh";
import type {
  CreditAvecClient,
  EntrepriseConfigRow,
  FactureAvecClientEtAgent,
  FactureRetardPaiementRow,
  StatutFacture,
} from "@/lib/supabase/database.types";

export const dynamic = "force-dynamic";

const STATUTS_CA: StatutFacture[] = ["validee", "payee_partielle", "payee"];
const STATUTS_EN_ATTENTE: StatutFacture[] = ["validee", "payee_partielle"];
const SEMAINES_AUTORISEES = [4, 8, 12];
const NB_SEMAINES_DEFAUT = 8;
const FACTURES_PAGE_SIZE = 10;

function dateDepuisISO(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [annee, mois, jour] = value.split("-").map(Number);
  const date = new Date(annee, mois - 1, jour);
  return date.getFullYear() === annee && date.getMonth() === mois - 1 && date.getDate() === jour ? date : null;
}

function dateVersISO(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function debutSemaine(date: Date): Date {
  const jour = date.getDay(); // 0 = dimanche
  const decalage = jour === 0 ? 6 : jour - 1; // semaine ISO démarrant lundi
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - decalage);
  return d;
}

export default async function DashboardAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ semaines?: string; ventes_debut?: string; ventes_fin?: string; page?: string }>;
}) {
  const { semaines: semainesParam, ventes_debut: ventesDebutParam, ventes_fin: ventesFinParam, page: pageParam } = await searchParams;
  const semainesDemandees = parseInt(semainesParam ?? "", 10);
  const NB_SEMAINES = SEMAINES_AUTORISEES.includes(semainesDemandees)
    ? semainesDemandees
    : NB_SEMAINES_DEFAUT;
  const pageActuelle = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);

  const supabase = await createClient();

  const maintenant = new Date();
  const debutMois = new Date(maintenant.getFullYear(), maintenant.getMonth(), 1);
  const dateDebutDemandee = ventesDebutParam ? dateDepuisISO(ventesDebutParam) : null;
  const dateFinDemandee = ventesFinParam ? dateDepuisISO(ventesFinParam) : null;
  const dureeDemandee = dateDebutDemandee && dateFinDemandee
    ? Math.floor((dateFinDemandee.getTime() - dateDebutDemandee.getTime()) / 86_400_000) + 1
    : 0;
  const periodePersonnalisee = Boolean(dateDebutDemandee && dateFinDemandee && dureeDemandee > 0 && dureeDemandee <= 90);
  const debutPeriodeGraph = periodePersonnalisee ? new Date(dateDebutDemandee!) : debutSemaine(maintenant);
  if (!periodePersonnalisee) debutPeriodeGraph.setDate(debutPeriodeGraph.getDate() - (NB_SEMAINES - 1) * 7);
  const finPeriodeGraph = periodePersonnalisee ? new Date(dateFinDemandee!) : new Date(maintenant);

  const offsetFactures = (pageActuelle - 1) * FACTURES_PAGE_SIZE;

  const resultats = await Promise.all([
    // Étendue avec `agent:utilisateurs!factures_agent_id_fkey(...)` (FK
    // explicite requise par PostgREST, plusieurs FK vers utilisateurs sur
    // factures) pour réutiliser cette même requête à la fois pour le CA du
    // mois (StatCard) et la répartition par agent (NestedRadialProgress) —
    // évite un second aller-retour Supabase redondant.
    readAll(supabase
      .from("factures")
      .select(
        "total_general, statut, agent_id, agent:utilisateurs!factures_agent_id_fkey(id, nom, actif, role)"
      )
      .gte("date_facture", dateVersISO(debutMois))
      .lte("date_facture", dateVersISO(maintenant))
      .in("statut", STATUTS_CA).order("id")),
    supabase
      .from("factures")
      .select("id", { count: "exact", head: true })
      .in("statut", STATUTS_EN_ATTENTE),
    readAll(supabase.from("produits").select("quantite_stock, seuil_alerte, prix_unitaire").eq("actif", true).order("id")),
    readAll(supabase
      .from("factures")
      .select("date_facture, total_general, statut")
      .gte("date_facture", dateVersISO(debutPeriodeGraph))
      .lte("date_facture", dateVersISO(finPeriodeGraph))
      .in("statut", STATUTS_CA).order("id")),
    // CA encaissé (WeeklySalesBarChart, série 2) : paiements réellement
    // enregistrés sur la même fenêtre de semaines, indépendamment du statut
    // courant de la facture concernée.
    readAll(supabase
      .from("paiements")
      .select("montant, date_paiement")
      .gte("date_paiement", dateVersISO(debutPeriodeGraph))
      .lte("date_paiement", dateVersISO(finPeriodeGraph)).order("id")),
    readAll(supabase
      .from("remboursements_credit")
      .select("montant, date_remboursement")
      .gte("date_remboursement", dateVersISO(debutPeriodeGraph))
      .lte("date_remboursement", dateVersISO(finPeriodeGraph)).order("id")),
    // Quantités vendues par catégorie ce mois-ci (DonutChart "Statistique
    // Produit") — même schéma de jointure filtrée que app/(admin)/admin/rapports/page.tsx.
    readAll(supabase
      .from("lignes_facture")
      .select(
        "quantite, produit:produits(categorie:categories_produits(nom)), facture:factures!inner(date_facture, statut)"
      )
      .gte("facture.date_facture", dateVersISO(debutMois))
      .lte("facture.date_facture", dateVersISO(maintenant))
      .in("facture.statut", STATUTS_CA).order("id")),
    supabase
      .from("factures")
      .select(
        "id, numero, statut, total_general, date_facture, created_at, client:clients(id, nom, telephone, type_client), agent:utilisateurs!factures_agent_id_fkey(id, nom)",
        { count: "exact" }
      )
      .order("created_at", { ascending: false }).order("id")
      .range(offsetFactures, offsetFactures + FACTURES_PAGE_SIZE - 1),
    readAll(supabase.from("v_factures_retard_paiement").select("*").order("jours_de_retard", { ascending: false }).order("facture_id")),
    // Règle métier 12 (0013_avenant_credit_entrepots.sql) : seuil_credit_max
    // ajouté à cette même requête (déjà utilisée par le dashboard) pour ne
    // pas multiplier les allers-retours Supabase.
    supabase.from("entreprise_config").select("nom, logo_url, seuil_credit_max").eq("id", true).single(),
    // Carte "Crédit non recouvré" (§5.9) + tableau des crédits en cours,
    // triés par ancienneté (le plus vieux d'abord, même tri que /admin/credits).
    readAll(supabase
      .from("credits")
      .select("*, client:clients(id, nom, telephone), agent:utilisateurs!credits_agent_id_fkey(id, nom)")
      .eq("statut", "en_cours")
      .order("date_ouverture", { ascending: true }).order("id")),
  ]);
  if (resultats.some((resultat) => resultat.error)) {
    throw new Error("Le tableau de bord ne peut pas charger toutes les données.");
  }
  const [
    { data: facturesMois },
    { count: facturesEnAttente },
    { data: produits },
    { data: facturesGraph },
    { data: paiementsGraph },
    { data: remboursementsGraph },
    { data: lignesCategorie },
    { data: dernieresFactures, count: totalDernieresFactures },
    { data: facturesRetard },
    { data: entreprise },
    { data: creditsEnCours },
  ] = resultats;
  const config = entreprise as Pick<EntrepriseConfigRow, "nom" | "logo_url" | "seuil_credit_max"> | null;
  const creditsEnCoursTypes = (creditsEnCours as unknown as CreditAvecClient[]) ?? [];
  const encoursCreditTotal = creditsEnCoursTypes.reduce((sum, c) => sum + c.solde_restant, 0);

  const caduMois = (facturesMois ?? []).reduce((sum, f) => sum + f.total_general, 0);
  const nbProduitsStockBas = (produits ?? []).filter(
    (p) => p.quantite_stock <= p.seuil_alerte * 1.5
  ).length;
  const valeurTotaleStock = (produits ?? []).reduce(
    (sum, p) => sum + p.quantite_stock * (p.prix_unitaire ?? 0),
    0
  );

  // Répartition du CA du mois par agent actif (NestedRadialProgress) — les
  // agents désactivés ou tout autre rôle (ex. admin ayant lui-même validé une
  // facture) sont exclus des anneaux, conformément à la spec (docs
  // §6.24 : "un anneau par agent actif").
  const parAgent = new Map<string, PointAgentCA>();
  (facturesMois ?? []).forEach((f) => {
    const agent = f.agent as unknown as { id: string; nom: string; actif: boolean; role: string } | null;
    if (!agent || agent.role !== "agent" || !agent.actif) return;
    const existant = parAgent.get(agent.id);
    if (existant) {
      existant.total += f.total_general;
    } else {
      parAgent.set(agent.id, { agentId: agent.id, nom: agent.nom, total: f.total_general });
    }
  });
  const repartitionAgents: PointAgentCA[] = Array.from(parAgent.values());

  // Quantités vendues par catégorie ce mois-ci (DonutChart).
  const parCategorie = new Map<string, number>();
  (lignesCategorie ?? []).forEach((l) => {
    const produit = l.produit as unknown as { categorie: { nom: string } | null } | null;
    const nom = produit?.categorie?.nom ?? "Sans catégorie";
    parCategorie.set(nom, (parCategorie.get(nom) ?? 0) + l.quantite);
  });
  const ventesParCategorie: PointCategorieProduit[] = Array.from(parCategorie.entries()).map(
    ([categorie, quantite]) => ({ categorie, quantite })
  );

  // Agrégation par semaine (lundi -> dimanche), en JS : pas d'agrégation SQL
  // exposée directement par supabase-js sans fonction RPC dédiée, et le
  // volume attendu (quelques semaines de factures/paiements) rend ce calcul
  // trivial côté serveur.
  const semaines: PointVenteSemaine[] = [];
  const nombreTranches = Math.ceil((Math.floor((finPeriodeGraph.getTime() - debutPeriodeGraph.getTime()) / 86_400_000) + 1) / 7);
  for (let i = 0; i < nombreTranches; i++) {
    const debut = new Date(debutPeriodeGraph);
    debut.setDate(debut.getDate() + i * 7);
    const fin = new Date(debut);
    fin.setDate(fin.getDate() + 6);
    if (fin > finPeriodeGraph) fin.setTime(finPeriodeGraph.getTime());
    const totalFacture = (facturesGraph ?? [])
      .filter((f) => {
        const d = dateDepuisISO(f.date_facture);
        if (!d) return false;
        return d >= debut && d <= fin;
      })
      .reduce((sum, f) => sum + f.total_general, 0);
    const totalEncaisse = (paiementsGraph ?? [])
      .filter((p) => {
        const d = dateDepuisISO(String(p.date_paiement).slice(0, 10));
        if (!d) return false;
        return d >= debut && d <= fin;
      })
      .reduce((sum, p) => sum + p.montant, 0)
      + (remboursementsGraph ?? [])
        .filter((r) => {
          const d = dateDepuisISO(String(r.date_remboursement).slice(0, 10));
          if (!d) return false;
          return d >= debut && d <= fin;
        })
        .reduce((sum, r) => sum + r.montant, 0);
    semaines.push({
      semaine: `${String(debut.getDate()).padStart(2, "0")}/${String(debut.getMonth() + 1).padStart(2, "0")}–${String(fin.getDate()).padStart(2, "0")}/${String(fin.getMonth() + 1).padStart(2, "0")}`,
      facture: totalFacture,
      encaisse: totalEncaisse,
      debutISO: dateVersISO(debut),
      finISO: dateVersISO(fin),
    });
  }

  const factures = (dernieresFactures as unknown as FactureAvecClientEtAgent[]) ?? [];
  const totalCountFactures = totalDernieresFactures ?? 0;
  const totalPagesFactures = Math.max(1, Math.ceil(totalCountFactures / FACTURES_PAGE_SIZE));
  const facturesEnRetard = (facturesRetard as FactureRetardPaiementRow[]) ?? [];
  const soldeTotalRetard = facturesEnRetard.reduce((sum, f) => sum + f.solde_restant, 0);

  // Préserve `semaines` (période du graphique) lors d'un changement de page
  // des "Dernières factures" — les deux paramètres d'URL sont indépendants.
  function buildHrefDernieresFactures(cible: number): string {
    const params = new URLSearchParams();
    if (NB_SEMAINES !== NB_SEMAINES_DEFAUT) params.set("semaines", String(NB_SEMAINES));
    if (periodePersonnalisee) {
      params.delete("semaines");
      params.set("ventes_debut", dateVersISO(debutPeriodeGraph));
      params.set("ventes_fin", dateVersISO(finPeriodeGraph));
    }
    if (cible > 1) params.set("page", String(cible));
    const qs = params.toString();
    return qs ? `/admin?${qs}` : "/admin";
  }

  if (pageActuelle > totalPagesFactures) redirect(buildHrefDernieresFactures(totalPagesFactures));

  return (
    <div className="flex min-w-0 flex-col gap-6 sm:gap-7">
      <RealtimeRevalidate
        tables={["factures", "lignes_facture", "produits", "categories_produits", "utilisateurs", "entreprise_config", "alertes_factures", "paiements", "credits", "remboursements_credit"]}
      />

      <section className="relative overflow-hidden rounded-card-lg border border-border bg-[linear-gradient(135deg,color-mix(in_srgb,var(--color-surface)_94%,var(--color-green)_6%),var(--color-surface))] p-5 shadow-lg sm:p-6">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-green/70 to-transparent" />
        <div aria-hidden="true" className="pointer-events-none absolute bottom-0 right-0 h-56 w-56 rounded-full bg-green/10 blur-3xl" />
        <div className="relative grid gap-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
        <div className="flex min-w-0 items-center gap-4">
          <CompanyBrandMark nom={config?.nom ?? "GIE FASSO BARA"} logoUrl={config?.logo_url ?? null} size="md" />
          <div className="min-w-0">
            <p className="mb-1 text-caption font-semibold uppercase tracking-[0.18em] text-green-text">Centre de pilotage</p>
            <h1 className="text-h1 font-semibold tracking-tight text-text sm:text-display">Tableau de bord</h1>
            <p className="mt-1 text-body-sm text-muted">
              {config?.nom ?? "GIE FASSO BARA"} · {formatDateLongue(maintenant)}
            </p>
          </div>
        </div>
        </div>
      </section>

      <nav aria-label="Actions du quotidien" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { href: "/admin/nouvelle-facture", label: "Créer une facture", icon: faFileCirclePlus, primary: true },
          { href: "/admin/paiements", label: "Paiements", icon: faWallet, primary: false },
          { href: "/admin/clients", label: "Clients", icon: faUsers, primary: false },
          { href: "/admin/stock", label: "Produits et stock", icon: faBoxesStacked, primary: false },
          { href: "/admin/bons-livraison/nouveau", label: "Créer une livraison", icon: faTruck, primary: false },
          { href: "/admin/stock/nouveau", label: "Ajouter un produit", icon: faBoxesStacked, primary: false },
        ].map((action) => (
          <Link key={action.href} href={action.href} className="focus-ring flex min-h-28 min-w-0 flex-col items-center justify-center gap-3 rounded-card bg-surface p-3 text-center text-body-sm font-semibold text-text transition-colors hover:bg-green/10">
            <span className={`flex h-14 w-14 items-center justify-center rounded-full ${action.primary ? "bg-green text-white" : "bg-green/10 text-green-text"}`}>
              <FontAwesomeIcon icon={action.icon} className="h-6 w-6" aria-hidden="true" />
            </span>
            {action.label}
          </Link>
        ))}
      </nav>
      <div className="flex justify-end"><DashboardRefresh /></div>

      <section aria-labelledby="indicateurs-dashboard">
        <div className="mb-3">
          <h2 id="indicateurs-dashboard" className="scroll-mt-24 text-h2 font-semibold text-text">Vue globale</h2>
        </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div>
        <StatCard
          label="CA mois"
          value={formatMontant(caduMois)}
          format="montant"
          hero
          hint={`Du ${formatDate(dateVersISO(debutMois))} au ${formatDate(dateVersISO(maintenant))}`}
          href={`/admin/factures?debut=${dateVersISO(debutMois)}&fin=${dateVersISO(maintenant)}`}
        />
        </div>
        <StatCard
          label="A encaisser"
          value={String(facturesEnAttente ?? 0)}
          tone="blue"
          hint="En attente"
          href="/admin/paiements"
        />
        <StatCard
          label="Valeur stock"
          value={formatMontant(valeurTotaleStock)}
          format="montant"
          hint="Stock actif"
          href="/admin/stock?actif=1"
        />
        <CreditGaugeCard
          encoursCredit={encoursCreditTotal}
          seuilCreditMax={config?.seuil_credit_max ?? 0}
        />
      </div>
      </section>

      <section aria-labelledby="priorites-dashboard">
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <p className="text-caption font-semibold uppercase tracking-[0.14em] text-muted">Aujourd&apos;hui</p>
            <h2 id="priorites-dashboard" className="scroll-mt-24 text-h2 font-semibold text-text">Priorités à traiter</h2>
          </div>
          <p className="hidden text-body-sm text-muted sm:block">Situation actuelle, En attente</p>
        </div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <a href="#retards-paiement" className="focus-ring group rounded-card">
            <Card interactive className="flex h-full items-center gap-3 p-3 !border-[color-mix(in_srgb,var(--color-red)_30%,var(--color-border))]">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-input bg-[color-mix(in_srgb,var(--color-red)_14%,var(--color-surface))] text-red-text"><FontAwesomeIcon icon={faTriangleExclamation} className="h-4 w-4" /></span>
              <span className="min-w-0 flex-1"><span className="block text-body-sm text-muted">Retards de paiement</span><span className="block break-words font-mono text-h3 text-text">{facturesEnRetard.length} · {formatMontant(soldeTotalRetard)}</span></span>
              <FontAwesomeIcon icon={faArrowRight} className="h-4 w-4 text-muted transition-transform group-hover:translate-x-1" />
            </Card>
          </a>
          <Link href="/admin/stock?niveau=bas&actif=1" className="focus-ring group rounded-card">
            <Card interactive className="flex h-full items-center gap-3 p-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-input bg-[color-mix(in_srgb,var(--color-amber)_14%,var(--color-surface))] text-amber-text"><FontAwesomeIcon icon={faBoxesStacked} className="h-4 w-4" /></span>
              <span className="min-w-0 flex-1"><span className="block text-body-sm text-muted">Stock à surveiller</span><span className="block break-words font-mono text-h3 text-text">{nbProduitsStockBas} produit{nbProduitsStockBas > 1 ? "s" : ""}</span></span>
              <FontAwesomeIcon icon={faArrowRight} className="h-4 w-4 text-muted transition-transform group-hover:translate-x-1" />
            </Card>
          </Link>
          <Link href="/admin/credits" className="focus-ring group rounded-card">
            <Card interactive className="flex h-full items-center gap-3 p-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-input bg-[color-mix(in_srgb,var(--color-blue)_14%,var(--color-surface))] text-blue-text"><FontAwesomeIcon icon={faWallet} className="h-4 w-4" /></span>
              <span className="min-w-0 flex-1"><span className="block text-body-sm text-muted">Crédits à recouvrer</span><span className="block break-words font-mono text-h3 text-text">{creditsEnCoursTypes.length} dossier{creditsEnCoursTypes.length > 1 ? "s" : ""} en cours</span></span>
              <FontAwesomeIcon icon={faArrowRight} className="h-4 w-4 text-muted transition-transform group-hover:translate-x-1" />
            </Card>
          </Link>
        </div>
      </section>

      <Card className="overflow-hidden !p-0">
        <div className="flex flex-col gap-4 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <div className="flex items-center gap-2">
              <h2 id="factures-recentes" className="scroll-mt-24 text-h2 font-semibold text-text">Factures récentes</h2>
              <span className="rounded-badge bg-surface-2 px-2 py-0.5 font-mono text-caption text-muted">{totalCountFactures}</span>
            </div>
            
          </div>
          <div className="flex items-center gap-3">
            <Link href="/admin/rapports" className="focus-ring rounded-input text-body-sm text-muted hover:text-text">Exporter</Link>
            <Link href="/admin/factures" className="focus-ring inline-flex h-9 items-center gap-1 rounded-input bg-surface-2 px-3 text-body-sm font-medium text-text hover:bg-[color-mix(in_srgb,var(--color-green)_12%,var(--color-surface))]">
              Toutes les factures <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
        <div className="divide-y divide-border md:hidden">
          {factures.length === 0 ? (
            <p className="px-4 py-8 text-center text-body text-muted">Aucune facture pour le moment.</p>
          ) : factures.map((facture) => (
            <Link key={facture.id} href={`/admin/factures/${facture.id}`} className="focus-ring block p-4 transition-colors hover:bg-surface-2 active:bg-surface-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-body font-semibold text-text">{facture.client?.nom ?? "Client non renseigné"}</p>
                  <p className="mt-1 font-mono text-caption text-muted">{facture.numero} · {formatDate(facture.date_facture)}</p>
                </div>
                <p className="shrink-0 font-mono text-body font-semibold text-text">{formatMontant(facture.total_general)}</p>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <StatusBadge statut={facture.statut} />
                <p className="truncate text-body-sm text-muted">{facture.agent?.nom}</p>
              </div>
            </Link>
          ))}
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-surface-2 text-left text-caption uppercase tracking-[0.1em] text-muted">
                <th className="px-5 py-3 font-semibold">Facture</th>
                <th className="px-5 py-3 font-semibold">Client</th>
                <th className="px-5 py-3 font-semibold">Agent</th>
                <th className="px-5 py-3 font-semibold">Statut</th>
                <th className="px-5 py-3 text-right font-semibold">Montant</th>
              </tr>
            </thead>
            <tbody>
              {factures.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-body text-muted">
                    Aucune facture pour le moment.
                  </td>
                </tr>
              ) : (
                factures.map((facture) => (
                  <tr key={facture.id} className="group border-t border-border transition-colors hover:bg-surface-2">
                    <td className="px-5 py-4">
                      <Link
                        href={`/admin/factures/${facture.id}`}
                        className="focus-ring font-mono text-body-sm font-semibold text-text group-hover:text-green-text"
                      >
                        {facture.numero}
                      </Link>
                      <p className="mt-1 text-caption text-muted">{formatDate(facture.date_facture)}</p>
                    </td>
                    <td className="px-5 py-4 text-body font-medium text-text">{facture.client?.nom ?? "—"}</td>
                    <td className="px-5 py-4 text-body-sm text-muted">{facture.agent?.nom ?? "—"}</td>
                    <td className="px-5 py-4">
                      <StatusBadge statut={facture.statut} />
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-right font-mono text-body font-semibold text-text">
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
          totalPages={totalPagesFactures}
          totalCount={totalCountFactures}
          pageSize={FACTURES_PAGE_SIZE}
          buildHref={buildHrefDernieresFactures}
        />
      </Card>

      <Card className="!p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 p-4">
          <h2 id="retards-paiement" className="scroll-mt-24 text-h2 font-semibold text-text">Factures en retard de paiement</h2>
          <span
            className={`text-body-sm font-medium ${facturesEnRetard.length > 0 ? "text-red-text" : "text-muted"}`}
          >
            {facturesEnRetard.length} facture{facturesEnRetard.length > 1 ? "s" : ""} · {formatMontant(soldeTotalRetard)} dû au total
          </span>
        </div>
        {facturesEnRetard.length === 0 ? (
          <p className="px-4 pb-6 text-body text-muted">
            Aucune facture en retard — tous les paiements sont à jour.
          </p>
        ) : (
          <>
          <div className="divide-y divide-border md:hidden">
            {facturesEnRetard.map((facture) => (
              <div key={facture.facture_id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/admin/factures/${facture.facture_id}`} className="focus-ring truncate text-body font-semibold text-text hover:underline">{facture.client_nom}</Link>
                    <p className="mt-1 font-mono text-body-sm text-muted">{facture.numero}</p>
                  </div>
                  <p className="shrink-0 font-mono text-body font-semibold text-red-text">{formatMontant(facture.solde_restant)}</p>
                </div>
                <div className="mt-3"><OverdueBadge joursDeRetard={facture.jours_de_retard} /></div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <QuickWhatsappButton factureId={facture.facture_id} factureNumero={facture.numero} clientTelephone={facture.client_telephone} totalGeneral={facture.total_general} />
                  <RegisterPaymentButton factureId={facture.facture_id} factureNumero={facture.numero} resteAPayer={facture.solde_restant} />
                </div>
              </div>
            ))}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-surface-2 text-left text-caption uppercase tracking-[0.1em] text-muted">
                  <th className="px-4 py-2.5 font-medium">Numéro</th>
                  <th className="px-4 py-2.5 font-medium">Client</th>
                  <th className="px-4 py-2.5 text-right font-medium">Montant dû</th>
                  <th className="px-4 py-2.5 font-medium">Jours de retard</th>
                  <th className="px-4 py-2.5 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {facturesEnRetard.map((facture) => (
                  <tr key={facture.facture_id} className="border-t border-border hover:bg-surface-2">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/factures/${facture.facture_id}`}
                        className="focus-ring rounded-input bg-surface-2 px-2 py-1 font-mono text-body-sm text-text hover:underline"
                      >
                        {facture.numero}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-body text-text">{facture.client_nom}</td>
                    <td className="px-4 py-3 text-right font-mono text-body text-text">
                      {formatMontant(facture.solde_restant)}
                    </td>
                    <td className="px-4 py-3">
                      <OverdueBadge joursDeRetard={facture.jours_de_retard} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <QuickWhatsappButton
                          factureId={facture.facture_id}
                          factureNumero={facture.numero}
                          clientTelephone={facture.client_telephone}
                          totalGeneral={facture.total_general}
                        />
                        <RegisterPaymentButton
                          factureId={facture.facture_id}
                          factureNumero={facture.numero}
                          resteAPayer={facture.solde_restant}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </Card>

      {/* Avenant Crédit / BL / Multi-entrepôts — tableau des crédits en
          cours (règle métier 12), ajouté après les sections V1 déjà livrées,
          sans les modifier. Même tri que /admin/credits (le plus vieux
          d'abord — priorité de recouvrement), limité aux 8 premiers ici. */}
      <Card className="!p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 p-4">
          <h2 className="text-h2 text-text">Crédits en cours</h2>
          <Link href="/admin/credits" className="focus-ring rounded-input text-body-sm text-text hover:underline">
            Voir tous les crédits ({creditsEnCoursTypes.length}) →
          </Link>
        </div>
        
        {creditsEnCoursTypes.length === 0 ? (
          <p className="px-4 pb-6 text-body text-muted">Aucun crédit en cours pour le moment.</p>
        ) : (
          <>
          <div className="divide-y divide-border md:hidden">
            {creditsEnCoursTypes.slice(0, 8).map((c) => (
              <Link key={c.id} href={`/admin/credits/${c.id}`} className="focus-ring block p-4 transition-colors hover:bg-surface-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><p className="truncate text-body font-semibold text-text">{c.client?.nom}</p><p className="mt-1 text-body-sm text-muted">Ouvert le {formatDate(c.date_ouverture)}</p></div>
                  <p className="shrink-0 font-mono text-body font-semibold text-red-text">{formatMontant(c.solde_restant)}</p>
                </div>
                <div className="mt-3"><CreditStatusBadge statut={c.statut} /></div>
              </Link>
            ))}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-surface-2 text-left text-caption uppercase tracking-[0.1em] text-muted">
                  <th className="px-4 py-2.5 font-medium">Client</th>
                  <th className="px-4 py-2.5 font-medium">Ouvert le</th>
                  <th className="px-4 py-2.5 text-right font-medium">Solde restant</th>
                  <th className="px-4 py-2.5 font-medium">Statut</th>
                </tr>
              </thead>
              <tbody>
                {creditsEnCoursTypes.slice(0, 8).map((c) => (
                  <tr key={c.id} className="border-t border-border hover:bg-surface-2">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/credits/${c.id}`}
                        className="focus-ring rounded-input text-body font-medium text-text hover:underline"
                      >
                        {c.client?.nom}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-body-sm text-muted">{formatDate(c.date_ouverture)}</td>
                    <td className="px-4 py-3 text-right font-mono text-body font-medium text-red-text">
                      {formatMontant(c.solde_restant)}
                    </td>
                    <td className="px-4 py-3">
                      <CreditStatusBadge statut={c.statut} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </Card>
      <details className="rounded-card border border-border bg-surface p-4" open={periodePersonnalisee || ventesDebutParam != null || ventesFinParam != null || NB_SEMAINES !== NB_SEMAINES_DEFAUT}>
        <summary className="focus-ring min-h-11 cursor-pointer rounded-input py-3 text-h2 font-semibold text-text">Voir les analyses de l&apos;activité</summary>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="min-w-0 rounded-card-lg lg:col-span-2">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-h2 text-text">Evolution des ventes</h2>
              <p className="text-body-sm text-muted">{formatDate(dateVersISO(debutPeriodeGraph))} au {formatDate(dateVersISO(finPeriodeGraph))}</p>
            </div>
            <ChartPeriodControl key={`${NB_SEMAINES}-${ventesDebutParam ?? ""}-${ventesFinParam ?? ""}`} valeurActuelle={NB_SEMAINES} dateDebut={periodePersonnalisee ? dateVersISO(debutPeriodeGraph) : undefined} dateFin={periodePersonnalisee ? dateVersISO(finPeriodeGraph) : undefined} />
          </div>
          <div className="mb-5 grid grid-cols-1 gap-3 border-y border-border py-4 sm:grid-cols-2">
            <div><p className="text-body-sm text-muted">Ventes facturées sur la période</p><p className="mt-1 break-words font-mono text-h2 font-semibold text-text">{formatMontant(semaines.reduce((total, semaine) => total + semaine.facture, 0))}</p></div>
            <div><p className="text-body-sm text-muted">Paiements reçus sur la période</p><p className="mt-1 break-words font-mono text-h2 font-semibold text-green-text">{formatMontant(semaines.reduce((total, semaine) => total + semaine.encaisse, 0))}</p></div>
          </div>
          <WeeklySalesBarChart data={semaines} />
        </Card>

        <Card className="min-w-0 rounded-card-lg">
          <h2 className="text-h2 font-semibold text-text">Top categories</h2>
          
          <DonutChart data={ventesParCategorie} />
        </Card>

        <Card className="min-w-0 rounded-card-lg">
          <h2 className="text-h2 font-semibold text-text">Performance agents</h2>
          
          <NestedRadialProgress data={repartitionAgents} totalGeneral={repartitionAgents.reduce((total, agent) => total + agent.total, 0)} />
        </Card>
      </div>
      </details>

    </div>
  );
}



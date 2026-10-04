import { createClient } from "@/lib/supabase/server";
import { faClockRotateLeft, faFileCirclePlus, faMoneyBillWave, faTruckFast } from "@fortawesome/free-solid-svg-icons";
import { CompanyBrandMark } from "@/components/facture/CompanyBrandMark";
import { QuickActionGrid } from "@/components/ui/QuickActionGrid";
import type {
  EntrepotRow,
  EntrepriseConfigPublicRow,
  FactureAvecClientEtEntrepot,
  FactureRetardPaiementRow,
} from "@/lib/supabase/database.types";
import { MesFacturesList } from "./MesFacturesList";

export const dynamic = "force-dynamic";

/**
 * Mes factures — liste des factures créées par l'agent connecté. La policy
 * RLS `factures_lecture_agent_propre` garantit déjà qu'aucune facture d'un
 * autre agent ne peut apparaître ici, quel que soit le statut. Idem pour
 * `v_factures_retard_paiement` (security_invoker=true) : un agent n'y voit
 * que ses propres factures en retard.
 *
 * Avenant multi-entrepôts (règle 16, migration 0013) : chaque facture est
 * désormais enrichie de son entrepôt source pour permettre le filtre
 * additionnel demandé (MesFacturesList) — `entrepots` (liste complète, y
 * compris inactifs, pour ne jamais faire "disparaître" le filtre d'une
 * facture déjà rattachée à un entrepôt entre-temps désactivé) est chargée en
 * parallèle.
 */
export default async function MesFacturesPage() {
  const supabase = await createClient();

  const [{ data }, { data: entreprise }, { data: entrepotsData }] = await Promise.all([
    supabase
      .from("factures")
      .select(
        "id, numero, statut, total_general, date_facture, client_id, agent_id, total_ht, forfait_transport, tva_taux, date_validation, notes, created_at, updated_at, entrepot_id, client:clients(id, nom, telephone), entrepot:entrepots(id, nom)"
      )
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("entreprise_config_public").select("nom, logo_url").eq("id", true).single(),
    supabase.from("entrepots").select("id, nom, adresse, actif, created_at, updated_at").order("nom", { ascending: true }),
  ]);

  const factures = (data as unknown as FactureAvecClientEtEntrepot[]) ?? [];
  const config = entreprise as Pick<EntrepriseConfigPublicRow, "nom" | "logo_url"> | null;
  const entrepots = (entrepotsData as EntrepotRow[]) ?? [];

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
      <div className="flex items-center gap-3">
        <CompanyBrandMark nom={config?.nom ?? "GIE FASSO BARA"} logoUrl={config?.logo_url ?? null} size="sm" />
        <h1 className="text-h1 text-text">Mes factures</h1>
      </div>
      <QuickActionGrid
        actions={[
          { href: "/nouvelle-facture", label: "Créer", description: "Nouvelle facture", icon: faFileCirclePlus, tone: "green" },
          { href: "/mes-factures", label: "Continuer", description: "Brouillons", icon: faClockRotateLeft, tone: "amber" },
          { href: "/bons-livraison/nouveau", label: "Livrer", description: "Bon de livraison", icon: faTruckFast, tone: "blue" },
          { href: "/mes-factures", label: "Paiement", description: "Voir les statuts", icon: faMoneyBillWave, tone: "purple" },
        ]}
        columns={4}
      />
      <MesFacturesList
        facturesInitiales={factures}
        joursDeRetardParFacture={joursDeRetardParFacture}
        entrepots={entrepots}
      />
    </div>
  );
}

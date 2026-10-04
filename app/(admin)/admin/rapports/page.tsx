import { createClient } from "@/lib/supabase/server";
import { QuickActionGrid } from "@/components/ui/QuickActionGrid";
import { ReportsClient } from "@/components/admin/ReportsClient";
import { BrandedListPanel } from "@/components/admin/BrandedListPanel";
import type { PointRapport } from "@/components/admin/ReportsBarChart";
import type { EntrepriseConfigRow, UtilisateurRow } from "@/lib/supabase/database.types";
import { faBoxesStacked, faChartLine, faFileInvoice, faUsers } from "@fortawesome/free-solid-svg-icons";

export const dynamic = "force-dynamic";

const STATUTS_VENTE_CONCLUE = ["validee", "payee_partielle", "payee"];

export default async function RapportsAdminPage() {
  const supabase = await createClient();

  const il30jours = new Date();
  il30jours.setDate(il30jours.getDate() - 30);
  const depuis = il30jours.toISOString().slice(0, 10);

  const [{ data: entreprise }, { data: agents }, { data: factures }, { data: lignes }] = await Promise.all([
    supabase.from("entreprise_config").select("nom, logo_url").eq("id", true).single(),
    supabase.from("utilisateurs").select("id, nom").eq("role", "agent").order("nom"),
    supabase
      .from("factures")
      .select("id, agent_id, total_general, statut, date_facture, agent:utilisateurs!factures_agent_id_fkey(nom)")
      .gte("date_facture", depuis)
      .in("statut", STATUTS_VENTE_CONCLUE),
    supabase
      .from("lignes_facture")
      .select(
        "total_ligne, produit:produits(categorie:categories_produits(nom)), facture:factures!inner(date_facture, statut)"
      )
      .gte("facture.date_facture", depuis)
      .in("facture.statut", STATUTS_VENTE_CONCLUE),
  ]);

  const parAgent = new Map<string, number>();
  (factures ?? []).forEach((f) => {
    const nom = (f.agent as unknown as { nom: string } | null)?.nom ?? "—";
    parAgent.set(nom, (parAgent.get(nom) ?? 0) + f.total_general);
  });
  const ventesParAgent: PointRapport[] = Array.from(parAgent.entries()).map(([label, total]) => ({
    label,
    total,
  }));

  const parCategorie = new Map<string, number>();
  (lignes ?? []).forEach((l) => {
    const produit = l.produit as unknown as { categorie: { nom: string } | null } | null;
    const nom = produit?.categorie?.nom ?? "Sans catégorie";
    parCategorie.set(nom, (parCategorie.get(nom) ?? 0) + l.total_ligne);
  });
  const ventesParCategorie: PointRapport[] = Array.from(parCategorie.entries()).map(
    ([label, total]) => ({ label, total })
  );
  const config = entreprise as Pick<EntrepriseConfigRow, "nom" | "logo_url"> | null;

  return (
    <div className="flex flex-col gap-6">
      <BrandedListPanel
        nom={config?.nom ?? "GIE FASSO BARA"}
        logoUrl={config?.logo_url ?? null}
        title="Rapports"
        subtitle="Export PDF/Excel et visualisation des ventes par agent et par catégorie."
      >
        <QuickActionGrid
          actions={[
            { href: "/admin/rapports", label: "Exporter", description: "PDF ou Excel", icon: faChartLine, tone: "green" },
            { href: "/admin/factures", label: "Factures", description: "Détail ventes", icon: faFileInvoice, tone: "blue" },
            { href: "/admin/stock", label: "Stock", description: "Catalogue", icon: faBoxesStacked, tone: "amber" },
            { href: "/admin/clients", label: "Clients", description: "Soldes", icon: faUsers, tone: "purple" },
          ]}
          columns={4}
        />

        <ReportsClient
          agents={(agents as Pick<UtilisateurRow, "id" | "nom">[]) ?? []}
          ventesParAgent={ventesParAgent}
          ventesParCategorie={ventesParCategorie}
        />
      </BrandedListPanel>
    </div>
  );
}

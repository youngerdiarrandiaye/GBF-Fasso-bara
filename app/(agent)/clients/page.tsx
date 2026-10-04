import { createClient } from "@/lib/supabase/server";
import { faFileCirclePlus, faMagnifyingGlass, faUserPlus, faUsers } from "@fortawesome/free-solid-svg-icons";
import { QuickActionGrid } from "@/components/ui/QuickActionGrid";
import type { ClientRow } from "@/lib/supabase/database.types";
import { ClientsPageContent } from "./ClientsPageContent";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("clients")
    .select("id, nom, type_client, adresse, telephone, email, ninea, created_by, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-h1 font-semibold tracking-tight text-text">Clients</h1>
      <QuickActionGrid
        actions={[
          { href: "/clients", label: "Chercher", description: "Nom ou téléphone", icon: faMagnifyingGlass, tone: "blue" },
          { href: "/nouvelle-facture", label: "Facturer", description: "Créer une vente", icon: faFileCirclePlus, tone: "green" },
          { href: "/clients", label: "Nouveau", description: "Bouton en haut", icon: faUserPlus, tone: "amber" },
          { href: "/mes-factures", label: "Historique", description: "Factures client", icon: faUsers, tone: "purple" },
        ]}
        columns={4}
      />
      <ClientsPageContent clientsInitiaux={(data as ClientRow[]) ?? []} />
    </div>
  );
}

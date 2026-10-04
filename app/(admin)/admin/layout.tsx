import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/admin/Sidebar";
import { Topbar } from "@/components/admin/Topbar";
import { SidebarProvider } from "@/components/admin/SidebarContext";
import { ToastProvider } from "@/components/ui/Toast";
import { NetworkStatusBanner } from "@/components/ui/NetworkStatusBanner";
import type { AlerteFactureRow, AlerteStockRow, EntrepriseConfigRow } from "@/lib/supabase/database.types";

export const dynamic = "force-dynamic";

/**
 * Layout de l'Espace Admin. NOTE D'ORGANISATION DES ROUTES : ce layout et
 * toutes les pages Admin vivent sous `app/(admin)/admin/...` (et non
 * directement `app/(admin)/...`) car `app/(agent)/page.tsx` occupe déjà la
 * route racine "/" (les groupes de routes entre parenthèses n'affectent pas
 * l'URL — deux `page.tsx` à la racine de deux groupes différents
 * provoqueraient une collision de build Next.js). L'Espace Admin est donc
 * servi sous le préfixe "/admin" (tableau de bord = "/admin", stock =
 * "/admin/stock", etc.).
 *
 * Point de coordination signalé à l'orchestrateur : `LoginForm.tsx`
 * (app/(auth)/login), explicitement hors périmètre de cet agent
 * (dev-frontend-agent le maintient en parallèle), contient encore le message
 * "Espace administrateur non disponible pour le moment" pour tout compte
 * role='admin'. Une fois cette Phase 4b validée, ce fichier doit être mis à
 * jour (redirection vers "/admin" au lieu du message de blocage) — non fait
 * ici pour respecter la consigne stricte de non-modification des écrans déjà
 * livrés par dev-frontend-agent.
 *
 * Vérifie la session ET le rôle admin avant de rendre quoi que ce soit
 * (défense en profondeur — les policies RLS restent la garantie ultime).
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profil } = await supabase
    .from("utilisateurs")
    .select("nom, role, actif")
    .eq("id", user.id)
    .single();

  if (!profil || profil.role !== "admin" || !profil.actif) {
    redirect("/login");
  }

  const { data: alertesInitiales } = await supabase
    .from("alertes_stock")
    .select("*")
    .eq("lue", false)
    .order("created_at", { ascending: false })
    .limit(20);

  const { data: alertesPaiementInitiales } = await supabase
    .from("alertes_factures")
    .select("*")
    .eq("lue", false)
    .order("created_at", { ascending: false })
    .limit(20);

  const { data: entreprise } = await supabase
    .from("entreprise_config")
    .select("nom, logo_url")
    .eq("id", true)
    .single();
  const config = entreprise as Pick<EntrepriseConfigRow, "nom" | "logo_url"> | null;

  return (
    <div data-theme="admin" className="min-h-screen bg-bg">
      <ToastProvider theme="dark">
        <SidebarProvider>
          <div className="flex min-h-screen">
            <Sidebar nom={config?.nom ?? "GIE FASSO BARA"} logoUrl={config?.logo_url ?? null} />
            <div className="flex min-w-0 flex-1 flex-col">
              <Topbar
                nom={profil.nom}
                alertesInitiales={(alertesInitiales as AlerteStockRow[]) ?? []}
                alertesPaiementInitiales={(alertesPaiementInitiales as AlerteFactureRow[]) ?? []}
              />
              <NetworkStatusBanner />
              <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
                {children}
              </main>
            </div>
          </div>
        </SidebarProvider>
      </ToastProvider>
    </div>
  );
}

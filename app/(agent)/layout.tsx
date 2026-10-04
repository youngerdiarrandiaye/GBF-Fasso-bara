import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NavBar } from "@/components/agent/NavBar";
import { BottomTabBar } from "@/components/agent/BottomTabBar";
import { ToastProvider } from "@/components/ui/Toast";
import { NetworkStatusBanner } from "@/components/ui/NetworkStatusBanner";

export const dynamic = "force-dynamic";

/**
 * Layout de l'Espace Agent : vérifie la session ET le rôle avant de rendre
 * quoi que ce soit (défense en profondeur — les policies RLS restent la
 * garantie ultime, ce contrôle évite seulement d'afficher un écran vide/
 * erreur à un utilisateur non autorisé).
 */
export default async function AgentLayout({ children }: { children: React.ReactNode }) {
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

  // « / » est l'accueil Agent : un admin connecté y arrive après une
  // déconnexion/reconnexion ou un lien, on l'envoie directement sur son espace.
  if (profil?.role === "admin" && profil.actif) {
    redirect("/admin");
  }
  if (!profil || profil.role !== "agent" || !profil.actif) {
    redirect("/login");
  }

  return (
    <div data-theme="agent" className="min-h-screen bg-bg">
      <ToastProvider>
        <NavBar nom={profil.nom} />
        <NetworkStatusBanner />
        <main className="mx-auto max-w-5xl px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-6 md:pb-10">{children}</main>
        <BottomTabBar />
      </ToastProvider>
    </div>
  );
}

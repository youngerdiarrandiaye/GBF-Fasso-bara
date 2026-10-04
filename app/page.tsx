import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function RootPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profil } = await supabase
    .from("utilisateurs")
    .select("role, actif")
    .eq("id", user.id)
    .single();

  if (profil?.role === "agent" && profil.actif) {
    redirect("/nouvelle-facture");
  }

  // Espace Admin (Phase 4b, dev-frontend-admin) pas encore livré dans cet
  // écran : on ramène tout autre profil vers l'écran de connexion.
  redirect("/login");
}

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

  if (profil?.actif && profil.role === "agent") {
    redirect("/nouvelle-facture");
  }

  if (profil?.actif && profil.role === "admin") {
    redirect("/admin");
  }

  // Profil introuvable, inactif ou rôle inconnu : retour à la connexion.
  redirect("/login");
}

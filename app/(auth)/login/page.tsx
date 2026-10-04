import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: profil } = await supabase
      .from("utilisateurs")
      .select("role, actif")
      .eq("id", user.id)
      .single();

    if (profil?.role === "agent" && profil.actif) {
      redirect("/nouvelle-facture");
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-card bg-green text-h2 font-bold text-white">
          GFB
        </div>
        <h1 className="text-h1 text-text">GIE FASSO BARA</h1>
        <p className="text-body text-muted">Connectez-vous à votre espace agent</p>
      </div>
      <LoginForm />
    </div>
  );
}

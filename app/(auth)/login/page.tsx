import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LoginForm } from "./LoginForm";
import { InstallAppPrompt } from "@/components/ui/InstallAppPrompt";

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
      redirect("/");
    }
    if (profil?.role === "admin" && profil.actif) {
      redirect("/admin");
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <p className="text-body-sm font-semibold uppercase tracking-widest text-green-text">Bienvenue chez GFB</p>
        <h1 className="text-h1 font-semibold tracking-tight text-text">Connectez-vous</h1>
        <p className="text-body leading-relaxed text-muted">Accédez à votre espace avec vos identifiants professionnels.</p>
      </div>
      <LoginForm />
      <p className="border-t border-border pt-5 text-body-sm leading-relaxed text-muted">Besoin d’un accès ? Contactez l’administrateur de votre entreprise.</p>
      <InstallAppPrompt />
    </div>
  );
}

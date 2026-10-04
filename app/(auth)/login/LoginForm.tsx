"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput } from "@/lib/validations/schemas";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { InlineAlert } from "@/components/ui/InlineAlert";

/**
 * Connexion — redirige automatiquement vers l'accueil Agent (/) si le profil
 * connecté est un agent actif, ou vers /admin s'il s'agit d'un administrateur.
 * Le rôle réel provient toujours de la table `utilisateurs`
 * (RLS `utilisateurs_self_select`), jamais d'une valeur décidée côté client.
 */
export function LoginForm() {
  const router = useRouter();
  const [erreurServeur, setErreurServeur] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(values: LoginInput) {
    setErreurServeur(null);
    const supabase = createClient();

    const { data, error } = await supabase.auth.signInWithPassword({
      email: values.email,
      password: values.password,
    });

    if (error || !data.user) {
      setErreurServeur(
        error?.code === "invalid_credentials"
          ? "Identifiants incorrects. Vérifiez votre e-mail et votre mot de passe."
          : "Le service de connexion est indisponible ou la connexion a été refusée. Réessayez dans un instant."
      );
      return;
    }

    const { data: profil, error: erreurProfil } = await supabase
      .from("utilisateurs")
      .select("role, actif")
      .eq("id", data.user.id)
      .single();

    if (erreurProfil || !profil || !profil.actif) {
      setErreurServeur("Votre compte est introuvable ou désactivé. Contactez un administrateur.");
      await supabase.auth.signOut();
      return;
    }

    if (profil.role === "agent") {
      router.push("/");
      router.refresh();
      return;
    }

    if (profil.role === "admin") {
      router.push("/admin");
      router.refresh();
      return;
    }

    setErreurServeur("Rôle utilisateur inconnu. Contactez un administrateur.");
    await supabase.auth.signOut();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      {erreurServeur && <InlineAlert tone="red">{erreurServeur}</InlineAlert>}

      <Input
        label="Adresse e-mail"
        type="email"
        autoComplete="username"
        error={errors.email?.message}
        {...register("email")}
      />
      <Input
        label="Mot de passe"
        type="password"
        autoComplete="current-password"
        error={errors.password?.message}
        {...register("password")}
      />

      <Button type="submit" size="lg" fullWidth loading={isSubmitting}>
        Se connecter
      </Button>
      <Link href="/mot-de-passe-oublie" className="text-center text-body text-muted underline">
        Mot de passe oublié ?
      </Link>
    </form>
  );
}

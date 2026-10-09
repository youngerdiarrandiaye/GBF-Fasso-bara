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
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEye, faEyeSlash, faArrowRight } from "@fortawesome/free-solid-svg-icons";

/**
 * Connexion — redirige automatiquement vers l'accueil Agent (/) si le profil
 * connecté est un agent actif, ou vers /admin s'il s'agit d'un administrateur.
 * Le rôle réel provient toujours de la table `utilisateurs`
 * (RLS `utilisateurs_self_select`), jamais d'une valeur décidée côté client.
 */
export function LoginForm() {
  const router = useRouter();
  const [erreurServeur, setErreurServeur] = useState<string | null>(null);
  const [afficherMotDePasse, setAfficherMotDePasse] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(values: LoginInput) {
    setErreurServeur(null);
    try {
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
    } catch {
      setErreurServeur("Connexion impossible. Vérifiez votre connexion Internet et réessayez.");
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
      {erreurServeur && <InlineAlert tone="red">{erreurServeur}</InlineAlert>}

      <Input
        label="Adresse e-mail"
        type="email"
        autoComplete="username"
        placeholder="vous@entreprise.com"
        autoCapitalize="none"
        spellCheck={false}
        disabled={isSubmitting}
        error={errors.email?.message}
        {...register("email")}
      />
      <div className="relative">
        <Input
          label="Mot de passe"
          type={afficherMotDePasse ? "text" : "password"}
          autoComplete="current-password"
          placeholder="Votre mot de passe"
          className="pr-12"
          disabled={isSubmitting}
          error={errors.password?.message}
          {...register("password")}
        />
        <button type="button" onClick={() => setAfficherMotDePasse(!afficherMotDePasse)}
          className="focus-ring absolute right-1 top-7 flex h-10 w-10 items-center justify-center rounded-input text-muted hover:text-text"
          aria-label={afficherMotDePasse ? "Masquer le mot de passe" : "Afficher le mot de passe"}
          aria-pressed={afficherMotDePasse}>
          <FontAwesomeIcon icon={afficherMotDePasse ? faEyeSlash : faEye} className="h-4 w-4" />
        </button>
      </div>

      <Link href="/mot-de-passe-oublie" className="focus-ring self-end rounded-input text-body-sm font-medium text-green-text underline-offset-4 hover:underline">
        Mot de passe oublié ?
      </Link>

      <Button type="submit" size="lg" fullWidth loading={isSubmitting}>
        Se connecter
        {!isSubmitting && <FontAwesomeIcon icon={faArrowRight} className="h-4 w-4" />}
      </Button>
    </form>
  );
}

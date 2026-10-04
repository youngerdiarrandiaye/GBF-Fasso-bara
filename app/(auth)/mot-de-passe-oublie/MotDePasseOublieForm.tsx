"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motDePasseOublieSchema, type MotDePasseOublieInput } from "@/lib/validations/schemas";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { InlineAlert } from "@/components/ui/InlineAlert";

/**
 * Demande de lien de réinitialisation. Le message affiché est identique que
 * le compte existe ou non : ne jamais révéler quelles adresses sont inscrites.
 */
export function MotDePasseOublieForm() {
  const [envoye, setEnvoye] = useState(false);
  const [erreurServeur, setErreurServeur] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<MotDePasseOublieInput>({ resolver: zodResolver(motDePasseOublieSchema) });

  async function onSubmit(values: MotDePasseOublieInput) {
    setErreurServeur(null);
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(values.email, {
      redirectTo: `${window.location.origin}/auth/confirm?next=/reinitialiser-mot-de-passe`,
    });

    // Seule une panne du service est signalée ; « compte inconnu » ne l'est jamais.
    if (error && (error.status === undefined || error.status >= 500)) {
      setErreurServeur("Le service est indisponible. Réessayez dans un instant.");
      return;
    }
    setEnvoye(true);
  }

  if (envoye) {
    return (
      <InlineAlert tone="green">
        Si un compte existe pour cette adresse, un e-mail contenant un lien de réinitialisation
        vient d&apos;être envoyé. Pensez à vérifier vos courriers indésirables. Sans e-mail,
        demandez à votre administrateur de redéfinir votre mot de passe.
      </InlineAlert>
    );
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
      <Button type="submit" size="lg" fullWidth loading={isSubmitting}>
        Envoyer le lien
      </Button>
    </form>
  );
}

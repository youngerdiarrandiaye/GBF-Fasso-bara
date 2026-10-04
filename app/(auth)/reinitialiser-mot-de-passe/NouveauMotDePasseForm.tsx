"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { nouveauMotDePasseSchema, type NouveauMotDePasseInput } from "@/lib/validations/schemas";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { InlineAlert } from "@/components/ui/InlineAlert";

export function NouveauMotDePasseForm() {
  const router = useRouter();
  const [erreurServeur, setErreurServeur] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<NouveauMotDePasseInput>({ resolver: zodResolver(nouveauMotDePasseSchema) });

  async function onSubmit(values: NouveauMotDePasseInput) {
    setErreurServeur(null);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: values.password });

    if (error) {
      setErreurServeur(
        error.code === "same_password"
          ? "Choisissez un mot de passe différent de l'ancien."
          : "Impossible d'enregistrer le mot de passe. Demandez un nouveau lien."
      );
      return;
    }
    // La racine redirige vers l'espace correspondant au rôle.
    router.push("/");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      {erreurServeur && <InlineAlert tone="red">{erreurServeur}</InlineAlert>}
      <Input
        label="Nouveau mot de passe"
        type="password"
        autoComplete="new-password"
        error={errors.password?.message}
        {...register("password")}
      />
      <Input
        label="Confirmer le mot de passe"
        type="password"
        autoComplete="new-password"
        error={errors.confirmation?.message}
        {...register("confirmation")}
      />
      <Button type="submit" size="lg" fullWidth loading={isSubmitting}>
        Enregistrer et me connecter
      </Button>
    </form>
  );
}

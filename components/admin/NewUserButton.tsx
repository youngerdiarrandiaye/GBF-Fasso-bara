"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { nouvelUtilisateurSchema, type NouvelUtilisateurInput } from "@/lib/validations/schemas";
import { creerUtilisateur } from "@/lib/actions/utilisateurs";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { useToast } from "@/components/ui/Toast";

export function NewUserButton() {
  const router = useRouter();
  const { showToast } = useToast();
  const [ouvert, setOuvert] = useState(false);
  const [erreurServeur, setErreurServeur] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<NouvelUtilisateurInput>({
    resolver: zodResolver(nouvelUtilisateurSchema),
    defaultValues: { role: "agent" },
  });

  async function onSubmit(values: NouvelUtilisateurInput) {
    setErreurServeur(null);
    const resultat = await creerUtilisateur(values);

    if (resultat.error || !resultat.data) {
      setErreurServeur(resultat.error ?? "Erreur inconnue.");
      return;
    }

    showToast(`Compte "${values.nom}" créé.`, "success");
    reset({ role: "agent", nom: "", email: "", password: "" });
    setOuvert(false);
    router.refresh();
  }

  return (
    <>
      <Button onClick={() => setOuvert(true)}>+ Nouvel utilisateur</Button>
      <Modal open={ouvert} onClose={() => setOuvert(false)} title="Nouvel utilisateur">
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          {erreurServeur && <InlineAlert tone="red">{erreurServeur}</InlineAlert>}

          <Input label="Nom complet" error={errors.nom?.message} {...register("nom")} />
          <Input label="Adresse e-mail" type="email" error={errors.email?.message} {...register("email")} />
          <Input
            label="Mot de passe temporaire"
            type="password"
            hint="Au moins 8 caractères. L'utilisateur pourra le modifier après sa première connexion."
            error={errors.password?.message}
            {...register("password")}
          />

          <div className="flex flex-col gap-1.5">
            <label htmlFor="role" className="text-body font-medium text-text">
              Rôle
            </label>
            <select
              id="role"
              className="focus-ring h-tap w-full rounded-input border border-border bg-surface px-3 text-body text-text"
              {...register("role")}
            >
              <option value="agent">Agent</option>
              <option value="admin">Administrateur</option>
            </select>
          </div>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => setOuvert(false)}>
              Annuler
            </Button>
            <Button type="submit" loading={isSubmitting}>
              Créer le compte
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { clientRapideSchema, type ClientRapideInput } from "@/lib/validations/schemas";
import { creerClientRapide } from "@/lib/actions/factures";
import type { ClientRow } from "@/lib/supabase/database.types";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { InlineAlert } from "@/components/ui/InlineAlert";

const OPTIONS_TYPE_CLIENT: { value: ClientRapideInput["type_client"]; label: string }[] = [
  { value: "particulier", label: "Particulier" },
  { value: "entreprise", label: "Entreprise" },
  { value: "cooperative", label: "Coopérative" },
];

/**
 * Modal "Nouveau client" — docs/design-system.md §6.6 : ne doit jamais faire
 * perdre le contexte du formulaire de facture en cours ; au submit, ferme et
 * réinjecte le client créé dans le champ de recherche (onCreated).
 */
export function NouveauClientModal({
  open,
  onClose,
  onCreated,
  nomInitial = "",
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (client: ClientRow) => void;
  nomInitial?: string;
}) {
  const [erreurServeur, setErreurServeur] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ClientRapideInput>({
    resolver: zodResolver(clientRapideSchema),
    defaultValues: { nom: nomInitial, type_client: "particulier" },
  });

  async function onSubmit(values: ClientRapideInput) {
    setErreurServeur(null);
    const result = await creerClientRapide(values);
    if (result.error || !result.data) {
      setErreurServeur(result.error ?? "Erreur inconnue lors de la création du client.");
      return;
    }
    onCreated(result.data);
    reset();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Nouveau client">
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        {erreurServeur && <InlineAlert tone="red">{erreurServeur}</InlineAlert>}

        <Input
          label="Nom du client"
          autoFocus
          error={errors.nom?.message}
          {...register("nom")}
        />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="type_client" className="text-body font-medium text-text">
            Type de client
          </label>
          <select
            id="type_client"
            className="focus-ring h-tap w-full rounded-input border border-border bg-surface px-3 text-body text-text"
            {...register("type_client")}
          >
            {OPTIONS_TYPE_CLIENT.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <Input
          label="Téléphone"
          type="tel"
          inputMode="tel"
          error={errors.telephone?.message}
          {...register("telephone")}
        />
        <Input
          label="Adresse"
          error={errors.adresse?.message}
          {...register("adresse")}
        />
        <Input
          label="E-mail"
          type="email"
          error={errors.email?.message}
          {...register("email")}
        />

        <div className="mt-2 flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" loading={isSubmitting}>
            Créer le client
          </Button>
        </div>
      </form>
    </Modal>
  );
}

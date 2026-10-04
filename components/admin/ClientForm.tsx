"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { clientAdminSchema, type ClientAdminInput } from "@/lib/validations/schemas";
import { creerClientAdmin, modifierClient } from "@/lib/actions/clients-admin";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { useToast } from "@/components/ui/Toast";
import type { ClientRow } from "@/lib/supabase/database.types";

const TYPES_CLIENT = [
  { value: "particulier", label: "Particulier" },
  { value: "entreprise", label: "Entreprise" },
  { value: "cooperative", label: "Coopérative" },
] as const;

export function ClientForm({
  client,
  onSuccess,
}: {
  client?: ClientRow;
  onSuccess?: (client: ClientRow) => void;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [erreurServeur, setErreurServeur] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ClientAdminInput>({
    resolver: zodResolver(clientAdminSchema),
    defaultValues: client
      ? {
          nom: client.nom,
          type_client: client.type_client,
          telephone: client.telephone ?? "",
          adresse: client.adresse ?? "",
          email: client.email ?? "",
          ninea: client.ninea ?? "",
        }
      : { type_client: "particulier" },
  });

  async function onSubmit(values: ClientAdminInput) {
    setErreurServeur(null);
    const resultat = client
      ? await modifierClient(client.id, values)
      : await creerClientAdmin(values);

    if (resultat.error || !resultat.data) {
      setErreurServeur(resultat.error ?? "Erreur inconnue.");
      return;
    }

    showToast(
      client ? `Client "${values.nom}" mis à jour.` : `Client "${values.nom}" créé.`,
      "success"
    );
    router.refresh();
    onSuccess?.(resultat.data);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      {erreurServeur && <InlineAlert tone="red">{erreurServeur}</InlineAlert>}

      <Input label="Nom du client" error={errors.nom?.message} {...register("nom")} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="type_client" className="text-body font-medium text-text">
          Type de client
        </label>
        <select
          id="type_client"
          className="focus-ring h-tap w-full rounded-input border border-border bg-surface px-3 text-body text-text"
          {...register("type_client")}
        >
          {TYPES_CLIENT.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input label="Téléphone" error={errors.telephone?.message} {...register("telephone")} />
        <Input label="E-mail" type="email" error={errors.email?.message} {...register("email")} />
      </div>

      <Input label="Adresse" error={errors.adresse?.message} {...register("adresse")} />
      <Input label="NINEA" error={errors.ninea?.message} {...register("ninea")} />

      <div className="flex justify-end gap-3">
        <Button type="submit" loading={isSubmitting}>
          {client ? "Enregistrer les modifications" : "Créer le client"}
        </Button>
      </div>
    </form>
  );
}

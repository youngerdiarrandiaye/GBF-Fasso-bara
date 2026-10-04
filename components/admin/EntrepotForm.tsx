"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { entrepotSchema, type EntrepotInput } from "@/lib/validations/schemas";
import { creerEntrepot, modifierEntrepot } from "@/lib/actions/entrepots";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { useToast } from "@/components/ui/Toast";
import type { EntrepotRow } from "@/lib/supabase/database.types";

/**
 * Formulaire entrepôt — création/modification, admin only (RLS
 * `entrepots_admin_all`, migration 0013 section 2). Même structure que
 * `ClientForm` (docs/design-system.md, écran-liste + modal de création).
 */
export function EntrepotForm({
  entrepot,
  onSuccess,
}: {
  entrepot?: EntrepotRow;
  onSuccess?: (entrepot: EntrepotRow) => void;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [erreurServeur, setErreurServeur] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EntrepotInput>({
    resolver: zodResolver(entrepotSchema),
    defaultValues: entrepot
      ? { nom: entrepot.nom, adresse: entrepot.adresse ?? "", actif: entrepot.actif }
      : { nom: "", adresse: "", actif: true },
  });

  async function onSubmit(values: EntrepotInput) {
    setErreurServeur(null);
    const resultat = entrepot
      ? await modifierEntrepot(entrepot.id, values)
      : await creerEntrepot(values);

    if (resultat.error || !resultat.data) {
      setErreurServeur(resultat.error ?? "Erreur inconnue.");
      return;
    }

    showToast(
      entrepot ? `Entrepôt "${values.nom}" mis à jour.` : `Entrepôt "${values.nom}" créé.`,
      "success"
    );
    router.refresh();
    onSuccess?.(resultat.data);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      {erreurServeur && <InlineAlert tone="red">{erreurServeur}</InlineAlert>}

      <Input label="Nom de l'entrepôt" error={errors.nom?.message} {...register("nom")} />
      <Input label="Adresse (optionnel)" error={errors.adresse?.message} {...register("adresse")} />

      {entrepot && (
        <label className="flex items-center gap-2 text-body text-text">
          <input type="checkbox" className="focus-ring h-4 w-4 rounded" {...register("actif")} />
          Entrepôt actif (visible dans les sélecteurs et formulaires)
        </label>
      )}

      <div className="flex justify-end gap-3">
        <Button type="submit" loading={isSubmitting}>
          {entrepot ? "Enregistrer les modifications" : "Créer l'entrepôt"}
        </Button>
      </div>
    </form>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  modifierUtilisateurSchema,
  nouveauMotDePasseSchema,
  type ModifierUtilisateurInput,
  type NouveauMotDePasseInput,
} from "@/lib/validations/schemas";
import {
  desactiverUtilisateur,
  modifierUtilisateur,
  reactiverUtilisateur,
  redefinirMotDePasse,
} from "@/lib/actions/utilisateurs";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { useToast } from "@/components/ui/Toast";
import type { UtilisateurRow } from "@/lib/supabase/database.types";

export function UserRowActions({
  utilisateur,
  estSoiMeme,
}: {
  utilisateur: UtilisateurRow;
  estSoiMeme: boolean;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [modalOuvert, setModalOuvert] = useState(false);
  const [erreurServeur, setErreurServeur] = useState<string | null>(null);
  const [enCoursStatut, setEnCoursStatut] = useState(false);
  const [modalMdpOuvert, setModalMdpOuvert] = useState(false);
  const [erreurMdp, setErreurMdp] = useState<string | null>(null);

  const formMdp = useForm<NouveauMotDePasseInput>({
    resolver: zodResolver(nouveauMotDePasseSchema),
    defaultValues: { password: "", confirmation: "" },
  });

  function fermerModalMdp() {
    setModalMdpOuvert(false);
    setErreurMdp(null);
    formMdp.reset();
  }

  async function onSubmitMdp(values: NouveauMotDePasseInput) {
    setErreurMdp(null);
    const resultat = await redefinirMotDePasse(utilisateur.id, values.password);
    if (resultat.error) {
      setErreurMdp(resultat.error);
      return;
    }
    showToast(`Mot de passe de "${utilisateur.nom}" redéfini. Communiquez-le-lui en main propre.`, "success");
    fermerModalMdp();
  }

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ModifierUtilisateurInput>({
    resolver: zodResolver(modifierUtilisateurSchema),
    defaultValues: {
      id: utilisateur.id,
      nom: utilisateur.nom,
      role: utilisateur.role,
      actif: utilisateur.actif,
    },
  });

  async function onSubmit(values: ModifierUtilisateurInput) {
    setErreurServeur(null);
    const resultat = await modifierUtilisateur(values);

    if (resultat.error || !resultat.data) {
      setErreurServeur(resultat.error ?? "Erreur inconnue.");
      return;
    }

    showToast(`Utilisateur "${values.nom}" mis à jour.`, "success");
    setModalOuvert(false);
    router.refresh();
  }

  async function handleToggleActif() {
    setEnCoursStatut(true);
    const resultat = utilisateur.actif
      ? await desactiverUtilisateur(utilisateur.id)
      : await reactiverUtilisateur(utilisateur.id);
    setEnCoursStatut(false);

    if (resultat.error) {
      showToast(resultat.error, "error");
      return;
    }
    showToast(
      utilisateur.actif ? `Compte "${utilisateur.nom}" désactivé.` : `Compte "${utilisateur.nom}" réactivé.`,
      "success"
    );
    router.refresh();
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <Button size="sm" variant="outline" onClick={() => setModalOuvert(true)}>
        Modifier
      </Button>
      <Button size="sm" variant="outline" onClick={() => setModalMdpOuvert(true)}>
        Mot de passe
      </Button>
      <Button
        size="sm"
        variant={utilisateur.actif ? "destructive" : "secondary"}
        onClick={handleToggleActif}
        loading={enCoursStatut}
        disabled={estSoiMeme}
        title={estSoiMeme ? "Vous ne pouvez pas modifier votre propre statut." : undefined}
      >
        {utilisateur.actif ? "Désactiver" : "Réactiver"}
      </Button>

      <Modal open={modalOuvert} onClose={() => setModalOuvert(false)} title="Modifier l'utilisateur">
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          {erreurServeur && <InlineAlert tone="red">{erreurServeur}</InlineAlert>}
          {estSoiMeme && (
            <InlineAlert tone="amber">
              Vous ne pouvez pas modifier votre propre rôle ou statut actif (protection anti
              auto-promotion).
            </InlineAlert>
          )}
          <input type="hidden" {...register("id")} />

          <Input label="Nom complet" error={errors.nom?.message} {...register("nom")} />

          <div className="flex flex-col gap-1.5">
            <label htmlFor="role-edit" className="text-body font-medium text-text">
              Rôle
            </label>
            <select
              id="role-edit"
              disabled={estSoiMeme}
              className="focus-ring h-tap w-full rounded-input border border-border bg-surface px-3 text-body text-text disabled:bg-surface-2 disabled:text-muted"
              {...register("role")}
            >
              <option value="agent">Agent</option>
              <option value="admin">Administrateur</option>
            </select>
          </div>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              disabled={estSoiMeme}
              className="h-5 w-5 rounded-input"
              {...register("actif")}
            />
            <span className="text-body text-text">Compte actif</span>
          </label>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => setModalOuvert(false)}>
              Annuler
            </Button>
            <Button type="submit" loading={isSubmitting}>
              Enregistrer
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={modalMdpOuvert}
        onClose={fermerModalMdp}
        title={`Redéfinir le mot de passe — ${utilisateur.nom}`}
      >
        <form onSubmit={formMdp.handleSubmit(onSubmitMdp)} className="flex flex-col gap-4" noValidate>
          {erreurMdp && <InlineAlert tone="red">{erreurMdp}</InlineAlert>}
          <p className="text-body text-muted">
            L&apos;ancien mot de passe cesse immédiatement de fonctionner. Transmettez le nouveau à
            l&apos;utilisateur de vive voix, jamais par écrit.
          </p>
          <Input
            label="Nouveau mot de passe"
            type="password"
            autoComplete="new-password"
            error={formMdp.formState.errors.password?.message}
            {...formMdp.register("password")}
          />
          <Input
            label="Confirmer le mot de passe"
            type="password"
            autoComplete="new-password"
            error={formMdp.formState.errors.confirmation?.message}
            {...formMdp.register("confirmation")}
          />
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={fermerModalMdp}>
              Annuler
            </Button>
            <Button type="submit" loading={formMdp.formState.isSubmitting}>
              Redéfinir
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

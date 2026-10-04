"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { paiementSchema, type PaiementInput } from "@/lib/validations/schemas";
import { enregistrerPaiement, type ResultatPaiement } from "@/lib/actions/paiements";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { useToast } from "@/components/ui/Toast";
import { formatMontant } from "@/lib/format";

const MODES_PAIEMENT = [
  { value: "especes", label: "Espèces" },
  { value: "virement", label: "Virement" },
  { value: "mobile_money", label: "Mobile Money" },
  { value: "cheque", label: "Chèque" },
] as const;

export function PaymentModal({
  factureId,
  factureNumero,
  resteAPayer,
  open,
  onClose,
}: {
  factureId: string;
  factureNumero: string;
  resteAPayer: number;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [erreurServeur, setErreurServeur] = useState<string | null>(null);
  const [isRefreshing, startTransition] = useTransition();
  // Paiement confirmé par le serveur (Server Action résolue avec succès),
  // en attente que router.refresh() ait fini de rapatrier les données
  // fraîches (montant payé / reste à payer / statut affichés derrière la
  // modale) avant de fermer la modale et d'afficher le toast — voir
  // docs/toast-et-coherence-donnees.md §5.2 et §6 anomalie #8 : le toast ne
  // doit jamais annoncer une mise à jour avant que l'écran ne la reflète déjà.
  // `factureStatut`/`resteAPayer` proviennent de la relecture serveur faite par
  // `enregistrerPaiement` après l'INSERT (§9 V3.5) — jamais recalculés ici.
  const [paiementConfirme, setPaiementConfirme] = useState<{
    montant: PaiementInput["montant"];
    factureStatut: ResultatPaiement["factureStatut"];
    resteAPayer: number;
  } | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PaiementInput>({
    resolver: zodResolver(paiementSchema),
    defaultValues: {
      facture_id: factureId,
      montant: resteAPayer,
      mode_paiement: "especes",
      date_paiement: new Date().toISOString().slice(0, 10),
    },
  });

  async function onSubmit(values: PaiementInput) {
    setErreurServeur(null);
    const resultat = await enregistrerPaiement(values);

    if (resultat.error || !resultat.data) {
      setErreurServeur(resultat.error ?? "Erreur inconnue.");
      return;
    }

    // Ne pas fermer ni afficher le toast tout de suite : on attend que la
    // transition de rafraîchissement retombe (voir l'effet ci-dessous).
    setPaiementConfirme({
      montant: values.montant,
      factureStatut: resultat.data.factureStatut,
      resteAPayer: resultat.data.resteAPayer,
    });
    startTransition(() => {
      router.refresh();
    });
  }

  useEffect(() => {
    if (!paiementConfirme || isRefreshing) return;

    // Les données affichées derrière la modale (reste à payer, statut) sont
    // désormais à jour : le toast peut être montré en toute cohérence.
    // Nuance soldée/partielle (docs/toast-et-coherence-donnees.md §9 V3.5) :
    // `factureStatut`/`resteAPayer` viennent tous deux de la relecture
    // serveur faite par `enregistrerPaiement`, jamais d'une soustraction
    // locale (`resteAPayer` prop - montant), qui violerait la règle 4d.
    const montantFormate = formatMontant(paiementConfirme.montant);
    if (paiementConfirme.factureStatut === "payee") {
      showToast(`Paiement de ${montantFormate} enregistré — facture ${factureNumero} soldée.`, "success");
    } else {
      showToast(
        `Paiement partiel de ${montantFormate} enregistré — facture ${factureNumero}, reste ${formatMontant(paiementConfirme.resteAPayer)}.`,
        "success"
      );
    }
    reset();
    onClose();
    // Réarme l'état local pour une prochaine ouverture du modal (le
    // composant reste monté entre deux paiements, seul `open` bascule) — ce
    // n'est pas un "cascading render" évitable : on synchronise l'état local
    // avec la fin, confirmée, d'un système externe (la transition de
    // rafraîchissement Next.js), exactement le cas d'usage documenté par la
    // règle elle-même ("subscribe to updates from an external system").
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPaiementConfirme(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRefreshing, paiementConfirme, factureNumero]);

  const enAttenteConfirmation = paiementConfirme !== null;

  function handleClose() {
    // Empêche une fermeture manuelle (Esc, clic overlay, bouton Annuler)
    // pendant la fenêtre où le paiement est confirmé mais le rafraîchissement
    // des données de la page est encore en cours.
    if (isSubmitting || enAttenteConfirmation) return;
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title="Enregistrer un paiement">
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        <p className="rounded-card bg-surface-2 p-3 text-body">Facture <strong>{factureNumero}</strong><br />Reste à payer : <strong>{formatMontant(resteAPayer)}</strong></p>
        {erreurServeur && <InlineAlert tone="red">{erreurServeur}</InlineAlert>}
        <fieldset disabled={isSubmitting || enAttenteConfirmation} className="flex min-w-0 flex-col gap-4">
        <input type="hidden" {...register("facture_id")} />

        <Input
          label="Montant (FCFA)"
          type="number"
          step="0.01"
          hint={`Reste à payer : ${resteAPayer.toLocaleString("fr-FR")} FCFA`}
          error={errors.montant?.message}
          {...register("montant", { valueAsNumber: true })}
        />

        <fieldset className="min-w-0">
          <legend className="mb-2 text-body font-medium text-text">
            Mode de paiement
          </legend>
          <div className="grid grid-cols-2 gap-2">
            {MODES_PAIEMENT.map((m) => (
              <label key={m.value} className="relative cursor-pointer">
                <input type="radio" value={m.value} {...register("mode_paiement")} className="peer sr-only" />
                <span className="flex min-h-14 items-center justify-center rounded-input border border-border px-3 py-3 text-center text-body peer-checked:border-green peer-checked:bg-surface-2 peer-checked:font-semibold peer-focus-visible:ring-2 peer-focus-visible:ring-green">{m.label}</span>
              </label>
            ))}
          </div>
          {errors.mode_paiement && <p role="alert" className="text-body-sm text-red-text">{errors.mode_paiement.message}</p>}
        </fieldset>

        <Input
          label="Date du paiement"
          type="date"
          error={errors.date_paiement?.message}
          {...register("date_paiement")}
        />

        <details className="rounded-input border border-border p-3" open={errors.reference ? true : undefined}>
        <summary className="focus-ring cursor-pointer text-body">Ajouter une référence (optionnel)</summary>
        <div className="mt-3"><Input
          label="Référence (optionnel)"
          hint="N° de transaction, chèque, reçu..."
          error={errors.reference?.message}
          {...register("reference")}
        /></div>
        </details>
        </fieldset>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={handleClose} disabled={isSubmitting || enAttenteConfirmation}>
            Annuler
          </Button>
          <Button type="submit" loading={isSubmitting || enAttenteConfirmation}>
            Confirmer le paiement
          </Button>
        </div>
      </form>
    </Modal>
  );
}

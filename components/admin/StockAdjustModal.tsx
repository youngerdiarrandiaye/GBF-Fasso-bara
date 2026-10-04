"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { NumberInput } from "@/components/ui/NumberInput";
import { Button } from "@/components/ui/Button";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { useToast } from "@/components/ui/Toast";
import { ajusterStock } from "@/lib/actions/produits";
import { libelleUnite } from "@/lib/format";
import type { ProduitRow } from "@/lib/supabase/database.types";

/**
 * Modal d'ajustement de stock manuel — docs/design-system.md §6.6 : champ
 * quantité + motif obligatoire (texte, requis avant activation du bouton de
 * confirmation).
 */
export function StockAdjustModal({
  produit,
  open,
  onClose,
}: {
  produit: ProduitRow;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [nouvelleQuantite, setNouvelleQuantite] = useState(produit.quantite_stock);
  const [motif, setMotif] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [isRefreshing, startTransition] = useTransition();
  // Ajustement confirmé par le serveur, en attente que router.refresh() ait
  // fini de rapatrier la fiche produit à jour (jauge de stock affichée
  // derrière la modale) avant de fermer la modale et d'afficher le toast —
  // voir docs/toast-et-coherence-donnees.md §5.3 et §6 anomalie #8. Les
  // quantités sont capturées ici plutôt que relues depuis les props/state au
  // moment du toast, pour éviter toute ambiguïté si l'admin modifiait encore
  // la quantité pendant cette courte fenêtre d'attente.
  const [ajustementConfirme, setAjustementConfirme] = useState<{
    quantiteAvant: number;
    quantiteApres: number;
    motif: string;
  } | null>(null);

  const motifValide = motif.trim().length >= 5;
  const quantiteChangee = nouvelleQuantite !== produit.quantite_stock;
  const delta = nouvelleQuantite - produit.quantite_stock;
  const enAttenteConfirmation = ajustementConfirme !== null;

  async function handleConfirmer() {
    setErreur(null);
    setEnCours(true);
    const resultat = await ajusterStock({
      produit_id: produit.id,
      nouvelle_quantite: nouvelleQuantite,
      motif,
    });
    setEnCours(false);

    if (resultat.error) {
      setErreur(resultat.error);
      return;
    }

    // Ne pas fermer ni afficher le toast tout de suite : on attend que la
    // transition de rafraîchissement retombe (voir l'effet ci-dessous).
    setAjustementConfirme({
      quantiteAvant: produit.quantite_stock,
      quantiteApres: nouvelleQuantite,
      motif,
    });
    startTransition(() => {
      router.refresh();
    });
  }

  useEffect(() => {
    if (!ajustementConfirme || isRefreshing) return;

    // La jauge de stock affichée derrière la modale est désormais à jour :
    // le toast peut être montré en toute cohérence. Le motif est tronqué à
    // ~60 caractères pour rester lisible en une ligne (le motif complet reste
    // consultable dans l'historique des mouvements de stock) — voir
    // docs/toast-et-coherence-donnees.md §9 V3.3.
    const motifSaisi = ajustementConfirme.motif.trim();
    const motifAffiche = motifSaisi.length > 60 ? `${motifSaisi.slice(0, 60).trimEnd()}…` : motifSaisi;
    showToast(
      `Stock de "${produit.nom}" ajusté : ${ajustementConfirme.quantiteAvant} → ${ajustementConfirme.quantiteApres} ${libelleUnite(produit.unite, ajustementConfirme.quantiteApres)} — motif : ${motifAffiche}.`,
      "success"
    );
    onClose();
    // Réarme l'état local pour une prochaine ouverture du modal (le
    // composant reste monté entre deux ajustements, seul `open` bascule) —
    // on synchronise ici l'état local avec la fin, confirmée, d'un système
    // externe (la transition de rafraîchissement Next.js), exactement le cas
    // d'usage documenté par la règle elle-même ("subscribe to updates from
    // an external system").
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMotif("");
    setAjustementConfirme(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRefreshing, ajustementConfirme]);

  function handleClose() {
    // Empêche une fermeture manuelle pendant la fenêtre où l'ajustement est
    // confirmé mais le rafraîchissement des données de la page est encore en
    // cours (mêmes garanties que PaymentModal, docs/toast-et-coherence-donnees.md §6 #8).
    if (enAttenteConfirmation) return;
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title="Ajuster le stock manuellement">
      <div className="flex flex-col gap-4">
        <p className="text-body text-muted">
          Produit : <span className="font-medium text-text">{produit.nom}</span> (
          <span className="font-mono">{produit.code}</span>)
        </p>

        {erreur && <InlineAlert tone="red">{erreur}</InlineAlert>}

        <NumberInput
          label={`Nouvelle quantité en stock (actuellement ${produit.quantite_stock})`}
          value={nouvelleQuantite}
          onChange={setNouvelleQuantite}
        />

        {quantiteChangee && (
          <InlineAlert tone={delta > 0 ? "green" : "amber"}>
            {delta > 0 ? "Entrée" : "Sortie"} de {Math.abs(delta)} {libelleUnite(produit.unite, Math.abs(delta))}.
          </InlineAlert>
        )}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="motif-ajustement" className="text-body font-medium text-text">
            Motif de l&apos;ajustement <span className="text-red-text">*</span>
          </label>
          <textarea
            id="motif-ajustement"
            rows={3}
            required
            placeholder="Ex : inventaire physique, casse, retour fournisseur..."
            className="focus-ring w-full rounded-input border border-border bg-surface px-3 py-2 text-body text-text"
            value={motif}
            onChange={(e) => setMotif(e.target.value)}
          />
          {!motifValide && motif.length > 0 && (
            <p className="text-body-sm text-red-text">Le motif doit contenir au moins 5 caractères.</p>
          )}
        </div>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={handleClose} disabled={enAttenteConfirmation}>
            Annuler
          </Button>
          <Button
            type="button"
            onClick={handleConfirmer}
            loading={enCours || enAttenteConfirmation}
            disabled={!motifValide || !quantiteChangee}
          >
            Confirmer l&apos;ajustement
          </Button>
        </div>
      </div>
    </Modal>
  );
}

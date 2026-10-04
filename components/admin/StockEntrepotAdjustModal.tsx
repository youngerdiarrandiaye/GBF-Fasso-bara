"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { NumberInput } from "@/components/ui/NumberInput";
import { Button } from "@/components/ui/Button";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { useToast } from "@/components/ui/Toast";
import { ajusterStockEntrepot } from "@/lib/actions/entrepots";
import { libelleUnite } from "@/lib/format";

/**
 * Modal d'ajustement de stock manuel PAR ENTREPÔT — mirroir exact de
 * `StockAdjustModal` (Stock V1), mais appelle `ajusterStockEntrepot()`
 * (RPC `ajuster_stock_manuel_entrepot`, motif obligatoire) au lieu de
 * `ajusterStock()`. Toute action sensible passe par cette Server Action,
 * jamais une écriture directe côté client (contrainte stricte du brief).
 */
export function StockEntrepotAdjustModal({
  produitId,
  produitNom,
  produitCode,
  unite,
  entrepotId,
  entrepotNom,
  quantiteActuelle,
  open,
  onClose,
}: {
  produitId: string;
  produitNom: string;
  produitCode: string;
  unite: string;
  entrepotId: string;
  entrepotNom: string;
  quantiteActuelle: number;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [nouvelleQuantite, setNouvelleQuantite] = useState(quantiteActuelle);
  const [motif, setMotif] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [isRefreshing, startTransition] = useTransition();
  const [ajustementConfirme, setAjustementConfirme] = useState<{
    quantiteAvant: number;
    quantiteApres: number;
    motif: string;
  } | null>(null);

  const motifValide = motif.trim().length >= 5;
  const quantiteChangee = nouvelleQuantite !== quantiteActuelle;
  const delta = nouvelleQuantite - quantiteActuelle;
  const enAttenteConfirmation = ajustementConfirme !== null;

  async function handleConfirmer() {
    setErreur(null);
    setEnCours(true);
    const resultat = await ajusterStockEntrepot({
      produit_id: produitId,
      entrepot_id: entrepotId,
      nouvelle_quantite: nouvelleQuantite,
      motif,
    });
    setEnCours(false);

    if (resultat.error) {
      setErreur(resultat.error);
      return;
    }

    setAjustementConfirme({ quantiteAvant: quantiteActuelle, quantiteApres: nouvelleQuantite, motif });
    startTransition(() => {
      router.refresh();
    });
  }

  useEffect(() => {
    if (!ajustementConfirme || isRefreshing) return;

    const motifSaisi = ajustementConfirme.motif.trim();
    const motifAffiche = motifSaisi.length > 60 ? `${motifSaisi.slice(0, 60).trimEnd()}…` : motifSaisi;
    showToast(
      `Stock de "${produitNom}" ajusté à l'entrepôt "${entrepotNom}" : ${ajustementConfirme.quantiteAvant} → ${ajustementConfirme.quantiteApres} ${libelleUnite(unite, ajustementConfirme.quantiteApres)} — motif : ${motifAffiche}.`,
      "success"
    );
    onClose();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMotif("");
    setAjustementConfirme(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRefreshing, ajustementConfirme]);

  function handleClose() {
    if (enAttenteConfirmation) return;
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title="Ajuster le stock manuellement">
      <div className="flex flex-col gap-4">
        <p className="text-body text-muted">
          Produit : <span className="font-medium text-text">{produitNom}</span> (
          <span className="font-mono">{produitCode}</span>) — Entrepôt :{" "}
          <span className="font-medium text-text">{entrepotNom}</span>
        </p>

        {erreur && <InlineAlert tone="red">{erreur}</InlineAlert>}

        <NumberInput
          label={`Nouvelle quantité en stock (actuellement ${quantiteActuelle})`}
          value={nouvelleQuantite}
          onChange={setNouvelleQuantite}
        />

        {quantiteChangee && (
          <InlineAlert tone={delta > 0 ? "green" : "amber"}>
            {delta > 0 ? "Entrée" : "Sortie"} de {Math.abs(delta)} {libelleUnite(unite, Math.abs(delta))}.
          </InlineAlert>
        )}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="motif-ajustement-entrepot" className="text-body font-medium text-text">
            Motif de l&apos;ajustement <span className="text-red-text">*</span>
          </label>
          <textarea
            id="motif-ajustement-entrepot"
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

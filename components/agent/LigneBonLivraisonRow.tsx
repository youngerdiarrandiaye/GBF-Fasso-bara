"use client";

import type { LigneBonLivraisonInput } from "@/lib/validations/schemas";
import { NumberInput } from "@/components/ui/NumberInput";
import { InlineAlert } from "@/components/ui/InlineAlert";

/**
 * Ligne de bon de livraison en cours de saisie — mirroir allégé de
 * `LigneFactureRow` (pas de prix : un BL est un document logistique, pas
 * commercial, cf. migration 0013 section 6). Même principe d'alerte inline
 * immédiate (stock local déjà connu côté client) si quantité > stock
 * disponible DANS L'ENTREPÔT SÉLECTIONNÉ — n'attend jamais la validation
 * serveur pour ce feedback, alors même qu'un BL n'a pas d'étape brouillon :
 * le décrément réel est immédiat dès l'ajout d'une ligne côté serveur
 * (`gerer_ligne_bon_livraison()`), ce qui rend ce feedback anticipé
 * particulièrement utile ici.
 */
export function LigneBonLivraisonRow({
  ligne,
  onQuantiteChange,
  onRemove,
  erreurServeur,
  lectureSeule = false,
}: {
  ligne: LigneBonLivraisonInput;
  onQuantiteChange: (quantite: number) => void;
  onRemove: () => void;
  erreurServeur?: string;
  lectureSeule?: boolean;
}) {
  const depasseStock = ligne.quantite > ligne.stock_disponible;
  const stockEpuise = ligne.stock_disponible <= 0;

  return (
    <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-body font-medium text-text">{ligne.nom}</p>
          <p className="font-mono text-body-sm text-muted">
            {ligne.code} · {ligne.stock_disponible} {ligne.unite} en stock
          </p>
        </div>
        {!lectureSeule && <button
          type="button"
          onClick={onRemove}
          className="focus-ring tap-target flex shrink-0 items-center justify-center rounded-input text-h3 text-muted hover:bg-surface-2 hover:text-red-text"
          aria-label={`Retirer ${ligne.nom} du bon de livraison`}
        >
          ×
        </button>}
      </div>

      {lectureSeule ? <p className="font-mono text-body">Quantité à livrer : {ligne.quantite} {ligne.unite}</p> : <NumberInput
        label="Quantité"
        value={ligne.quantite}
        onChange={onQuantiteChange}
        step={1}
        min={0}
        max={stockEpuise ? 0 : undefined}
      />}

      {depasseStock && (
        <InlineAlert tone="amber">
          Quantité ({ligne.quantite} {ligne.unite}) supérieure au stock disponible (
          {ligne.stock_disponible} {ligne.unite}) dans cet entrepôt. La création du bon de livraison
          sera refusée tant que le stock n&apos;est pas suffisant.
        </InlineAlert>
      )}
      {erreurServeur && <InlineAlert tone="red">{erreurServeur}</InlineAlert>}
    </div>
  );
}

"use client";

import type { LigneFactureInput } from "@/lib/validations/schemas";
import { formatMontant } from "@/lib/format";
import { NumberInput } from "@/components/ui/NumberInput";
import { Badge } from "@/components/ui/Badge";
import { InlineAlert } from "@/components/ui/InlineAlert";

/**
 * Ligne de facture en cours de saisie. Alerte inline immédiate (stock local
 * déjà connu côté client) si quantité > stock disponible — n'attend jamais
 * la validation serveur pour ce feedback (docs §6.2 + consigne dev-frontend-agent).
 * Le badge "Inclus" (jamais "0 FCFA") pour les produits inclus_dans_kit suit
 * D-04.
 */
export function LigneFactureRow({
  ligne,
  onQuantiteChange,
  onPrixChange,
  onRemove,
  erreurServeur,
}: {
  ligne: LigneFactureInput;
  onQuantiteChange: (quantite: number) => void;
  onPrixChange: (prix: number) => void;
  onRemove: () => void;
  erreurServeur?: string;
}) {
  const estInclusDansKit = ligne.type_ligne_produit === "inclus_dans_kit";
  const depasseStock = ligne.quantite > ligne.stock_disponible;
  const totalLigne = estInclusDansKit ? 0 : ligne.quantite * ligne.prix_unitaire;

  return (
    <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-body font-medium text-text">{ligne.nom}</p>
          <p className="font-mono text-body text-muted">
            {ligne.code} · {ligne.stock_disponible} {ligne.unite} en stock
          </p>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="focus-ring tap-target flex shrink-0 items-center justify-center rounded-input text-h3 text-muted hover:bg-surface-2 hover:text-red-text"
          aria-label={`Retirer ${ligne.nom} de la facture`}
        >
          ×
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <NumberInput
          label="Quantité"
          value={ligne.quantite}
          onChange={onQuantiteChange}
          step={1}
          min={0}
        />
        {estInclusDansKit ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-body font-medium text-text">Prix</span>
            <div className="flex h-tap items-center rounded-input border border-border bg-surface-2 px-3">
              <Badge tone="blue">Inclus</Badge>
            </div>
          </div>
        ) : (
          <NumberInput
            label="Prix unitaire"
            value={ligne.prix_unitaire}
            onChange={onPrixChange}
            step={100}
            min={0}
          />
        )}
        <div className="col-span-2 flex flex-col gap-1.5 sm:col-span-1">
          <span className="text-body font-medium text-text">Total ligne</span>
          <div className="flex h-tap items-center justify-end rounded-input border border-border bg-surface-2 px-3">
            {estInclusDansKit ? (
              <Badge tone="blue">Inclus</Badge>
            ) : (
              <span className="font-mono text-body text-text">{formatMontant(totalLigne)}</span>
            )}
          </div>
        </div>
      </div>

      {depasseStock && (
        <InlineAlert tone="amber">
          Quantité ({ligne.quantite} {ligne.unite}) supérieure au stock disponible (
          {ligne.stock_disponible} {ligne.unite}). Vous pouvez valider la facture. Le stock
          sera contrôlé et retiré lors de la création du bon de livraison.
        </InlineAlert>
      )}
      {erreurServeur && <InlineAlert tone="red">{erreurServeur}</InlineAlert>}
    </div>
  );
}

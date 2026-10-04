"use client";

import { formatMontant } from "@/lib/format";
import { NumberInput } from "@/components/ui/NumberInput";

/**
 * Récapitulatif live des totaux — recalcul visuel instantané pendant la
 * saisie, avant toute confirmation serveur (le total réel fait foi côté
 * base, colonne générée `total_general` — ce composant en est le miroir).
 */
export function RecapTotaux({
  totalHT,
  remise,
  onRemiseChange,
  forfaitTransport,
  onForfaitTransportChange,
  tvaActive,
  onTvaActiveChange,
  tvaTaux,
  montantTva,
  totalGeneral,
}: {
  totalHT: number;
  remise: number;
  onRemiseChange: (v: number) => void;
  forfaitTransport: number;
  onForfaitTransportChange: (v: number) => void;
  tvaActive: boolean;
  onTvaActiveChange: (v: boolean) => void;
  tvaTaux: number;
  montantTva: number;
  totalGeneral: number;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-card border border-border bg-surface-2 p-4">
      <h3 className="text-h3 text-text">Récapitulatif</h3>

      <div className="flex items-center justify-between text-body">
        <span className="text-muted">Total HT</span>
        <span className="font-mono text-text">{formatMontant(totalHT)}</span>
      </div>

      {remise > 0 && <p className="flex justify-between gap-3 text-body"><span>Remise</span><span>{formatMontant(remise)}</span></p>}
      {forfaitTransport > 0 && <p className="flex justify-between gap-3 text-body"><span>Transport</span><span>{formatMontant(forfaitTransport)}</span></p>}
      <details className="rounded-input border border-border p-3">
        <summary className="focus-ring min-h-11 cursor-pointer py-2 text-body font-medium text-text">Modifier la remise ou le transport</summary>
      <div className="mt-3 flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <span className="text-body text-muted">Remise</span>
        <NumberInput
          value={remise}
          onChange={onRemiseChange}
          step={500}
          min={0}
          className="sm:w-40"
          aria-label="Remise"
        />
      </div>

      <div className="mt-3 flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <span className="text-body text-muted">Forfait transport</span>
        <NumberInput
          value={forfaitTransport}
          onChange={onForfaitTransportChange}
          step={500}
          min={0}
          className="sm:w-40"
          aria-label="Forfait transport"
        />
      </div>
      </details>

      <label className="flex items-center justify-between gap-3">
        <span className="text-body text-muted">
          TVA ({Math.round(tvaTaux * 100)}%)
        </span>
        <span className="flex items-center gap-2">
          {tvaActive && <span className="font-mono text-body text-text">{formatMontant(montantTva)}</span>}
          <input
            type="checkbox"
            checked={tvaActive}
            onChange={(e) => onTvaActiveChange(e.target.checked)}
            className="focus-ring tap-target h-5 w-5 rounded-input border-border accent-green"
            aria-label="Activer la TVA"
          />
        </span>
      </label>

      <div className="mt-2 flex items-center justify-between border-t border-border pt-3">
        <span className="text-h3 text-text">Total général</span>
        <span className="font-mono text-h2 font-bold text-text">{formatMontant(totalGeneral)}</span>
      </div>
    </div>
  );
}

"use client";

import { cn } from "@/lib/cn";

interface NumberInputProps {
  value: number;
  onChange: (value: number) => void;
  label?: string;
  error?: string;
  min?: number;
  /** Plafond optionnel (ex : quantité de ligne facture bloquée à 0 quand le
   *  stock disponible est épuisé) — non défini par défaut, comportement
   *  identique à avant l'ajout de cette prop. */
  max?: number;
  step?: number;
  id?: string;
  className?: string;
  "aria-label"?: string;
}

/**
 * Input montant/quantité — docs/design-system.md §6.2 : police monospace,
 * aligné à droite, clavier numérique forcé sur mobile (inputMode="decimal"),
 * pas de flèches natives, stepper +/- dédié pour éviter les erreurs de
 * scroll accidentel en usage terrain.
 */
export function NumberInput({
  value,
  onChange,
  label,
  error,
  min = 0,
  max,
  step = 1,
  id,
  className,
  ...aria
}: NumberInputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");

  function clamp(candidate: number) {
    let next = Math.max(min, candidate);
    if (max !== undefined) next = Math.min(max, next);
    return next;
  }

  function handleStep(delta: number) {
    const next = clamp(Math.round((value + delta) * 100) / 100);
    onChange(next);
  }

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <label htmlFor={inputId} className="text-body font-medium text-text">
          {label}
        </label>
      )}
      <div
        className={cn(
          "flex h-tap items-stretch overflow-hidden rounded-input border bg-surface",
          error ? "border-red" : "border-border"
        )}
      >
        <button
          type="button"
          onClick={() => handleStep(-step)}
          className="focus-ring tap-target flex w-11 shrink-0 items-center justify-center text-h3 text-muted hover:bg-surface-2"
          aria-label="Diminuer"
        >
          −
        </button>
        <input
          id={inputId}
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => {
            const raw = e.target.value.replace(",", ".");
            const parsed = raw === "" ? 0 : Number(raw);
            if (!Number.isNaN(parsed)) onChange(clamp(parsed));
          }}
          className="focus-ring w-full min-w-0 border-0 bg-transparent px-2 text-right font-mono text-body text-text outline-none"
          aria-invalid={!!error}
          {...aria}
        />
        <button
          type="button"
          onClick={() => handleStep(step)}
          className="focus-ring tap-target flex w-11 shrink-0 items-center justify-center text-h3 text-muted hover:bg-surface-2"
          aria-label="Augmenter"
        >
          +
        </button>
      </div>
      {error && <p className="text-body-sm text-red-text">{error}</p>}
    </div>
  );
}

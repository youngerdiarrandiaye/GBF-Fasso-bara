"use client";

import { cn } from "@/lib/cn";

/**
 * Bascule segmentée — docs/design-system.md §6.17. Espace Admin uniquement,
 * réservée aux widgets de dashboard (bascule de période/vue) — ne remplace
 * pas les `<select>` (§6.2) ni les `Tabs` de fiche détail (§6.10).
 *
 * `rounded-input` partout (jamais `rounded-full`, voir D-08 §10) malgré la
 * forme pilule de la référence visuelle.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  disabled = false,
  className,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div
      role="group"
      className={cn(
        "inline-flex min-w-0 max-w-full flex-wrap gap-0.5 rounded-pill bg-surface-2 p-1",
        disabled && "pointer-events-none opacity-40",
        className
      )}
    >
      {options.map((option) => {
        const actif = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={actif}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              "focus-ring min-h-11 min-w-0 break-words rounded-pill px-3 py-2 text-body-sm transition-colors duration-btn ease-standard sm:px-4",
              // « Comptoir » (D-25) : pastille blanche surélevée sur la piste
              // surface-2, comme le sélecteur de période de la maquette.
              actif ? "bg-surface font-semibold text-text shadow-sm" : "font-medium text-muted hover:text-text"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

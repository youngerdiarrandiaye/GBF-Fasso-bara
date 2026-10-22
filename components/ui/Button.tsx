"use client";

import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "destructive" | "navy";
export type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  // Vert foncé : contraste AA du texte blanc (#16A34A ne l'atteint pas) — D-25.
  primary: "bg-accent text-accent-on border border-accent hover:brightness-90",
  secondary: "bg-surface-2 text-text border border-border hover:bg-border/60",
  outline: "bg-transparent text-text border border-border hover:bg-surface-2",
  ghost: "bg-transparent text-text border border-transparent hover:bg-surface-2",
  destructive: "bg-red text-white border border-red hover:brightness-95",
  // Réservé aux actions d'outillage du dashboard Admin (filtrer, changer de
  // vue/période) — jamais une action métier (docs/design-system.md D-12, §10) :
  // le vert reste l'unique signal "action principale" de l'application.
  // Fond `--color-green-dk` (au lieu de `navy` plein) depuis le retour au
  // thème sombre "neon green" : `navy` sur le nouveau fond sombre est
  // quasi invisible (contraste non-texte ≈ 1.2:1), voir docs §3.7/§6.1 D-18.
  // `navy` reste inchangé uniquement dans la sidebar (carte CTA "Besoin
  // d'aide ?", D-15) — jamais réutilisé ici.
  navy: "bg-accent text-accent-on border border-accent hover:brightness-110",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "min-h-11 px-3 py-2 text-body-sm sm:min-h-9",
  md: "min-h-tap px-4 py-2 text-body",
  lg: "min-h-[52px] px-6 py-2 text-body font-semibold",
};

/**
 * Bouton — docs/design-system.md §6.1. Micro-interactions règles absolues :
 * hover scale(1.02) 150ms, active scale(0.98) instantané, focus ring vert,
 * disabled opacité 40%, loading = spinner inline + libellé conservé (aria-live).
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", loading = false, fullWidth = false, disabled, children, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "focus-ring inline-flex min-w-0 max-w-full items-center justify-center gap-2 rounded-input font-medium",
        "transition-transform duration-btn ease-standard",
        "hover:scale-[1.02] active:scale-[0.98] active:transition-none",
        "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100",
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        fullWidth && "w-full",
        className
      )}
      aria-busy={loading}
      {...props}
    >
      {loading && (
        <svg
          className="h-4 w-4 shrink-0 animate-spin"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
          />
        </svg>
      )}
      <span className="min-w-0 break-words" aria-live="polite">{children}</span>
    </button>
  );
});

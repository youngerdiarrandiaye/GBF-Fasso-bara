"use client";

import { useState } from "react";
import Link from "next/link";

export interface CardMenuItem {
  label: string;
  href?: string;
  onClick?: () => void;
}

/**
 * Menu contextuel "…" en coin de carte — docs/design-system.md §6.19.
 * Espace Admin uniquement (desktop) — jamais côté Agent (principe "saisie
 * rapide" §2). 32×32px (déroge volontairement à --tap-target-min, contexte
 * desktop uniquement), `rounded-input` (dropdown léger, pas `rounded-modal`).
 */
export function CardMenu({ items }: { items: CardMenuItem[] }) {
  const [ouvert, setOuvert] = useState(false);

  if (items.length === 0) return null;

  return (
    <div className="absolute right-3 top-3">
      <button
        type="button"
        onClick={() => setOuvert((v) => !v)}
        className="focus-ring flex h-8 w-8 items-center justify-center rounded-input text-h3 leading-none text-muted hover:bg-surface-2 hover:text-text"
        aria-haspopup="menu"
        aria-expanded={ouvert}
        aria-label="Plus d'actions"
      >
        ⋮
      </button>
      {ouvert && (
        <div
          role="menu"
          className="absolute right-0 z-dropdown mt-1 w-48 rounded-input border border-border bg-surface p-1 shadow-md"
        >
          {items.map((item) =>
            item.href ? (
              <Link
                key={item.label}
                href={item.href}
                onClick={() => setOuvert(false)}
                className="focus-ring block rounded-input px-3 py-2 text-body-sm text-text hover:bg-surface-2"
              >
                {item.label}
              </Link>
            ) : (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  item.onClick?.();
                  setOuvert(false);
                }}
                className="focus-ring block w-full rounded-input px-3 py-2 text-left text-body-sm text-text hover:bg-surface-2"
              >
                {item.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

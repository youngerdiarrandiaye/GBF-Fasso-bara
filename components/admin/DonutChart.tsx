"use client";

import { useMemo } from "react";
import { formatQuantite } from "@/lib/format";

export interface PointCategorieProduit {
  categorie: string;
  quantite: number;
}

export function DonutChart({ data }: { data: PointCategorieProduit[] }) {
  const trie = useMemo(() => [...data].sort((a, b) => b.quantite - a.quantite), [data]);
  const total = trie.reduce((sum, p) => sum + p.quantite, 0);
  const topCategories = trie.slice(0, 5);
  const autres = Math.max(0, trie.length - topCategories.length);

  if (topCategories.length === 0 || total === 0) {
    return (
      <div className="flex min-h-32 flex-col justify-center rounded-input border border-dashed border-border bg-surface-2/50 p-4 text-center">
        <p className="text-body font-medium text-text">Aucune vente ce mois-ci</p>
        <p className="mt-1 text-body-sm text-muted">Les categories vendues apparaitront ici.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="rounded-input border border-border bg-surface-2/60 p-4">
        <p className="text-caption font-semibold uppercase tracking-[0.14em] text-muted">Total vendu</p>
        <p className="mt-1 font-mono text-[2rem] font-semibold leading-none text-text">{formatQuantite(total)}</p>
        <p className="mt-1 text-body-sm text-muted">unites depuis le debut du mois</p>
      </div>

      <ul className="grid gap-3">
        {topCategories.map((entree, index) => {
          const ratio = total > 0 ? Math.max(4, Math.round((entree.quantite / total) * 100)) : 0;
          return (
            <li key={entree.categorie} className="grid gap-1.5">
              <div className="flex items-center justify-between gap-3">
                <p className="min-w-0 truncate text-body font-medium text-text">
                  <span className="mr-2 font-mono text-caption text-muted">{String(index + 1).padStart(2, "0")}</span>
                  {entree.categorie}
                </p>
                <p className="shrink-0 font-mono text-body-sm text-muted">{formatQuantite(entree.quantite)}</p>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full bg-green" style={{ width: `${ratio}%` }} />
              </div>
            </li>
          );
        })}
      </ul>

      {autres > 0 && <p className="text-body-sm text-muted">+{autres} autres categories suivies ce mois-ci</p>}
    </div>
  );
}

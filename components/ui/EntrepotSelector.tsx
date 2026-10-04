"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faWarehouse } from "@fortawesome/free-solid-svg-icons";
import { cn } from "@/lib/cn";
import { formatQuantite } from "@/lib/format";
import { InlineAlert } from "@/components/ui/InlineAlert";

export interface EntrepotSelectorOption {
  id: string;
  nom: string;
  actif: boolean;
}

/**
 * Sélecteur d'entrepôt — docs/design-system.md §5.8/§6.26 (règle métier 16).
 * Contrainte non négociable transmise par le designer : **jamais un
 * `<select>` refermé, jamais de valeur par défaut invisible** — l'entrepôt
 * actif reste repérable en permanence pendant toute la saisie (risque métier :
 * décrémenter le stock du mauvais entrepôt). Utilisé côté Agent (formulaire
 * Nouvelle facture / Nouveau bon de livraison, un seul sélecteur) et côté
 * Admin (formulaire de transfert, deux sélecteurs avec exclusion croisée via
 * `excludedId`).
 *
 * Substitution documentée : le spec design mentionne une icône
 * `Warehouse`/`Building2` (lucide-react), mais ce projet utilise
 * exclusivement FontAwesome (`@fortawesome/react-fontawesome`) partout
 * ailleurs (Sidebar, ProductTabs, etc.) — icône `faWarehouse` retenue pour
 * rester cohérent avec le reste du code, jamais de dépendance lucide-react
 * ajoutée pour ce seul composant.
 */
export function EntrepotSelector({
  label,
  entrepots,
  value,
  onChange,
  excludedId = null,
  stockHints,
  unite,
  disabled = false,
}: {
  label: string;
  entrepots: EntrepotSelectorOption[];
  value: string | null;
  onChange: (id: string) => void;
  /** Entrepôt à griser (exclusion croisée source/destination, formulaire de transfert, §6.26). */
  excludedId?: string | null;
  /** Indice de stock optionnel par entrepôt, quand un produit unique est déjà déterminé (`stockHint`, §6.26). */
  stockHints?: Record<string, number>;
  unite?: string;
  disabled?: boolean;
}) {
  const actifs = entrepots.filter((e) => e.actif);

  if (actifs.length === 0) {
    return (
      <div className="flex flex-col gap-1.5">
        <p className="text-body font-medium text-text">{label}</p>
        <InlineAlert tone="red">Aucun entrepôt configuré — contactez un administrateur.</InlineAlert>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-body font-medium text-text">{label}</p>
      <div className="flex flex-wrap gap-2">
        {actifs.map((entrepot) => {
          const selectionne = value === entrepot.id;
          const exclu = excludedId === entrepot.id;
          const hint = stockHints?.[entrepot.id];
          return (
            <button
              key={entrepot.id}
              type="button"
              disabled={disabled || exclu}
              onClick={() => onChange(entrepot.id)}
              aria-pressed={selectionne}
              className={cn(
                "focus-ring flex min-h-[40px] items-center gap-2 rounded-input border px-4 py-3 text-body transition-transform duration-btn ease-standard",
                selectionne
                  ? "border-green bg-green font-semibold text-white"
                  : exclu
                    ? "cursor-not-allowed border-border bg-surface opacity-40"
                    : "border-border bg-surface text-text hover:scale-[1.02] hover:border-green/60"
              )}
            >
              <FontAwesomeIcon
                icon={faWarehouse}
                className={cn("h-4 w-4 shrink-0", selectionne ? "text-white" : "text-muted")}
                aria-hidden="true"
              />
              <span className="flex flex-col items-start leading-tight">
                <span>{entrepot.nom}</span>
                {hint !== undefined && (
                  <span className={cn("font-mono text-caption", selectionne ? "text-white/80" : "text-muted")}>
                    {formatQuantite(hint, unite)} en stock
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
      {!value && <InlineAlert tone="amber">Sélectionnez un entrepôt avant de continuer.</InlineAlert>}
    </div>
  );
}

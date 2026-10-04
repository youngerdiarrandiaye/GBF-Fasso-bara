"use client";

export interface ProduitSimpleOption {
  id: string;
  code: string;
  nom: string;
  unite: string;
}

/**
 * Sélection produit simple (native `<select>`) — utilisé pour les
 * formulaires Admin où le catalogue reste de taille gérable et où le prix
 * n'entre pas en jeu (transfert de stock, ligne de bon de livraison), à la
 * différence de `ProduitAutocomplete` (Espace Agent, formulaire facture) que
 * ce composant ne réutilise volontairement pas — éviter tout couplage avec
 * components/agent/, propriété de dev-frontend-agent.
 */
export function ProduitSimpleSelect({
  id,
  label,
  produits,
  value,
  onChange,
  disabled = false,
}: {
  id: string;
  label: string;
  produits: ProduitSimpleOption[];
  value: string;
  onChange: (produitId: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-body font-medium text-text">
        {label}
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="focus-ring h-tap w-full rounded-input border border-border bg-surface px-3 text-body text-text disabled:bg-surface-2 disabled:text-muted"
      >
        <option value="">Sélectionnez un produit...</option>
        {produits.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nom} ({p.code})
          </option>
        ))}
      </select>
    </div>
  );
}

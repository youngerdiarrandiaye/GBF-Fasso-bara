import type { StatutBonLivraison } from "@/lib/supabase/database.types";
import { cn } from "@/lib/cn";

const STATUT_CONFIG: Record<StatutBonLivraison, { label: string; pastel: string; dot: string }> = {
  livre_non_paye: { label: "Livré, non payé", pastel: "badge-pastel-amber", dot: "bg-amber" },
  livre_paye: { label: "Livré, payé", pastel: "badge-pastel-green", dot: "bg-green" },
};

/**
 * Badge de statut de bon de livraison — docs/design-system.md §5.7/§6.25 :
 * mirroir structurel exact de StatusBadge. Tout BL naît à `livre_non_paye`
 * (pas de brouillon, règle 15) — symétrie volontaire avec CreditStatusBadge
 * (ambre = "somme due, suivie activement", vert = "réglé").
 */
export function BonLivraisonStatusBadge({
  statut,
  className,
}: {
  statut: StatutBonLivraison;
  className?: string;
}) {
  const config = STATUT_CONFIG[statut];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-pill px-3 py-1.5 text-body font-medium",
        config.pastel,
        className
      )}
    >
      <span className={cn("h-2 w-2 rounded-full", config.dot)} aria-hidden="true" />
      {config.label}
    </span>
  );
}

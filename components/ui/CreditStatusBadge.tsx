import type { StatutCredit } from "@/lib/supabase/database.types";
import { cn } from "@/lib/cn";

const STATUT_CONFIG: Record<StatutCredit, { label: string; pastel: string; dot: string }> = {
  en_cours: { label: "En cours", pastel: "badge-pastel-amber", dot: "bg-amber" },
  solde: { label: "Soldé", pastel: "badge-pastel-green", dot: "bg-green" },
};

/**
 * Badge de statut de crédit client — docs/design-system.md §5.6/§6.25 :
 * mirroir structurel exact de StatusBadge (rounded-pill, point 8px + libellé
 * + fond pastel). Décision D-21 (design system) : jamais rouge, y compris un
 * crédit ancien non remboursé — le rouge reste réservé aux états bloquants.
 */
export function CreditStatusBadge({ statut, className }: { statut: StatutCredit; className?: string }) {
  const config = STATUT_CONFIG[statut];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-pill px-3 py-1.5 text-body-sm font-medium",
        config.pastel,
        className
      )}
    >
      <span className={cn("h-2 w-2 rounded-full", config.dot)} aria-hidden="true" />
      {config.label}
    </span>
  );
}

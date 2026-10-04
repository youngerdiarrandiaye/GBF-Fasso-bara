import type { StatutFacture } from "@/lib/supabase/database.types";
import { cn } from "@/lib/cn";

const STATUT_CONFIG: Record<StatutFacture, { label: string; pastel: string; dot: string }> = {
  brouillon: { label: "Brouillon", pastel: "badge-pastel-neutral", dot: "bg-muted" },
  proforma: { label: "Proforma", pastel: "badge-pastel-amber", dot: "bg-amber" },
  validee: { label: "Validée", pastel: "badge-pastel-blue", dot: "bg-blue" },
  payee_partielle: { label: "Payée partielle", pastel: "badge-pastel-purple", dot: "bg-purple" },
  payee: { label: "Payée", pastel: "badge-pastel-green", dot: "bg-green" },
  annulee: { label: "Annulée", pastel: "badge-pastel-red", dot: "bg-red" },
};

/**
 * Badge de statut de facture — docs/design-system.md §5.1 : rounded-full
 * obligatoire, point coloré + libellé + fond pastel (règle absolue §7).
 */
export function StatusBadge({ statut, className }: { statut: StatutFacture; className?: string }) {
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

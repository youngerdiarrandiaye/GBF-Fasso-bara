import type { StatutTransfertStock } from "@/lib/supabase/database.types";
import { cn } from "@/lib/cn";

const STATUT_CONFIG: Record<StatutTransfertStock, { label: string; pastel: string; dot: string }> = {
  demande: { label: "Demandé", pastel: "badge-pastel-amber", dot: "bg-amber" },
  en_transit: { label: "En transit", pastel: "badge-pastel-blue", dot: "bg-blue" },
  receptionne: { label: "Réceptionné", pastel: "badge-pastel-green", dot: "bg-green" },
  annule: { label: "Annulé", pastel: "badge-pastel-red", dot: "bg-red" },
};

/**
 * Badge de statut de transfert de stock — docs/design-system.md §5.10/§6.28 :
 * mirroir structurel exact de StatusBadge. `receptionne` est un état
 * terminal côté base (trigger `traiter_transfert_stock`, migration 0013) :
 * l'action "Annuler" doit être masquée/désactivée dès ce statut affiché (cf.
 * `TransfertActions`, écran Transferts de stock).
 */
export function TransfertStatusBadge({
  statut,
  className,
}: {
  statut: StatutTransfertStock;
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

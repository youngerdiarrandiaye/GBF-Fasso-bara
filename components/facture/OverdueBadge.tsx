import { cn } from "@/lib/cn";

/**
 * Badge "En retard (J+X)" — toujours affiché À CÔTÉ d'un `StatusBadge`
 * existant (jamais à sa place, cf. components/ui/StatusBadge.tsx qu'on ne
 * modifie pas). Réutilise exactement les mêmes classes pastel rouge que le
 * badge de statut "Annulée" (`badge-pastel-red` / `bg-red`), aucune nouvelle
 * couleur introduite (docs/design-system.md).
 *
 * Composant générique (pas de logique admin) : destiné à être partagé avec
 * l'Espace Agent.
 */
export function OverdueBadge({
  joursDeRetard,
  className,
}: {
  joursDeRetard: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-pill px-3 py-1.5 text-body-sm font-medium",
        "badge-pastel-red",
        className
      )}
    >
      <span className="h-2 w-2 rounded-full bg-red" aria-hidden="true" />
      En retard (J+{joursDeRetard})
    </span>
  );
}

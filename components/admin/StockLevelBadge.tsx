import { Badge } from "@/components/ui/Badge";

/**
 * Badge stock bas compact — docs/design-system.md §6.4 : rounded-badge-pill
 * ambre/rouge, point + libellé. Utilisé en liste (colonne dédiée), en
 * complément de la jauge compacte.
 */
export function StockLevelBadge({
  quantiteStock,
  seuilAlerte,
}: {
  quantiteStock: number;
  seuilAlerte: number;
}) {
  if (quantiteStock <= 0) {
    return (
      <span className="badge-pastel-red inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-caption font-medium">
        <span className="h-1.5 w-1.5 rounded-full bg-red" aria-hidden="true" />
        Rupture
      </span>
    );
  }
  if (quantiteStock <= seuilAlerte) {
    return (
      <span className="badge-pastel-red inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-caption font-medium">
        <span className="h-1.5 w-1.5 rounded-full bg-red" aria-hidden="true" />
        Stock bas
      </span>
    );
  }
  if (quantiteStock <= seuilAlerte * 1.5) {
    return (
      <span className="badge-pastel-amber inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-caption font-medium">
        <span className="h-1.5 w-1.5 rounded-full bg-amber" aria-hidden="true" />
        Proche du seuil
      </span>
    );
  }
  return (
    <span className="badge-pastel-green inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-caption font-medium">
      <span className="h-1.5 w-1.5 rounded-full bg-green" aria-hidden="true" />
      Sain
    </span>
  );
}

export function KitBadge({ children }: { children: React.ReactNode }) {
  return <Badge tone="blue">{children}</Badge>;
}

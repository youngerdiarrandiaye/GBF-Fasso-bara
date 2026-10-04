import { NavigationLink as Link } from "@/components/ui/NavigationLink";
import { cn } from "@/lib/cn";

/**
 * Pagination générique basée sur l'URL (liens `<Link>`, pas d'état client) —
 * réutilisable par toute liste Admin paginée. Le tri des query params reste
 * à la charge de l'appelant via `buildHref`, pour préserver les filtres
 * actifs (numéro, statut, client...) lors d'un changement de page.
 */
export function Pagination({
  page,
  totalPages,
  totalCount,
  pageSize,
  buildHref,
  itemLabel = "facture",
}: {
  page: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  buildHref: (page: number) => string;
  /** Libellé de l'élément paginé (singulier), pour un texte adapté à
   * chaque écran-liste ("produit", "client", "utilisateur"...). Par défaut
   * "facture", pour préserver le comportement historique de cet écran. */
  itemLabel?: string;
}) {
  if (totalCount === 0) return null;

  const debut = (page - 1) * pageSize + 1;
  const fin = Math.min(page * pageSize, totalCount);

  return (
    <div className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-body-sm text-muted">
        {debut}–{fin} sur {totalCount} {itemLabel}
        {totalCount > 1 ? "s" : ""}
      </p>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <Link
          href={buildHref(page - 1)}
          aria-disabled={page <= 1}
          tabIndex={page <= 1 ? -1 : undefined}
          className={cn(
            "focus-ring rounded-input border border-border px-3 py-2 text-center text-body-sm text-text hover:bg-surface-2",
            page <= 1 && "pointer-events-none opacity-40"
          )}
        >
          ← Précédent
        </Link>
        <span className="text-body-sm text-muted">
          Page {page} / {totalPages}
        </span>
        <Link
          href={buildHref(page + 1)}
          aria-disabled={page >= totalPages}
          tabIndex={page >= totalPages ? -1 : undefined}
          className={cn(
            "focus-ring rounded-input border border-border px-3 py-2 text-center text-body-sm text-text hover:bg-surface-2",
            page >= totalPages && "pointer-events-none opacity-40"
          )}
        >
          Suivant →
        </Link>
      </div>
    </div>
  );
}

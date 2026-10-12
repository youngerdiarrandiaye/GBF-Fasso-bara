import Link from "next/link";

/**
 * Breadcrumbs — docs/design-system.md §6.10 : text-body-sm muted, séparateur
 * `/`, dernier élément en text-text. Usage : fiches détail (produit, client,
 * facture).
 */
export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Fil d'ariane" className="flex min-w-0 flex-wrap items-center gap-1.5 text-body-sm text-muted">
      {items.map((item, index) => (
        <span key={index} className="flex min-w-0 max-w-full items-start gap-1.5">
          {index > 0 && <span className="shrink-0" aria-hidden="true">/</span>}
          {item.href ? (
            <Link href={item.href} className="focus-ring min-w-0 break-words rounded-input hover:text-text">
              {item.label}
            </Link>
          ) : (
            <span className="min-w-0 break-words text-text" aria-current="page">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

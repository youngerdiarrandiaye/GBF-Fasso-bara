import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { cn } from "@/lib/cn";

/**
 * État vide d'une liste : icône douce, titre, explication facultative et
 * action (créer le premier élément, ou effacer les filtres). Remplace les
 * simples phrases « Aucun… » isolées. Tokens uniquement (§2.1) ; texte en
 * text-body (16px) pour rester lisible côté Agent (§8).
 */
export function EmptyState({
  icone,
  titre,
  description,
  action,
  ton = "neutre",
  className,
}: {
  icone: IconDefinition;
  titre: string;
  description?: string;
  action?: { href: string; label: string; variante?: "primary" | "outline" };
  /** "succes" : état vide positif (ex. aucun retard de paiement). */
  ton?: "neutre" | "succes";
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-3 px-4 py-8 text-center", className)}>
      <span
        aria-hidden="true"
        className={cn(
          "flex h-12 w-12 items-center justify-center rounded-full",
          ton === "succes" ? "badge-pastel-green" : "bg-surface-2 text-muted"
        )}
      >
        <FontAwesomeIcon icon={icone} className="h-5 w-5" />
      </span>
      <p className="text-body font-medium text-text">{titre}</p>
      {description && <p className="max-w-sm text-body text-muted">{description}</p>}
      {action && (
        // Lien stylé comme Button (§6.1) plutôt qu'un <button> dans un <a>.
        <Link
          href={action.href}
          className={cn(
            "focus-ring mt-1 inline-flex h-tap items-center justify-center rounded-input border px-4 text-body font-medium",
            "transition-transform duration-btn ease-standard hover:scale-[1.02] active:scale-[0.98] active:transition-none",
            action.variante === "outline"
              ? "border-border bg-transparent text-text hover:bg-surface-2"
              : "border-green bg-green text-white hover:bg-green-dk"
          )}
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}

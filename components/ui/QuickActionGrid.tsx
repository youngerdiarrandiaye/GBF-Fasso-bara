import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { cn } from "@/lib/cn";

type QuickActionTone = "blue" | "green" | "amber" | "purple" | "red" | "neutral";

type QuickAction = {
  href: string;
  label: string;
  description?: string;
  icon: IconDefinition;
  tone?: QuickActionTone;
};

const TONE_CLASSES: Record<QuickActionTone, string> = {
  blue: "bg-blue/10 text-blue-text",
  green: "bg-green/10 text-green-text",
  amber: "bg-amber/10 text-amber-text",
  purple: "bg-purple/10 text-purple-text",
  red: "bg-red/10 text-red-text",
  neutral: "bg-surface-2 text-text",
};

/**
 * Raccourcis d'un écran-liste (D-28) : une rangée compacte de liens (icône
 * teintée, libellé, description courte à partir de sm), 44 px de haut, qui
 * défile horizontalement sur mobile. Remplace les grandes tuiles de 112 px
 * qui repoussaient le tableau sous la ligne de flottaison et répétaient la
 * navigation. `columns` est conservé pour compatibilité, sans effet.
 */
export function QuickActionGrid({
  actions,
  className,
}: {
  actions: QuickAction[];
  columns?: "auto" | 2 | 3 | 4 | 6;
  className?: string;
}) {
  return (
    <nav
      className={cn("-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0", className)}
      aria-label="Raccourcis"
    >
      {actions.map((action) => (
        <Link
          key={`${action.href}-${action.label}`}
          href={action.href}
          className="focus-ring inline-flex h-tap shrink-0 items-center gap-2.5 rounded-input border border-border bg-surface pl-1.5 pr-3.5 text-body transition-colors hover:bg-surface-2"
        >
          <span
            className={cn("inline-flex h-8 w-8 items-center justify-center rounded-[8px]", TONE_CLASSES[action.tone ?? "neutral"])}
            aria-hidden="true"
          >
            <FontAwesomeIcon icon={action.icon} className="h-3.5 w-3.5" />
          </span>
          <span className="font-semibold text-text">{action.label}</span>
          {action.description && (
            <span className="hidden text-body-sm text-muted sm:inline">{action.description}</span>
          )}
        </Link>
      ))}
    </nav>
  );
}

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

export function QuickActionGrid({
  actions,
  columns = "auto",
  className,
}: {
  actions: QuickAction[];
  columns?: "auto" | 2 | 3 | 4 | 6;
  className?: string;
}) {
  const gridClass =
    columns === "auto"
      ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6"
      : columns === 2
        ? "grid-cols-2"
        : columns === 3
          ? "grid-cols-2 sm:grid-cols-3"
          : columns === 4
            ? "grid-cols-2 sm:grid-cols-4"
            : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6";

  return (
    <nav className={cn("grid gap-3", gridClass, className)} aria-label="Actions rapides">
      {actions.map((action) => (
        <Link
          key={`${action.href}-${action.label}`}
          href={action.href}
          className="focus-ring group flex min-h-[112px] flex-col items-center justify-center rounded-card border border-border bg-surface p-3 text-center shadow-sm transition duration-card hover:-translate-y-0.5 hover:bg-surface-2"
        >
          <span
            className={cn(
              "mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full",
              TONE_CLASSES[action.tone ?? "neutral"]
            )}
            aria-hidden="true"
          >
            <FontAwesomeIcon icon={action.icon} className="h-5 w-5" />
          </span>
          <span className="text-body font-semibold leading-tight text-text">{action.label}</span>
          {action.description && (
            <span className="mt-1 line-clamp-2 text-body-sm leading-snug text-muted">{action.description}</span>
          )}
        </Link>
      ))}
    </nav>
  );
}

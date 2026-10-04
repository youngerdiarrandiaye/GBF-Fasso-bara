import { cn } from "@/lib/cn";

type BadgeTone = "green" | "amber" | "red" | "blue" | "purple" | "neutral";

/**
 * Badge générique (kit / rôle / catégorie / type client) — docs/design-system.md
 * §6.4 : rounded-lg (pas pill), pas de point obligatoire, fond pastel si état
 * à surveiller, `surface-2` neutre si purement descriptif (D-05).
 */
export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-badge px-2.5 py-1 text-body-sm font-medium",
        `badge-pastel-${tone}`,
        className
      )}
    >
      {children}
    </span>
  );
}

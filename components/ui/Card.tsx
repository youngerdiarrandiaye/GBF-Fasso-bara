import { cn } from "@/lib/cn";

/** Carte — docs/design-system.md §6.3 : rounded-xl, fond surface, shadow-sm. */
export function Card({
  children,
  className,
  interactive = false,
}: {
  children: React.ReactNode;
  className?: string;
  interactive?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-card border border-border bg-surface p-4",
        interactive &&
          "transition-colors duration-card ease-card hover:border-[color-mix(in_srgb,var(--color-green)_35%,var(--color-border))] hover:bg-surface-2",
        className
      )}
    >
      {children}
    </div>
  );
}

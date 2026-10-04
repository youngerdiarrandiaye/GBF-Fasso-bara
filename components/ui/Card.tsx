import { cn } from "@/lib/cn";

/**
 * Carte — docs/design-system.md §6.3 : rounded-xl, fond surface, shadow-sm.
 * Interactive : translateY(-2px) + shadow-card-hover, 200ms ease-out (règle
 * absolue §7), désactivé si l'utilisateur a demandé moins d'animations.
 */
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
        "rounded-card border border-border bg-surface p-4 shadow-sm",
        interactive &&
          "transition-[transform,box-shadow,background-color,border-color] duration-card ease-out hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,var(--color-green)_35%,var(--color-border))] hover:bg-surface-2 hover:shadow-card-hover motion-reduce:transition-none motion-reduce:hover:translate-y-0",
        className
      )}
    >
      {children}
    </div>
  );
}

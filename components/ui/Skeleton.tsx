import { cn } from "@/lib/cn";

/**
 * Skeleton — docs/design-system.md §6.8. Jamais de spinner générique : chaque
 * skeleton reprend la forme exacte du contenu final. Shimmer via
 * `animate-shimmer` (tailwind.tokens.js).
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-shimmer rounded-input bg-[linear-gradient(90deg,var(--color-surface-2)_25%,var(--color-border)_50%,var(--color-surface-2)_75%)] bg-[length:400px_100%]",
        className
      )}
      aria-hidden="true"
    />
  );
}

import { cn } from "@/lib/cn";

type AlertTone = "amber" | "red" | "blue" | "green";

const BORDER: Record<AlertTone, string> = {
  amber: "border-l-amber",
  red: "border-l-red",
  blue: "border-l-blue",
  green: "border-l-green",
};

/**
 * Alerte inline (bannière) — docs/design-system.md §6.11 : rounded-lg,
 * bordure gauche 3px de la couleur sémantique, fond pastel, icône + texte.
 * Usage principal : stock insuffisant sur une ligne de facture en cours de
 * saisie.
 */
export function InlineAlert({
  tone,
  children,
  className,
}: {
  tone: AlertTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === "red" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 rounded-input border-l-[3px] px-3 py-2 text-body-sm",
        `badge-pastel-${tone}`,
        BORDER[tone],
        className
      )}
    >
      <span aria-hidden="true">{tone === "red" || tone === "amber" ? "▲" : "i"}</span>
      <div className="flex-1">{children}</div>
    </div>
  );
}

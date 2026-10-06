import { formatQuantite, libelleUnite } from "@/lib/format";
import { Badge } from "@/components/ui/Badge";

/**
 * Jauge de stock — docs/design-system.md §5.3/§6.5. Zone rouge sous le
 * seuil, ambre proche du seuil (D-02 : seuil < stock <= seuil*1.5), verte
 * au-dessus. Rupture (<= 0) : badge plein plutôt qu'une barre invisible.
 *
 * Implémentée en `<svg>` (rect de fond + rect de remplissage), comme exigé
 * par le cahier des charges ("barre SVG animée"), plutôt qu'en `<div>`/CSS :
 * le viewBox `0 0 100 hauteur` permet d'exprimer le remplissage et le repère
 * de seuil en pourcentage (`width`/`x` en `%`), résolus par le navigateur par
 * rapport à la largeur du viewBox (donc indépendants de la taille de rendu
 * réelle du SVG). L'animation d'apparition réutilise exactement la même
 * classe `animate-gauge-fill`/variable CSS `--gauge-value` que l'ancienne
 * version en `<div>` (design-system/tailwind.tokens.js) : les navigateurs
 * modernes animent la géométrie SVG (`width`) via CSS au même titre qu'une
 * propriété de boîte HTML.
 */
export function StockGauge({
  quantiteStock,
  seuilAlerte,
  unite,
  compact = false,
}: {
  quantiteStock: number;
  seuilAlerte: number;
  unite: string;
  compact?: boolean;
}) {
  if (quantiteStock <= 0) {
    return <span className="whitespace-nowrap"><Badge tone="red">Rupture de stock</Badge></span>;
  }

  const zone =
    quantiteStock <= seuilAlerte ? "red" : quantiteStock <= seuilAlerte * 1.5 ? "amber" : "green";

  const gaugeMax = Math.max(quantiteStock, seuilAlerte * 3, 10);
  const pourcentage = Math.min(100, (quantiteStock / gaugeMax) * 100);
  const pourcentageSeuil = Math.min(100, (seuilAlerte / gaugeMax) * 100);

  const fillClass = zone === "red" ? "fill-red" : zone === "amber" ? "fill-amber" : "fill-green";
  const hauteur = compact ? 6 : 10;

  return (
    <div className={compact ? "flex items-center gap-2" : "flex flex-col gap-1"}>
      <svg
        className="w-full overflow-hidden rounded-pill"
        style={{ height: hauteur }}
        viewBox={`0 0 100 ${hauteur}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Niveau de stock : ${formatQuantite(quantiteStock, libelleUnite(unite, quantiteStock))}`}
      >
        <rect x="0" y="0" width="100" height={hauteur} className="fill-surface-2" />
        <rect
          x="0"
          y="0"
          height={hauteur}
          className={`${fillClass} animate-gauge-fill`}
          style={{ width: `${pourcentage}%`, "--gauge-value": `${pourcentage}%` } as React.CSSProperties}
        />
        {!compact && (
          <rect x={`${pourcentageSeuil}%`} y="0" width="1" height={hauteur} className="fill-text/30" aria-hidden="true" />
        )}
      </svg>
      {/* Valeur chiffrée toujours visible, compact compris (docs §8 : jamais
          l'information portée par la seule couleur de la barre). */}
      <span className={compact ? "shrink-0 whitespace-nowrap font-mono text-body-sm text-text" : "text-right font-mono text-body-sm text-muted"}>
        {compact ? quantiteStock.toLocaleString("fr-FR") : formatQuantite(quantiteStock, libelleUnite(unite, quantiteStock))}
      </span>
    </div>
  );
}

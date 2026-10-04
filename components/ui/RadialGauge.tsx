import { cn } from "@/lib/cn";

const NB_BATONNETS = 30;
const TAILLES = {
  sm: { epaisseur: 3, taille: 160 },
  md: { epaisseur: 4, taille: 200 },
  lg: { epaisseur: 5, taille: 240 },
} as const;

const COULEUR_INACTIVE = "var(--color-border)";
const ACCENT_START = { r: 0x2d, g: 0xd4, b: 0xbf }; // --color-accent-start
const ACCENT_END = { r: 0x38, g: 0xbd, b: 0xf8 }; // --color-accent-end

function interpolerCouleur(t: number): string {
  const r = Math.round(ACCENT_START.r + (ACCENT_END.r - ACCENT_START.r) * t);
  const g = Math.round(ACCENT_START.g + (ACCENT_END.g - ACCENT_START.g) * t);
  const b = Math.round(ACCENT_START.b + (ACCENT_END.b - ACCENT_START.b) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Jauge radiale décorative — docs/design-system.md §6.18. Complémentaire à
 * `StockGauge` (jauge linéaire sémantique du stock, jamais remplacée par
 * celle-ci — voir D-10, §10). Réservée aux KPI dashboard Admin agrégés SANS
 * seuil d'alerte binaire (ex: "Nouveaux clients", "Taux de factures payées
 * à l'échéance") — ne jamais l'utiliser pour un niveau de stock.
 *
 * Demi-cercle de 28-32 bâtonnets (ici 30), dégradé --color-accent-start ->
 * --color-accent-end sur les bâtonnets actifs (proportion value/max, depuis
 * l'extrémité gauche), --color-border à 60% d'opacité pour les inactifs.
 */
export function RadialGauge({
  value,
  max,
  label,
  size = "md",
  className,
}: {
  value: number;
  max: number;
  label: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const { epaisseur, taille } = TAILLES[size];
  const proportion = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const nbActifs = Math.round(NB_BATONNETS * proportion);

  const cx = 100;
  const cy = 100;
  const rExterieur = 80;
  const longueur = rExterieur * 0.18;
  const rInterieur = rExterieur - longueur;

  const batonnets = Array.from({ length: NB_BATONNETS }, (_, i) => {
    const angleDeg = 180 - (i / (NB_BATONNETS - 1)) * 180;
    const angleRad = (angleDeg * Math.PI) / 180;
    const x1 = cx + rInterieur * Math.cos(angleRad);
    const y1 = cy - rInterieur * Math.sin(angleRad);
    const x2 = cx + rExterieur * Math.cos(angleRad);
    const y2 = cy - rExterieur * Math.sin(angleRad);
    const actif = i < nbActifs;
    const couleur = actif
      ? interpolerCouleur(NB_BATONNETS > 1 ? i / (NB_BATONNETS - 1) : 0)
      : COULEUR_INACTIVE;
    return { x1, y1, x2, y2, couleur, actif };
  });

  return (
    <div className={cn("relative", className)} style={{ width: taille, maxWidth: "100%" }}>
      <svg viewBox="0 0 200 112" className="w-full" aria-hidden="true">
        {batonnets.map((b, i) => (
          <line
            key={i}
            x1={b.x1}
            y1={b.y1}
            x2={b.x2}
            y2={b.y2}
            stroke={b.couleur}
            strokeWidth={epaisseur}
            strokeLinecap="round"
            opacity={b.actif ? 1 : 0.6}
          />
        ))}
      </svg>
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center pb-1 text-center">
        <p className="font-mono text-display-lg font-bold text-text">{value}</p>
        <p className="text-body-sm text-muted">{label}</p>
      </div>
    </div>
  );
}

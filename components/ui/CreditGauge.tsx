import Link from "next/link";
import { formatMontant } from "@/lib/format";
import { Badge } from "@/components/ui/Badge";

/**
 * Jauge "Crédit non recouvré vs seuil global" — docs/design-system.md
 * §5.9/§6.27. Reprend à l'identique la structure SVG de `StockGauge`
 * (components/ui/StockGauge.tsx), zones de risque INVERSÉES (D-23) : pour le
 * stock le risque est un niveau bas (rouge sous le seuil), pour le crédit le
 * risque est un encours trop haut (rouge au-dessus du seuil, règle métier 12
 * — aucun nouveau crédit ne peut être ouvert au-delà).
 *
 * Deux cas particuliers gérés en amont de la barre (jamais de jauge à 0/0 ni
 * de barre pleine/débordante) :
 * - `seuilCreditMax = 0` (défaut fail-safe, cf. migration 0013 §9) : crédit
 *   désactivé, badge neutre + lien vers Paramètres.
 * - `encoursCredit >= seuilCreditMax` : badge rouge plein, mirroir exact du
 *   traitement `StockGauge` en rupture.
 */
export function CreditGauge({
  encoursCredit,
  seuilCreditMax,
  compact = false,
  lienParametres,
}: {
  encoursCredit: number;
  seuilCreditMax: number;
  compact?: boolean;
  /** Affiché uniquement dans le cas "seuil désactivé" (docs §5.9). */
  lienParametres?: string;
}) {
  if (seuilCreditMax <= 0) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="neutral">Crédit désactivé — seuil non configuré</Badge>
        {lienParametres && (
          <Link href={lienParametres} className="focus-ring rounded-input text-body-sm text-text hover:underline">
            Configurer dans Paramètres →
          </Link>
        )}
      </div>
    );
  }

  if (encoursCredit >= seuilCreditMax) {
    return <Badge tone="red">Seuil de crédit atteint</Badge>;
  }

  // Zone ambre : décision D-23 (§5.9), inverse mathématique exact du
  // multiplicateur ×1.5 de StockGauge (1 / 1.5 = 0.667).
  const zone = encoursCredit >= seuilCreditMax * (2 / 3) ? "amber" : "green";

  const gaugeMax = Math.max(encoursCredit, seuilCreditMax) * 1.1;
  const pourcentage = Math.min(100, (encoursCredit / gaugeMax) * 100);
  const pourcentageSeuil = Math.min(100, (seuilCreditMax / gaugeMax) * 100);
  const pourcentageDuSeuil = Math.round((encoursCredit / seuilCreditMax) * 100);

  const fillClass = zone === "amber" ? "fill-amber" : "fill-green";
  const hauteur = compact ? 6 : 10;

  return (
    <div className={compact ? "flex items-center gap-2" : "flex flex-col gap-1"}>
      <svg
        className="w-full overflow-hidden rounded-pill"
        style={{ height: hauteur }}
        viewBox={`0 0 100 ${hauteur}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Encours de crédit : ${formatMontant(encoursCredit)} sur un seuil de ${formatMontant(seuilCreditMax)}`}
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
      {!compact && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-caption text-muted">{pourcentageDuSeuil}&nbsp;% du seuil</span>
          <span className="text-right font-mono text-body-sm text-muted">
            {formatMontant(encoursCredit)} / {formatMontant(seuilCreditMax)}
          </span>
        </div>
      )}
    </div>
  );
}

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { CreditGauge } from "@/components/ui/CreditGauge";
import { formatMontant } from "@/lib/format";

/**
 * Carte "Credit client" â€” Dashboard Admin (rÃ¨gle mÃ©tier 12). MÃªme
 * habillage `rounded-card-lg` que les `StatCard` voisines (docs
 * Â§3.6/Â§6.27 : "widget KPI du dashboard Admin, StatCard-like"), mais rendue
 * directement avec `Card`/`CreditGauge` plutÃ´t que `StatCard` : cette carte
 * affiche une jauge, pas une valeur animÃ©e par `useCountUp` â€” Ã©tendre
 * `StatCard` pour ce seul cas aurait mÃ©langÃ© deux logiques d'affichage trÃ¨s
 * diffÃ©rentes dans un composant partagÃ© par tout le reste de l'Admin.
 */
export function CreditGaugeCard({
  encoursCredit,
  seuilCreditMax,
}: {
  encoursCredit: number;
  seuilCreditMax: number;
}) {
  const ratio = seuilCreditMax > 0 ? encoursCredit / seuilCreditMax : 0;
  const signalClass = seuilCreditMax <= 0
    ? "bg-muted"
    : ratio >= 1
      ? "bg-red"
      : ratio >= 2 / 3
        ? "bg-amber"
        : "bg-green";
  const contexte = seuilCreditMax <= 0
    ? "Seuil de crÃ©dit non configurÃ©"
    : ratio >= 1
      ? "Plafond atteint â€” action requise"
      : `${Math.round(ratio * 100)} % du plafond autorisÃ©`;
  // Pas de `lienParametres` transmis Ã  `CreditGauge` ici : toute la carte est
  // dÃ©jÃ  un `<Link>` vers /admin/credits (cohÃ©rent avec les autres StatCard
  // du dashboard) â€” un second lien imbriquÃ© (vers ParamÃ¨tres, cas "seuil
  // dÃ©sactivÃ©") produirait un `<a>` dans un `<a>`, invalide en HTML. Le lien
  // contextuel vers ParamÃ¨tres reste disponible depuis l'Ã©cran CrÃ©dits lui-mÃªme.
  return (
    <Link href="/admin/credits" className="focus-ring group block h-full rounded-card-lg">
      <Card interactive className="flex h-full min-h-[132px] flex-col rounded-card-lg bg-[linear-gradient(180deg,color-mix(in_srgb,var(--color-surface)_94%,white_6%),var(--color-surface))] p-5 shadow-md">
        <div className="flex items-start gap-2">
          <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${signalClass}`} aria-hidden="true" />
          <p className="min-w-0 flex-1 text-[0.68rem] font-semibold uppercase leading-4 tracking-[0.16em] text-muted">Credit client</p>
          <span aria-hidden="true" className="text-body-sm text-muted transition-transform group-hover:translate-x-1">â†’</span>
        </div>
        <p className="mt-3 break-words font-mono text-[1.75rem] font-semibold leading-none tracking-[-0.04em] text-text sm:text-[2.05rem]">
          {formatMontant(encoursCredit)}
        </p>
        <div className="mt-auto pt-1.5">
          <CreditGauge encoursCredit={encoursCredit} seuilCreditMax={seuilCreditMax} compact />
        </div>
        <p className="mt-2 text-[0.72rem] leading-4 text-muted">{contexte}</p>
      </Card>
    </Link>
  );
}


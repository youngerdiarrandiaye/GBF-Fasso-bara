import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { CreditGauge } from "@/components/ui/CreditGauge";
import { formatMontant } from "@/lib/format";

/**
 * Carte "Credit client" — Dashboard Admin (règle métier 12). Même
 * habillage `rounded-card-lg` que les `StatCard` voisines (docs
 * §3.6/§6.27 : "widget KPI du dashboard Admin, StatCard-like"), mais rendue
 * directement avec `Card`/`CreditGauge` plutôt que `StatCard` : cette carte
 * affiche une jauge, pas une valeur animée par `useCountUp` — étendre
 * `StatCard` pour ce seul cas aurait mélangé deux logiques d'affichage très
 * différentes dans un composant partagé par tout le reste de l'Admin.
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
    ? "Seuil de crédit non configuré"
    : ratio >= 1
      ? "Plafond atteint — action requise"
      : `${Math.round(ratio * 100)} % du plafond autorisé`;
  // Pas de `lienParametres` transmis à `CreditGauge` ici : toute la carte est
  // déjà un `<Link>` vers /admin/credits (cohérent avec les autres StatCard
  // du dashboard) — un second lien imbriqué (vers Paramètres, cas "seuil
  // désactivé") produirait un `<a>` dans un `<a>`, invalide en HTML. Le lien
  // contextuel vers Paramètres reste disponible depuis l'écran Crédits lui-même.
  return (
    <Link href="/admin/credits" className="focus-ring group block h-full rounded-card-lg">
      <Card interactive className="flex h-full min-h-[132px] flex-col rounded-card-lg bg-[linear-gradient(180deg,color-mix(in_srgb,var(--color-surface)_94%,white_6%),var(--color-surface))] p-5 shadow-md">
        <div className="flex items-start gap-2">
          <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${signalClass}`} aria-hidden="true" />
          <p className="min-w-0 flex-1 text-[0.68rem] font-semibold uppercase leading-4 tracking-[0.16em] text-muted">Credit client</p>
          <span aria-hidden="true" className="text-body-sm text-muted transition-transform group-hover:translate-x-1">→</span>
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


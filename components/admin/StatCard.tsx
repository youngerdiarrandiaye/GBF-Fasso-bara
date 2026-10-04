"use client";

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import { formatMontant } from "@/lib/format";
import { useCountUp } from "@/lib/hooks/useCountUp";

/**
 * Stat card â€” docs/design-system.md Â§6.3 : rounded-xl, fond surface, valeur
 * en text-display monospace, libellÃ© text-body-sm muted au-dessus, variation
 * optionnelle (badge vert/rouge + flÃ¨che) sous la valeur.
 *
 * Si `href` est fourni, la carte entiÃ¨re devient un lien de navigation : elle
 * reprend l'Ã©tat hover/active dÃ©jÃ  dÃ©fini par `Card` (`interactive`) â€” mÃªme
 * traitement `translateY(-2px)` + `shadow-card-hover` que les autres cartes
 * cliquables du design system, sans style dupliquÃ©.
 *
 * `hero` (docs Â§3.8/D-17) : fond `--gradient-hero` (vert profond â†’ vert nÃ©on)
 * + texte blanc, rÃ©servÃ© Ã  LA stat principale d'un dashboard (une seule carte
 * "hÃ©ro" par Ã©cran) â€” jamais utilisÃ© pour signaler un Ã©tat/statut (ce rÃ´le
 * reste aux tons vert/ambre/rouge/bleu existants). Remplace l'ancien fond
 * plein `navy` (devenu quasi invisible sur le fond sombre "neon green", D-18).
 *
 * Compteur animÃ© (`numericValue`/`format`, docs Â§7) : si `numericValue`
 * est fourni, la carte anime 0 -> `numericValue` au montage via `useCountUp`
 * et affiche chaque valeur intermÃ©diaire formatÃ©e selon `format` (par
 * dÃ©faut `"entier"`). Sans `numericValue`, `value` est affichÃ©e telle quelle,
 * sans animation â€” comportement inchangÃ© pour les appelants existants qui ne
 * passent qu'une string dÃ©jÃ  formatÃ©e (ex. page Paiements).
 *
 * `format` est une chaÃ®ne (pas une fonction) car ce composant est un Client
 * Component : une fonction (ex. `formatMontant`) ne peut pas traverser la
 * frontiÃ¨re serveurâ†’client depuis la page serveur qui l'appelle (Next.js
 * rejette les props-fonctions non `"use server"`) â€” le composant rÃ©sout donc
 * lui-mÃªme le formateur Ã  partir d'un identifiant sÃ©rialisable.
 */
export function StatCard({
  label,
  value,
  tone = "neutral",
  hint,
  href,
  hero = false,
  numericValue,
  format = "entier",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "green" | "amber" | "red" | "blue";
  hint?: string;
  href?: string;
  hero?: boolean;
  /** Valeur numÃ©rique brute Ã  animer (0 -> numericValue) au montage. */
  numericValue?: number;
  /** Formatte la valeur courante pendant l'animation. */
  format?: "entier" | "montant";
}) {
  const valeurAnimee = useCountUp(numericValue ?? 0, 1200);
  const valeurAffichee =
    numericValue !== undefined
      ? format === "montant"
        ? formatMontant(valeurAnimee)
        : String(valeurAnimee)
      : value;

  const toneClass = hero ? "text-text"
    : tone === "green"
      ? "text-green-text"
      : tone === "amber"
        ? "text-amber-text"
        : tone === "red"
          ? "text-red-text"
          : tone === "blue"
            ? "text-blue-text"
            : "text-text";

  const signalClass = hero ? "bg-green"
    : tone === "green"
      ? "bg-green"
      : tone === "amber"
        ? "bg-amber"
        : tone === "red"
          ? "bg-red"
          : tone === "blue"
            ? "bg-blue"
            : "bg-muted";

  const content = (
    <div className="flex h-full min-h-[132px] flex-col justify-between gap-4">
      <div className="flex items-start gap-2">
        <span className={cn("mt-1 h-1.5 w-1.5 shrink-0 rounded-full", signalClass)} aria-hidden="true" />
        <p className={cn("min-w-0 flex-1 text-[0.68rem] font-semibold uppercase leading-4 tracking-[0.16em]", hero ? "text-green-text" : "text-muted")}>{label}</p>
        {href && <span aria-hidden="true" className={cn("text-body-sm transition-transform group-hover:translate-x-1", hero ? "text-muted" : "text-muted")}>â†’</span>}
      </div>
      <p className={cn("break-words font-mono text-[1.75rem] font-semibold leading-none tracking-[-0.04em] sm:text-[2.05rem]", toneClass)}>{valeurAffichee}</p>
      {hint && <p className={cn("text-[0.72rem] leading-4", hero ? "text-muted" : "text-muted")}>{hint}</p>}
    </div>
  );

  // Rayon Ã©largi (Â§3.6/D-11) : StatCard fait partie de la rangÃ©e "vedette" du
  // dashboard (rÃ©sumÃ© faÃ§on "Sales Overview"), qu'elle soit hÃ©ro ou non.
  // `!border-transparent` : `Card` fixe dÃ©jÃ  `border-border` dans ses classes
  // de base, et `cn()` (lib/cn.ts) est une simple concatÃ©nation SANS
  // dÃ©duplication (choix assumÃ© du projet) â€” sans le prÃ©fixe `!` les deux
  // classes de bordure coexistent dans le DOM et laquelle "gagne" dÃ©pend de
  // l'ordre de gÃ©nÃ©ration Tailwind, pas de l'ordre dans `className`. MÃªme
  // convention dÃ©jÃ  utilisÃ©e ailleurs pour outrepasser un dÃ©faut de `Card`.
  if (href) {
    return (
      <Link href={href} className="focus-ring group block h-full rounded-card-lg">
        <Card
          interactive
          className={cn("h-full cursor-pointer rounded-card-lg bg-[linear-gradient(180deg,color-mix(in_srgb,var(--color-surface)_94%,white_6%),var(--color-surface))] p-5 shadow-md", hero && "!border-[color-mix(in_srgb,var(--color-green)_34%,var(--color-border))] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--color-surface)_86%,var(--color-green)_14%),var(--color-surface))] shadow-lg")}
        >
          {content}
        </Card>
      </Link>
    );
  }

  if (hero) {
    return <Card className="rounded-card-lg !border-[color-mix(in_srgb,var(--color-green)_34%,var(--color-border))] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--color-surface)_88%,var(--color-green)_12%),var(--color-surface))] p-5 shadow-lg">{content}</Card>;
  }

  return <Card className="rounded-card-lg bg-[linear-gradient(180deg,color-mix(in_srgb,var(--color-surface)_94%,white_6%),var(--color-surface))] p-5 shadow-md">{content}</Card>;
}



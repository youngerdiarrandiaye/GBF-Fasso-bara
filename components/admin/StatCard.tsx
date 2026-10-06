"use client";

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import { formatMontant } from "@/lib/format";
import { useCountUp } from "@/lib/hooks/useCountUp";

/**
 * Stat card — docs/design-system.md §6.3 : rounded-xl, fond surface, valeur
 * en text-display monospace, libellé text-body-sm muted au-dessus, variation
 * optionnelle (badge vert/rouge + flèche) sous la valeur.
 *
 * Si `href` est fourni, la carte entière devient un lien de navigation : elle
 * reprend l'état hover/active déjà défini par `Card` (`interactive`) — même
 * traitement `translateY(-2px)` + `shadow-card-hover` que les autres cartes
 * cliquables du design system, sans style dupliqué.
 *
 * `hero` (docs §3.8/D-17) : fond `--gradient-hero` (vert profond → vert néon)
 * + texte blanc, réservé à LA stat principale d'un dashboard (une seule carte
 * "héro" par écran) — jamais utilisé pour signaler un état/statut (ce rôle
 * reste aux tons vert/ambre/rouge/bleu existants). Remplace l'ancien fond
 * plein `navy` (devenu quasi invisible sur le fond sombre "neon green", D-18).
 *
 * Compteur animé (`numericValue`/`format`, docs §7) : si `numericValue`
 * est fourni, la carte anime 0 -> `numericValue` au montage via `useCountUp`
 * et affiche chaque valeur intermédiaire formatée selon `format` (par
 * défaut `"entier"`). Sans `numericValue`, `value` est affichée telle quelle,
 * sans animation — comportement inchangé pour les appelants existants qui ne
 * passent qu'une string déjà formatée (ex. page Paiements).
 *
 * `format` est une chaîne (pas une fonction) car ce composant est un Client
 * Component : une fonction (ex. `formatMontant`) ne peut pas traverser la
 * frontière serveur→client depuis la page serveur qui l'appelle (Next.js
 * rejette les props-fonctions non `"use server"`) — le composant résout donc
 * lui-même le formateur à partir d'un identifiant sérialisable.
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
  /** Valeur numérique brute à animer (0 -> numericValue) au montage. */
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
    <div className="flex h-full flex-col justify-between gap-3">
      <div className="flex items-start gap-2">
        <span className={cn("mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full", signalClass)} aria-hidden="true" />
        <p className={cn("min-w-0 flex-1 text-body-sm font-medium", hero ? "text-green-text" : "text-muted")}>{label}</p>
        {href && <span aria-hidden="true" className={cn("text-body-sm transition-transform group-hover:translate-x-1", hero ? "text-muted" : "text-muted")}>→</span>}
      </div>
      <p className={cn("break-words font-mono text-[1.75rem] font-semibold leading-none tracking-[-0.04em]", toneClass)}>{valeurAffichee}</p>
      {hint && <p className="text-body-sm text-muted">{hint}</p>}
    </div>
  );

  // Rayon élargi (§3.6/D-11) : StatCard fait partie de la rangée "vedette" du
  // dashboard (résumé façon "Sales Overview"), qu'elle soit héro ou non.
  // `!border-transparent` : `Card` fixe déjà `border-border` dans ses classes
  // de base, et `cn()` (lib/cn.ts) est une simple concaténation SANS
  // déduplication (choix assumé du projet) — sans le préfixe `!` les deux
  // classes de bordure coexistent dans le DOM et laquelle "gagne" dépend de
  // l'ordre de génération Tailwind, pas de l'ordre dans `className`. Même
  // convention déjà utilisée ailleurs pour outrepasser un défaut de `Card`.
  if (href) {
    return (
      <Link href={href} className="focus-ring group block h-full rounded-card-lg">
        <Card
          interactive
          className={cn("h-full cursor-pointer rounded-card-lg p-5", hero && "!border-[color-mix(in_srgb,var(--color-green)_34%,var(--color-border))]")}
        >
          {content}
        </Card>
      </Link>
    );
  }

  if (hero) {
    return <Card className="rounded-card-lg !border-[color-mix(in_srgb,var(--color-green)_34%,var(--color-border))] p-5">{content}</Card>;
  }

  return <Card className="rounded-card-lg p-5">{content}</Card>;
}



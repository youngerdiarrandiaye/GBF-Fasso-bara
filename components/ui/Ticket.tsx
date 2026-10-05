import Link from "next/link";
import { formatMontant } from "@/lib/format";

/**
 * Ticket — synthèse chiffrée rendue sur la carte encre (D-25, un seul bloc
 * sombre par écran ; D-26). Montant principal à gauche, puis un relevé façon
 * ticket de caisse (libellé, points de conduite, valeur) où chaque ligne mène
 * à l'écran qui permet d'agir. Partagé par le dashboard Admin (« ticket du
 * mois ») et l'accueil Agent (« mes ventes du jour »).
 *
 * La jauge crédit reprend les zones de §5.9 (D-23) : vert sous 2/3 du
 * plafond, ambre au-delà, rouge plafond atteint ; seuil à 0 = non configuré.
 */
export type LigneTicket = {
  href: string;
  libelle: string;
  valeur: string;
  /** Signal coloré à gauche du libellé — jamais seul porteur de l'info. */
  signal?: "green" | "amber" | "red";
  detail?: string;
  jauge?: { ratio: number; zone: "green" | "amber" | "red" };
};

const SIGNAL: Record<NonNullable<LigneTicket["signal"]>, string> = {
  green: "bg-green",
  amber: "bg-amber",
  red: "bg-red",
};

export function zoneCredit(encours: number, seuil: number): { ratio: number; zone: "green" | "amber" | "red" } | null {
  if (seuil <= 0) return null;
  const ratio = encours / seuil;
  return { ratio, zone: ratio >= 1 ? "red" : ratio >= 2 / 3 ? "amber" : "green" };
}

export function Ticket({
  id,
  titre,
  sousTitre,
  montant,
  lien,
  lignes,
}: {
  id: string;
  titre: string;
  sousTitre?: string;
  montant: number;
  lien: { href: string; label: string };
  lignes: LigneTicket[];
}) {
  return (
    <section
      aria-labelledby={id}
      className="grid grid-cols-1 overflow-hidden rounded-card-lg bg-encre text-white lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]"
    >
      <Link
        href={lien.href}
        className="focus-ring group flex flex-col justify-between gap-6 p-5 transition-colors hover:bg-white/5 sm:p-6"
      >
        <div>
          <h2 id={id} className="text-body text-encre-muted">{titre}</h2>
          {sousTitre && <p className="mt-0.5 text-body text-encre-muted">{sousTitre}</p>}
        </div>
        <p className="break-words font-mono text-[2.25rem] font-semibold leading-none tracking-[-0.04em] sm:text-[3rem]">
          {formatMontant(montant)}
        </p>
        <p className="text-body text-encre-muted group-hover:text-white">{lien.label}</p>
      </Link>

      {/* Le bord perforé sépare les deux moitiés du ticket : pointillés
          verticaux sur grand écran, horizontaux une fois empilé. */}
      <ul className="border-t border-dashed border-white/20 px-2 py-3 sm:px-3 lg:border-l lg:border-t-0 lg:py-4">
        {lignes.map((ligne) => (
          <li key={ligne.libelle}>
            <Link
              href={ligne.href}
              className="focus-ring tap-target block rounded-input px-3 py-2.5 transition-colors hover:bg-white/5"
            >
              <span className="flex items-baseline gap-2">
                {ligne.signal && (
                  <span className={`h-2 w-2 shrink-0 self-center rounded-full ${SIGNAL[ligne.signal]}`} aria-hidden="true" />
                )}
                <span className="shrink-0 text-body">{ligne.libelle}</span>
                <span className="mb-1 min-w-4 flex-1 border-b border-dotted border-white/30" aria-hidden="true" />
                <span className="shrink-0 text-right font-mono text-body font-semibold">{ligne.valeur}</span>
              </span>
              {(ligne.detail || ligne.jauge) && (
                <span className="mt-1.5 flex items-center gap-3">
                  {ligne.jauge && (
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15" aria-hidden="true">
                      <span
                        className={`block h-full rounded-full ${SIGNAL[ligne.jauge.zone]}`}
                        style={{ width: `${Math.min(100, Math.round(ligne.jauge.ratio * 100))}%` }}
                      />
                    </span>
                  )}
                  {ligne.detail && <span className="shrink-0 text-body-sm text-encre-muted">{ligne.detail}</span>}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

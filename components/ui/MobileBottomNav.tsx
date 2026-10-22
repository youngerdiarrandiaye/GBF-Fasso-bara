"use client";

import { NavigationLink as Link } from "@/components/ui/NavigationLink";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEllipsis, faMagnifyingGlass, faPlus, faXmark, type IconDefinition } from "@fortawesome/free-solid-svg-icons";
import { cn } from "@/lib/cn";

export interface LienNav {
  href: string;
  label: string;
  icon: IconDefinition;
  exact?: boolean;
}

export interface GroupeNav {
  label: string;
  liens: LienNav[];
}

const normalize = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function correspond(pathname: string, lien: LienNav) {
  return lien.exact ? pathname === lien.href : pathname === lien.href || pathname.startsWith(`${lien.href}/`);
}

/**
 * Vrai si `lien` est l'entrée la plus précise de `tous` pour `pathname` : sur
 * /admin/bons-livraison/nouveau, « Nouvelle livraison » est actif, pas
 * « Bons de livraison ».
 */
export function estLienActif(pathname: string, lien: LienNav, tous: LienNav[]) {
  if (!correspond(pathname, lien)) return false;
  return !tous.some((autre) => autre.href.length > lien.href.length && autre.href.startsWith(lien.href) && correspond(pathname, autre));
}

/**
 * Navigation mobile (< lg) partagée par l'Admin et l'Agent : barre basse fixe
 * (onglets, bouton rond « + » central pour l'action principale, « Plus ») et
 * feuille « Plus » qui donne accès au reste de la navigation. Les écrans ≥ lg
 * ont leur propre navigation (sidebar Admin, barre du haut Agent).
 *
 * Les onglets sont répartis autour de l'action : les deux premiers à gauche,
 * le reste à droite, puis « Plus » (toujours 5 colonnes : 3 onglets + action
 * + Plus).
 *
 * La feuille reste montée en permanence (masquée par `invisible`) : le
 * contenu de `pied` (sélecteur de thème…) ne doit pas être démonté à chaque
 * fermeture.
 */
export function MobileBottomNav({
  onglets,
  action,
  libelleAction,
  groupes,
  libelleRubriques,
  masquerSur,
  pied,
}: {
  /** 3 onglets épinglés. */
  onglets: LienNav[];
  /** Action principale, au centre. */
  action: LienNav;
  libelleAction: string;
  /** Toute la navigation, affichée dans la feuille « Plus ». */
  groupes: GroupeNav[];
  libelleRubriques: string;
  /** Préfixe de route où la barre est masquée (formulaire à barre de pied propre). */
  masquerSur: string;
  /** Pied de la feuille (thème, déconnexion…). */
  pied?: React.ReactNode;
}) {
  const pathname = usePathname();
  const idFeuille = useId();
  const [ouverte, setOuverte] = useState(false);
  const [recherche, setRecherche] = useState("");
  const feuilleRef = useRef<HTMLDivElement>(null);
  const fermerRef = useRef<HTMLButtonElement>(null);
  const declencheurRef = useRef<HTMLButtonElement>(null);
  const fermer = useCallback(() => setOuverte(false), []);
  const tous = groupes.flatMap((g) => g.liens);

  // Toute navigation referme la feuille (le lien cliqué ne la démonte pas).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOuverte(false);
  }, [pathname]);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const onChange = () => { if (desktop.matches) setOuverte(false); };
    desktop.addEventListener("change", onChange);
    return () => desktop.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!ouverte) return;
    const overflowPrecedent = document.body.style.overflow;
    const declencheur = declencheurRef.current;
    document.body.style.overflow = "hidden";
    fermerRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") fermer();
      if (event.key !== "Tab") return;
      const items = Array.from(feuilleRef.current?.querySelectorAll<HTMLElement>('a[href], button, input, [tabindex="0"]') ?? [])
        .filter((item) => !item.hasAttribute("disabled") && item.getClientRects().length > 0 && (!(item instanceof HTMLInputElement) || item.type !== "radio" || item.checked));
      const premier = items[0];
      const dernier = items[items.length - 1];
      if (event.shiftKey && document.activeElement === premier) { event.preventDefault(); dernier?.focus(); }
      else if (!event.shiftKey && document.activeElement === dernier) { event.preventDefault(); premier?.focus(); }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = overflowPrecedent;
      window.removeEventListener("keydown", onKeyDown);
      declencheur?.focus();
    };
  }, [ouverte, fermer]);

  if (pathname.startsWith(masquerSur)) return null;

  const terme = normalize(recherche.trim());
  const groupesFiltres = groupes
    .map((g) => ({ ...g, liens: g.liens.filter((l) => normalize(l.label).includes(terme)) }))
    .filter((g) => g.liens.length > 0);
  const actifs = [...onglets, action].some((l) => estLienActif(pathname, l, tous));
  const plusActif = ouverte || !actifs;

  const onglet = (lien: LienNav) => {
    const actif = estLienActif(pathname, lien, tous);
    return (
      <Link
        key={lien.href}
        href={lien.href}
        aria-current={actif ? "page" : undefined}
        className={cn(
          "focus-ring tap-target flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-input px-1 text-caption",
          actif ? "font-semibold text-accent-text" : "text-muted"
        )}
      >
        <FontAwesomeIcon icon={lien.icon} className="h-4 w-4" aria-hidden="true" />
        {lien.label}
      </Link>
    );
  };

  return (
    <>
      <nav
        aria-label="Navigation principale"
        className="fixed inset-x-0 bottom-0 z-sticky border-t border-border bg-surface shadow-lg lg:hidden"
      >
        <div className="mx-auto grid h-[calc(4rem+env(safe-area-inset-bottom))] max-w-xl grid-cols-5 items-stretch gap-1 px-2 pt-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))]">
          {onglets.slice(0, 2).map(onglet)}

          <Link href={action.href} aria-label={libelleAction} className="focus-ring relative flex min-w-0 items-start justify-center">
            {/* Bouton rond surélevé, comme le « + » central des apps mobiles */}
            <span className="absolute -top-5 flex h-14 w-14 items-center justify-center rounded-full border-4 border-surface bg-accent text-accent-on shadow-lg transition-transform active:scale-95">
              <FontAwesomeIcon icon={faPlus} className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="sr-only">{libelleAction}</span>
          </Link>

          {onglets.slice(2).map(onglet)}

          <button
            ref={declencheurRef}
            type="button"
            onClick={() => setOuverte((v) => !v)}
            aria-haspopup="dialog"
            aria-expanded={ouverte}
            aria-controls={idFeuille}
            className={cn(
              "focus-ring tap-target flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-input px-1 text-caption",
              plusActif ? "font-semibold text-accent-text" : "text-muted"
            )}
          >
            <FontAwesomeIcon icon={faEllipsis} className="h-4 w-4" aria-hidden="true" />
            Plus
          </button>
        </div>
      </nav>

      {ouverte && (
        <button
          type="button"
          onClick={fermer}
          aria-label="Fermer le menu"
          tabIndex={-1}
          className="fixed inset-0 z-modal-overlay cursor-default bg-black/60 backdrop-blur-[2px] lg:hidden"
        />
      )}

      <div
        ref={feuilleRef}
        id={idFeuille}
        role={ouverte ? "dialog" : undefined}
        aria-modal={ouverte ? true : undefined}
        aria-label="Toutes les rubriques"
        className={cn(
          "fixed inset-x-0 bottom-0 z-modal flex max-h-[85dvh] flex-col rounded-t-3xl border-t border-border bg-surface text-text shadow-lg transition-[transform,visibility] duration-300 ease-standard lg:hidden",
          ouverte ? "visible translate-y-0" : "invisible translate-y-full"
        )}
      >
        <div className="flex shrink-0 items-center gap-2 px-4 pt-4">
          <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-input border border-border bg-surface-2 px-3 focus-within:border-accent">
            <FontAwesomeIcon icon={faMagnifyingGlass} className="h-4 w-4 text-muted" aria-hidden="true" />
            <input
              value={recherche}
              onChange={(event) => setRecherche(event.target.value)}
              aria-label="Rechercher dans le menu"
              placeholder="Rechercher une rubrique…"
              className="min-w-0 flex-1 bg-transparent py-2 text-body-sm text-text outline-none placeholder:text-muted"
            />
          </label>
          <button
            ref={fermerRef}
            type="button"
            onClick={fermer}
            aria-label="Fermer le menu"
            className="focus-ring flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted"
          >
            <FontAwesomeIcon icon={faXmark} className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <nav aria-label={libelleRubriques} className="flex min-h-0 flex-1 touch-pan-y flex-col gap-4 overflow-y-auto overscroll-contain p-4">
          {groupesFiltres.map((groupe, index) => (
            <div key={groupe.label} className={cn("flex flex-col gap-1", index > 0 && "border-t border-border pt-4")}>
              <p className="px-3 text-caption font-bold uppercase tracking-wide text-text">{groupe.label}</p>
              {groupe.liens.map((lien) => {
                const actif = estLienActif(pathname, lien, tous);
                return (
                  <Link
                    key={lien.href}
                    href={lien.href}
                    aria-current={actif ? "page" : undefined}
                    className={cn(
                      "focus-ring flex min-h-12 items-center gap-3 rounded-input px-3 py-2.5 text-body-sm transition-colors",
                      actif ? "bg-accent/15 font-semibold text-accent-text" : "text-muted"
                    )}
                  >
                    <FontAwesomeIcon icon={lien.icon} className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 flex-1">{lien.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
          {groupesFiltres.length === 0 && <p role="status" className="px-3 py-6 text-body-sm text-muted">Aucune rubrique trouvée.</p>}
        </nav>

        {pied && <div className="shrink-0 border-t border-border px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{pied}</div>}
      </div>
    </>
  );
}

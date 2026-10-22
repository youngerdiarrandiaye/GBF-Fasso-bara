"use client";

import { NavigationLink as Link } from "@/components/ui/NavigationLink";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEllipsis, faMagnifyingGlass, faPlus, faXmark } from "@fortawesome/free-solid-svg-icons";
import { cn } from "@/lib/cn";
import { ThemePicker } from "@/components/admin/ThemePicker";
import { ACTION_PRINCIPALE, GROUPES, ONGLETS_BAS, estActif, estDansPlus } from "@/components/admin/adminNav";

const normalize = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Navigation Admin < lg : barre basse fixe (4 onglets + action principale
 * centrale + « Plus ») et feuille « Plus » qui donne accès au reste de la
 * navigation. ≥ lg, c'est la Sidebar qui prend le relais (cette barre est
 * masquée). Masquée aussi pendant la saisie d'une facture, dont le formulaire
 * a sa propre barre de pied.
 *
 * La feuille reste montée en permanence (masquée par `invisible`) : le
 * ThemePicker qu'elle contient applique le thème au montage et le retire au
 * démontage, il ne doit donc pas être démonté à chaque fermeture.
 */
export function AdminBottomNav() {
  const pathname = usePathname();
  const [ouverte, setOuverte] = useState(false);
  const [recherche, setRecherche] = useState("");
  const feuilleRef = useRef<HTMLDivElement>(null);
  const fermerRef = useRef<HTMLButtonElement>(null);
  const declencheurRef = useRef<HTMLButtonElement>(null);
  const fermer = useCallback(() => setOuverte(false), []);

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

  if (pathname.startsWith("/admin/nouvelle-facture")) return null;

  const terme = normalize(recherche.trim());
  const groupes = GROUPES
    .map((g) => ({ ...g, liens: g.liens.filter((l) => normalize(l.label).includes(terme)) }))
    .filter((g) => g.liens.length > 0);
  const plusActif = ouverte || estDansPlus(pathname);

  return (
    <>
      <nav
        aria-label="Navigation principale"
        className="fixed inset-x-0 bottom-0 z-sticky border-t border-border bg-surface shadow-lg lg:hidden"
      >
        <div className="mx-auto grid h-[calc(4rem+env(safe-area-inset-bottom))] max-w-xl grid-cols-5 items-stretch gap-1 px-2 pt-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))]">
          {ONGLETS_BAS.slice(0, 2).map((onglet) => (
            <OngletLien key={onglet.href} onglet={onglet} actif={estActif(pathname, onglet)} />
          ))}

          <Link
            href={ACTION_PRINCIPALE.href}
            aria-label="Créer une facture"
            className="focus-ring relative flex min-w-0 items-start justify-center"
          >
            {/* Bouton rond surélevé, comme le « + » central des apps mobiles */}
            <span className="absolute -top-5 flex h-14 w-14 items-center justify-center rounded-full border-4 border-surface bg-accent text-accent-on shadow-lg transition-transform active:scale-95">
              <FontAwesomeIcon icon={faPlus} className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="sr-only">{ACTION_PRINCIPALE.label}</span>
          </Link>

          {ONGLETS_BAS.slice(2).map((onglet) => (
            <OngletLien key={onglet.href} onglet={onglet} actif={estActif(pathname, onglet)} />
          ))}

          <button
            ref={declencheurRef}
            type="button"
            onClick={() => setOuverte((v) => !v)}
            aria-haspopup="dialog"
            aria-expanded={ouverte}
            aria-controls="admin-plus-sheet"
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
        id="admin-plus-sheet"
        role={ouverte ? "dialog" : undefined}
        aria-modal={ouverte ? true : undefined}
        aria-label="Toutes les rubriques"
        className={cn(
          "fixed inset-x-0 bottom-0 z-modal flex max-h-[85dvh] flex-col rounded-t-3xl border-t border-sidebar-text-muted/15 bg-sidebar-bg text-sidebar-text shadow-lg transition-[transform,visibility] duration-300 ease-standard lg:hidden",
          ouverte ? "visible translate-y-0" : "invisible translate-y-full"
        )}
      >
        <div className="flex shrink-0 items-center gap-2 px-4 pt-4">
          <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-input border border-sidebar-text-muted/20 bg-sidebar-text-muted/5 px-3 focus-within:border-accent">
            <FontAwesomeIcon icon={faMagnifyingGlass} className="h-4 w-4 text-sidebar-text-muted" aria-hidden="true" />
            <input
              value={recherche}
              onChange={(event) => setRecherche(event.target.value)}
              aria-label="Rechercher dans le menu"
              placeholder="Rechercher une rubrique…"
              className="min-w-0 flex-1 bg-transparent py-2 text-body-sm text-sidebar-text outline-none placeholder:text-sidebar-text-muted"
            />
          </label>
          <button
            ref={fermerRef}
            type="button"
            onClick={fermer}
            aria-label="Fermer le menu"
            className="focus-ring flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sidebar-text-muted/10 text-sidebar-text-muted"
          >
            <FontAwesomeIcon icon={faXmark} className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <nav aria-label="Rubriques Admin" className="flex min-h-0 flex-1 touch-pan-y flex-col gap-4 overflow-y-auto overscroll-contain p-4">
          {groupes.map((groupe, index) => (
            <div key={groupe.label} className={cn("flex flex-col gap-1", index > 0 && "border-t border-sidebar-text-muted/30 pt-4")}>
              <p className="px-3 text-caption font-bold uppercase tracking-wide text-sidebar-text">{groupe.label}</p>
              {groupe.liens.map((lien) => {
                const actif = estActif(pathname, lien);
                return (
                  <Link
                    key={lien.href}
                    href={lien.href}
                    aria-current={actif ? "page" : undefined}
                    className={cn(
                      "focus-ring flex min-h-12 items-center gap-3 rounded-input px-3 py-2.5 text-body-sm transition-colors",
                      actif ? "bg-sidebar-active font-semibold text-sidebar-active-text shadow-sm" : "text-sidebar-text-muted"
                    )}
                  >
                    <FontAwesomeIcon icon={lien.icon} className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 flex-1">{lien.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
          {groupes.length === 0 && <p role="status" className="px-3 py-6 text-body-sm text-sidebar-text-muted">Aucune rubrique trouvée.</p>}
        </nav>

        <div className="shrink-0 border-t border-sidebar-text-muted/15 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <ThemePicker collapsed={false} />
        </div>
      </div>
    </>
  );
}

function OngletLien({ onglet, actif }: { onglet: (typeof ONGLETS_BAS)[number]; actif: boolean }) {
  return (
    <Link
      href={onglet.href}
      aria-current={actif ? "page" : undefined}
      className={cn(
        "focus-ring tap-target flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-input px-1 text-caption",
        actif ? "font-semibold text-accent-text" : "text-muted"
      )}
    >
      <FontAwesomeIcon icon={onglet.icon} className="h-4 w-4" aria-hidden="true" />
      {onglet.label}
    </Link>
  );
}

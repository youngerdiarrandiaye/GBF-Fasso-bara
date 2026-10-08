"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCoins } from "@fortawesome/free-solid-svg-icons";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { useDismiss } from "@/lib/hooks/useDismiss";
import type { AlerteFactureRow } from "@/lib/supabase/database.types";

// Fenêtre de regroupement des alertes reçues en rafale — même principe que
// components/admin/AlertsBell.tsx (docs/toast-et-coherence-donnees.md §9
// V3.1) : un toast récapitulatif unique si plusieurs alertes arrivent dans
// cette fenêtre, sinon le toast individuel habituel.
const FENETRE_REGROUPEMENT_MS = 1200;

/**
 * Cloche d'alertes de paiement — abonnement Supabase Realtime au canal
 * `alertes_factures` (postgres_changes INSERT/UPDATE sur la table
 * `alertes_factures`, déjà ajoutée à la publication `supabase_realtime` par
 * 0009_alertes_paiement.sql). Un seul niveau de gravité ici (rouge) : à la
 * différence des alertes de stock, il n'y a pas de distinction
 * ambre/rouge — une facture en retard de paiement (>10 jours) est toujours
 * traitée comme critique.
 */
export function PaymentAlertsBell({ alertesInitiales }: { alertesInitiales: AlerteFactureRow[] }) {
  const [alertes, setAlertes] = useState<AlerteFactureRow[]>(alertesInitiales);
  const [ouvert, setOuvert] = useState(false);
  const conteneurRef = useRef<HTMLDivElement>(null);
  const fermer = useCallback(() => setOuvert(false), []);
  useDismiss(conteneurRef, ouvert, fermer);
  useEffect(() => {
    // Réconcilier la liste avec le dernier résultat serveur.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAlertes(alertesInitiales);
  }, [alertesInitiales]);
  const { showToast } = useToast();
  // Tampon de rafale (voir FENETRE_REGROUPEMENT_MS) : accumule les alertes
  // insérées en quasi-simultané avant de décider du toast à afficher — un
  // seul toast récapitulatif si plusieurs, sinon le toast individuel habituel.
  const bufferRef = useRef<AlerteFactureRow[]>([]);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function flushBuffer() {
      const lot = bufferRef.current;
      bufferRef.current = [];
      timeoutRef.current = null;

      if (lot.length === 0) return;

      if (lot.length === 1) {
        const [unique] = lot;
        showToast(unique.message, "error");
        return;
      }

      showToast(`${lot.length} factures viennent de dépasser 10 jours de retard.`, "error");
    }

    const supabase = createClient();
    const channel = supabase
      .channel("alertes_factures")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "alertes_factures" },
        (payload) => {
          const nouvelle = payload.new as AlerteFactureRow;
          setAlertes((prev) => [nouvelle, ...prev.filter((a) => a.id !== nouvelle.id)].slice(0, 20));

          bufferRef.current.push(nouvelle);
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          timeoutRef.current = setTimeout(flushBuffer, FENETRE_REGROUPEMENT_MS);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "alertes_factures" },
        (payload) => {
          const maj = payload.new as AlerteFactureRow;
          setAlertes((prev) =>
            maj.lue ? prev.filter((a) => a.id !== maj.id) : prev.map((a) => (a.id === maj.id ? maj : a))
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [showToast]);

  const nonLues = alertes.filter((a) => !a.lue);

  return (
    <div ref={conteneurRef} className="sm:relative">
      <button
        type="button"
        onClick={() => setOuvert((v) => !v)}
        className="focus-ring relative flex h-11 w-11 items-center justify-center rounded-input text-text hover:bg-surface-2 sm:h-10 sm:w-10"
        aria-haspopup="menu"
        aria-expanded={ouvert}
        aria-label={`Alertes de paiement (${nonLues.length} non lues)`}
      >
        <FontAwesomeIcon icon={faCoins} className="h-5 w-5" aria-hidden="true" />
        {nonLues.length > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red px-1 text-[10px] font-bold text-white">
            {nonLues.length > 9 ? "9+" : nonLues.length}
          </span>
        )}
      </button>

      {ouvert && (
        <div
          role="menu"
          className="fixed inset-x-3 top-[4.25rem] z-dropdown max-h-[calc(100dvh-5.5rem)] overflow-y-auto rounded-card border border-border bg-surface p-2 shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-80"
        >
          <p className="px-2 py-1.5 text-body-sm font-semibold text-text">
            Alertes de paiement ({nonLues.length})
          </p>
          <div className="max-h-80 overflow-y-auto">
            {alertes.length === 0 ? (
              <p className="px-2 py-4 text-center text-body-sm text-muted">
                Aucune alerte pour le moment.
              </p>
            ) : (
              alertes.map((alerte) => (
                <div
                  key={alerte.id}
                  className={cn(
                    "flex items-start gap-2 rounded-input px-2 py-2 text-body-sm",
                    alerte.lue ? "text-muted" : "text-text"
                  )}
                >
                  <span aria-hidden="true" className="text-red">
                    ▲
                  </span>
                  <span className="flex-1">{alerte.message}</span>
                </div>
              ))
            )}
          </div>
          <Link
            href="/admin/paiements"
            onClick={() => setOuvert(false)}
            className="focus-ring mt-1 block rounded-input px-2 py-2 text-center text-body-sm text-green-text hover:bg-surface-2"
          >
            Voir les paiements
          </Link>
        </div>
      )}
    </div>
  );
}

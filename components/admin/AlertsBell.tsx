"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBell } from "@fortawesome/free-solid-svg-icons";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import type { AlerteStockRow } from "@/lib/supabase/database.types";

// Fenêtre de regroupement des alertes reçues en rafale (docs/toast-et-coherence-donnees.md
// §9 V3.1) — un toast récapitulatif unique si plusieurs alertes arrivent dans cette
// fenêtre, sinon le toast individuel habituel. Volontairement court : c'est un
// regroupement de rafale, pas un digest périodique.
const FENETRE_REGROUPEMENT_MS = 1200;

/**
 * Cloche d'alertes de stock bas — abonnement Supabase Realtime au canal
 * `alertes_stock` (postgres_changes INSERT sur la table `alertes_stock`,
 * déjà ajoutée à la publication `supabase_realtime` par
 * 0001_schema_initial.sql section 12). Toute nouvelle alerte insérée par le
 * trigger `verifier_seuil_stock()` (déclenché à la validation d'une facture
 * côté Espace Agent, ou par le scan quotidien pg_cron) apparaît ici sans
 * rechargement de page.
 */
export function AlertsBell({ alertesInitiales }: { alertesInitiales: AlerteStockRow[] }) {
  const [alertes, setAlertes] = useState<AlerteStockRow[]>(alertesInitiales);
  const [ouvert, setOuvert] = useState(false);
  useEffect(() => {
    // Réconcilier la liste avec le dernier résultat serveur.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAlertes(alertesInitiales);
  }, [alertesInitiales]);
  const { showToast } = useToast();
  // Tampon de rafale (voir FENETRE_REGROUPEMENT_MS) : accumule les alertes
  // insérées en quasi-simultané avant de décider du toast à afficher — un
  // seul toast récapitulatif si plusieurs, sinon le toast individuel habituel.
  const bufferRef = useRef<AlerteStockRow[]>([]);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function flushBuffer() {
      const lot = bufferRef.current;
      bufferRef.current = [];
      timeoutRef.current = null;

      if (lot.length === 0) return;

      if (lot.length === 1) {
        const [unique] = lot;
        showToast(unique.message, unique.type === "rupture" ? "error" : "warning");
        return;
      }

      const contientRupture = lot.some((a) => a.type === "rupture");
      showToast(
        `${lot.length} produits sont passés sous leur seuil de stock.`,
        contientRupture ? "error" : "warning"
      );
    }

    const supabase = createClient();
    const channel = supabase
      .channel("alertes_stock")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "alertes_stock" },
        (payload) => {
          const nouvelle = payload.new as AlerteStockRow;
          setAlertes((prev) => [nouvelle, ...prev.filter((a) => a.id !== nouvelle.id)].slice(0, 20));

          bufferRef.current.push(nouvelle);
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          timeoutRef.current = setTimeout(flushBuffer, FENETRE_REGROUPEMENT_MS);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "alertes_stock" },
        (payload) => {
          const maj = payload.new as AlerteStockRow;
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
    <div className="relative">
      <button
        type="button"
        onClick={() => setOuvert((v) => !v)}
        className="focus-ring relative flex h-10 w-10 items-center justify-center rounded-input text-text hover:bg-surface-2"
        aria-haspopup="menu"
        aria-expanded={ouvert}
        aria-label={`Alertes de stock (${nonLues.length} non lues)`}
      >
        <FontAwesomeIcon icon={faBell} className="h-5 w-5" aria-hidden="true" />
        {nonLues.length > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red px-1 text-[10px] font-bold text-white">
            {nonLues.length > 9 ? "9+" : nonLues.length}
          </span>
        )}
      </button>

      {ouvert && (
        <div
          role="menu"
          className="absolute right-0 z-dropdown mt-2 w-80 rounded-card border border-border bg-surface p-2 shadow-lg"
        >
          <p className="px-2 py-1.5 text-body-sm font-semibold text-text">
            Alertes de stock ({nonLues.length})
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
                  <span aria-hidden="true" className={alerte.type === "rupture" ? "text-red" : "text-amber"}>
                    ▲
                  </span>
                  <span className="flex-1">{alerte.message}</span>
                </div>
              ))
            )}
          </div>
          <Link
            href="/admin/stock"
            onClick={() => setOuvert(false)}
            className="focus-ring mt-1 block rounded-input px-2 py-2 text-center text-body-sm text-green-text hover:bg-surface-2"
          >
            Voir le stock
          </Link>
        </div>
      )}
    </div>
  );
}

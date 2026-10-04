"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Bandeau persistant de perte de connexion réseau — décision D-Toast-03
 * (docs/toast-et-coherence-donnees.md §9 V3.2) : un composant de layout
 * dédié, pas le système de Toast (jamais un toast qui disparaît après 4s
 * pour un état qui reste actif). Composant partagé, monté une seule fois
 * dans chaque layout racine (Admin et Agent), entre la barre de navigation
 * et `<main>`.
 *
 * Détection à double signal, comme exigé §4f : un simple événement `offline`
 * du navigateur peut être un faux positif sur certains réseaux mobiles — le
 * bandeau ne s'affiche que si le navigateur ET un health-check actif
 * (`GET /api/health`, sans cache) concordent tous les deux sur une perte de
 * connectivité, et ne se masque que quand les deux redeviennent positifs.
 */

const INTERVALLE_HEALTHCHECK_MS = 15000;

type EtatBandeau = "en_ligne" | "hors_ligne" | "retabli";

export function NetworkStatusBanner() {
  // État masqué par défaut ("en_ligne" ne rend rien) : identique côté
  // serveur et premier rendu client, ne bascule que via les effets ci-dessous
  // — même invariant anti-hydration-mismatch que Toast.tsx (§2.3), même s'il
  // n'y a ici aucun risque réel de mismatch puisque l'état ne dépend que
  // d'écouteurs `useEffect`.
  const [etat, setEtat] = useState<EtatBandeau>("en_ligne");
  const horsLigneNavigateurRef = useRef(false);
  const healthCheckOkRef = useRef(true);
  const timeoutRetabliRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let annule = false;
    let controller: AbortController | null = null;
    horsLigneNavigateurRef.current = !navigator.onLine;

    function evaluerEtat() {
      const horsLigne = horsLigneNavigateurRef.current || !healthCheckOkRef.current;

      setEtat((precedent) => {
        if (horsLigne) {
          if (timeoutRetabliRef.current) {
            clearTimeout(timeoutRetabliRef.current);
            timeoutRetabliRef.current = null;
          }
          return "hors_ligne";
        }

        // Les deux signaux sont positifs : si on venait de "hors_ligne",
        // afficher brièvement "Connexion rétablie." avant de démonter.
        if (precedent === "hors_ligne") {
          if (timeoutRetabliRef.current) clearTimeout(timeoutRetabliRef.current);
          timeoutRetabliRef.current = setTimeout(() => {
            if (!annule) setEtat("en_ligne");
          }, 2000);
          return "retabli";
        }

        return precedent;
      });
    }

    async function verifierSante() {
      if (annule || controller) return;
      controller = new AbortController();
      const request = controller;
      const timeout = setTimeout(() => request.abort(), 8000);
      try {
        const reponse = await fetch("/api/health", { cache: "no-store", signal: request.signal });
        if (!annule) healthCheckOkRef.current = reponse.ok;
      } catch {
        if (!annule) healthCheckOkRef.current = false;
      } finally {
        clearTimeout(timeout);
        controller = null;
      }
      if (!annule) evaluerEtat();
    }

    function handleOffline() {
      horsLigneNavigateurRef.current = true;
      evaluerEtat();
      // Un `offline` navigateur seul peut être un faux positif : on
      // confirme (ou infirme) immédiatement via le health-check actif.
      void verifierSante();
    }

    function handleOnline() {
      horsLigneNavigateurRef.current = false;
      void verifierSante();
    }

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    // Vérification initiale + health-check périodique tant que l'onglet est
    // visible (pas de sondage inutile en arrière-plan).
    void verifierSante();
    const intervalId = setInterval(() => {
      if (document.visibilityState === "visible") void verifierSante();
    }, INTERVALLE_HEALTHCHECK_MS);

    return () => {
      annule = true;
      controller?.abort();
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      clearInterval(intervalId);
      if (timeoutRetabliRef.current) clearTimeout(timeoutRetabliRef.current);
    };
  }, []);

  if (etat === "en_ligne") return null;

  const estRetabli = etat === "retabli";

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex w-full items-center gap-2 px-4 py-2 text-body-sm",
        estRetabli ? "badge-pastel-green" : "badge-pastel-amber"
      )}
    >
      <span aria-hidden="true">▲</span>
      <span>{estRetabli ? "Connexion rétablie." : "Connexion perdue — vérification en cours..."}</span>
    </div>
  );
}

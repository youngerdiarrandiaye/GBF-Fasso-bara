"use client";

/**
 * Installation PWA — mémorise l'évènement `beforeinstallprompt` (Chrome,
 * Edge, Android) dès le chargement de l'application, avant que le bouton
 * « Installer » ne soit affiché, et notifie les composants abonnés.
 * Safari (iOS/macOS) n'émet pas cet évènement : `InstallAppPrompt` y affiche
 * la marche à suivre manuelle.
 */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let evenementDiffere: BeforeInstallPromptEvent | null = null;
let installee = false;
let masquee = false;
const abonnes = new Set<() => void>();
let ecouteActive = false;

function notifier() {
  abonnes.forEach((rappel) => rappel());
}

/** À appeler une fois, le plus tôt possible (ServiceWorkerRegister). */
export function ecouterInstallation() {
  if (ecouteActive || typeof window === "undefined") return;
  ecouteActive = true;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    evenementDiffere = event as BeforeInstallPromptEvent;
    notifier();
  });
  window.addEventListener("appinstalled", () => {
    installee = true;
    evenementDiffere = null;
    notifier();
  });
}

export function abonnerInstallation(rappel: () => void) {
  abonnes.add(rappel);
  return () => {
    abonnes.delete(rappel);
  };
}

export function etatInstallation() {
  return { evenement: evenementDiffere, installee, masquee };
}

/** « Plus tard » : masque la proposition sur cet appareil (mémorisé). */
export function masquerProposition(cleStockage: string) {
  masquee = true;
  try {
    window.localStorage.setItem(cleStockage, "1");
  } catch {
    // Stockage indisponible (navigation privée) : masquée pour cette visite.
  }
  notifier();
}

/** Ouvre la fenêtre d'installation du navigateur. true si acceptée. */
export async function lancerInstallation(): Promise<boolean> {
  const evenement = evenementDiffere;
  if (!evenement) return false;
  evenementDiffere = null; // un évènement ne peut servir qu'une fois
  await evenement.prompt();
  const { outcome } = await evenement.userChoice;
  notifier();
  return outcome === "accepted";
}

/** Application déjà ouverte en mode installé (écran d'accueil). */
export function estEnModeApplication() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** iPhone / iPad sous Safari : installation manuelle uniquement. */
export function estSafariIos() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return ios && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

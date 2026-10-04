"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";

export default function AgentError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Erreur de route Agent", error);
  }, [error]);

  return (
    <div className="flex min-h-72 flex-col items-center justify-center rounded-card border border-border bg-surface p-6 text-center">
      <p className="text-caption font-semibold uppercase tracking-wide text-red-text">Connexion interrompue</p>
      <h1 className="mt-2 text-h2 font-semibold tracking-tight text-text">Impossible d’afficher cette page</h1>
      <p className="mt-2 text-body text-muted">Vérifiez votre connexion puis réessayez.</p>
      <Button className="mt-5" onClick={reset}>Réessayer</Button>
    </div>
  );
}

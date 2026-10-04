"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Erreur de route Admin", error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-72 max-w-xl flex-col items-center justify-center rounded-card border border-border bg-surface p-6 text-center">
      <p className="text-caption font-semibold uppercase tracking-wide text-red-text">Chargement impossible</p>
      <h1 className="mt-2 text-h2 text-text">Cette page n’a pas pu s’afficher</h1>
      <p className="mt-2 text-body-sm text-muted">Vérifiez la connexion, puis relancez le chargement.</p>
      <Button className="mt-5" onClick={reset}>Réessayer</Button>
    </div>
  );
}

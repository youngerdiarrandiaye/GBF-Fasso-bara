"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { SegmentedControl } from "@/components/ui/SegmentedControl";

const OPTIONS = [
  { value: "4", label: "4 sem." },
  { value: "8", label: "8 sem." },
  { value: "12", label: "12 sem." },
  { value: "dates", label: "Dates" },
] as const;

/** Bascule de période du graphique "Ventes par semaine" — met à jour ?semaines= dans l'URL. */
export function ChartPeriodControl({ valeurActuelle, dateDebut, dateFin }: { valeurActuelle: number; dateDebut?: string; dateFin?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [afficherDates, setAfficherDates] = useState(Boolean(dateDebut && dateFin));
  const [debut, setDebut] = useState(dateDebut ?? "");
  const [fin, setFin] = useState(dateFin ?? "");
  const dureeJours = debut && fin ? Math.floor((new Date(`${fin}T12:00:00`).getTime() - new Date(`${debut}T12:00:00`).getTime()) / 86_400_000) + 1 : 0;
  const plageInvalide = Boolean(debut && fin && (debut > fin || dureeJours > 90));

  function handleChange(valeur: string) {
    if (valeur === "dates") {
      setAfficherDates(true);
      return;
    }
    setAfficherDates(false);
    const params = new URLSearchParams(searchParams.toString());
    params.set("semaines", valeur);
    params.delete("ventes_debut");
    params.delete("ventes_fin");
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  function appliquerDates(event: React.FormEvent) {
    event.preventDefault();
    if (!debut || !fin || plageInvalide) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("ventes_debut", debut);
    params.set("ventes_fin", fin);
    params.delete("semaines");
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  return (
    <div className="flex flex-col items-end gap-2" aria-busy={isPending}>
      <SegmentedControl options={[...OPTIONS]} value={(dateDebut && dateFin ? "dates" : String(valeurActuelle)) as (typeof OPTIONS)[number]["value"]} onChange={handleChange} disabled={isPending} />
      {afficherDates && (
        <form onSubmit={appliquerDates} className="flex flex-wrap items-end justify-end gap-2 rounded-input border border-border bg-surface-2 p-2">
          <label className="flex flex-col gap-1 text-caption text-muted">Du<input type="date" value={debut} onChange={(event) => setDebut(event.target.value)} className="focus-ring h-10 rounded-input border border-border bg-surface px-2 text-body-sm text-text" required /></label>
          <label className="flex flex-col gap-1 text-caption text-muted">Au<input type="date" value={fin} min={debut || undefined} onChange={(event) => setFin(event.target.value)} className="focus-ring h-10 rounded-input border border-border bg-surface px-2 text-body-sm text-text" required /></label>
          <button type="submit" disabled={!debut || !fin || plageInvalide || isPending} className="focus-ring h-10 rounded-input bg-green-dk px-3 text-body-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">Afficher</button>
          <p className={`w-full text-right text-caption ${plageInvalide ? "text-red-text" : "text-muted"}`}>{plageInvalide ? "Choisissez une période de 90 jours maximum." : "90 jours maximum"}</p>
        </form>
      )}
    </div>
  );
}

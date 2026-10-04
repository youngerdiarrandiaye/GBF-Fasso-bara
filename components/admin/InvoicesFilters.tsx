"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import type { ClientRow, UtilisateurRow } from "@/lib/supabase/database.types";

const STATUTS = [
  { value: "brouillon", label: "Brouillon" },
  { value: "proforma", label: "Proforma" },
  { value: "validee", label: "Validée" },
  { value: "payee_partielle", label: "Payée partielle" },
  { value: "payee", label: "Payée" },
  { value: "annulee", label: "Annulée" },
];

export function InvoicesFilters({
  clients,
  agents,
}: {
  clients: Pick<ClientRow, "id" | "nom">[];
  agents: Pick<UtilisateurRow, "id" | "nom">[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [numero, setNumero] = useState(searchParams.get("numero") ?? "");
  const numeroTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (numeroTimerRef.current) clearTimeout(numeroTimerRef.current);
  }, []);

  function appliquer(cle: string, valeur: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (valeur) {
      params.set(cle, valeur);
    } else {
      params.delete(cle);
    }
    // Tout changement de filtre invalide la pagination en cours (le nombre
    // total de résultats change) : on revient toujours à la page 1 plutôt
    // que de risquer une page hors bornes silencieusement vide.
    params.delete("page");
    const query = params.toString();
    startTransition(() => {
      router.push(query ? `${pathname}?${query}` : pathname);
    });
  }

  function rechercherNumero(valeur: string) {
    setNumero(valeur);
    if (numeroTimerRef.current) clearTimeout(numeroTimerRef.current);
    numeroTimerRef.current = setTimeout(() => appliquer("numero", valeur.trim()), 300);
  }

  const filtresActifs = Array.from(searchParams.entries()).filter(([cle, valeur]) => cle !== "page" && valeur);

  function libelleFiltre(cle: string, valeur: string) {
    if (cle === "numero") return `N° ${valeur}`;
    if (cle === "statut") return STATUTS.find((statut) => statut.value === valeur)?.label ?? valeur;
    if (cle === "client") return clients.find((client) => client.id === valeur)?.nom ?? "Client";
    if (cle === "agent") return agents.find((agent) => agent.id === valeur)?.nom ?? "Agent";
    if (cle === "debut") return `Depuis ${valeur}`;
    if (cle === "fin") return `Jusqu’au ${valeur}`;
    return valeur;
  }

  function reinitialiser() {
    setNumero("");
    startTransition(() => router.push(pathname));
  }

  return (
    <div className="space-y-3" aria-busy={isPending}>
      <div className={`grid grid-cols-1 gap-3 transition-opacity sm:grid-cols-2 xl:grid-cols-6 ${isPending ? "opacity-70" : ""}`}>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="f-numero" className="text-body font-medium text-text">
          Numéro de facture
        </label>
        <input
          id="f-numero"
          type="text"
          value={numero}
          onChange={(e) => rechercherNumero(e.target.value)}
          placeholder="FP20260802001"
          className="focus-ring h-tap w-full rounded-input border border-border bg-surface px-3 font-mono text-body text-text"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="f-statut" className="text-body font-medium text-text">
          Statut
        </label>
        <select
          id="f-statut"
          className="focus-ring h-tap w-full rounded-input border border-border bg-surface px-3 text-body text-text"
          defaultValue={searchParams.get("statut") ?? ""}
          onChange={(e) => appliquer("statut", e.target.value)}
        >
          <option value="">Tous les statuts</option>
          {STATUTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="f-client" className="text-body font-medium text-text">
          Client
        </label>
        <select
          id="f-client"
          className="focus-ring h-tap w-full rounded-input border border-border bg-surface px-3 text-body text-text"
          defaultValue={searchParams.get("client") ?? ""}
          onChange={(e) => appliquer("client", e.target.value)}
        >
          <option value="">Tous les clients</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nom}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="f-agent" className="text-body font-medium text-text">
          Agent
        </label>
        <select
          id="f-agent"
          className="focus-ring h-tap w-full rounded-input border border-border bg-surface px-3 text-body text-text"
          defaultValue={searchParams.get("agent") ?? ""}
          onChange={(e) => appliquer("agent", e.target.value)}
        >
          <option value="">Tous les agents</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nom}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5 xl:col-span-2">
        <label htmlFor="f-periode" className="text-body font-medium text-text">
          Période
        </label>
        <div className="flex items-center gap-2">
          <input
            id="f-periode"
            type="date"
            defaultValue={searchParams.get("debut") ?? ""}
            onChange={(e) => appliquer("debut", e.target.value)}
            className="focus-ring h-tap w-full rounded-input border border-border bg-surface px-2 text-body-sm text-text"
          />
          <span className="text-muted">→</span>
          <input
            type="date"
            defaultValue={searchParams.get("fin") ?? ""}
            onChange={(e) => appliquer("fin", e.target.value)}
            className="focus-ring h-tap w-full rounded-input border border-border bg-surface px-2 text-body-sm text-text"
          />
        </div>
      </div>
      </div>
      {filtresActifs.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <span className="text-body-sm text-muted">{filtresActifs.length} filtre{filtresActifs.length > 1 ? "s" : ""} actif{filtresActifs.length > 1 ? "s" : ""}</span>
          {filtresActifs.map(([cle, valeur]) => (
            <button key={cle} type="button" onClick={() => appliquer(cle, "")} className="focus-ring min-h-9 rounded-badge bg-surface-2 px-3 text-body-sm text-text hover:text-green-text" aria-label={`Retirer le filtre ${cle}`}>
              {libelleFiltre(cle, valeur)} ×
            </button>
          ))}
          <button type="button" onClick={reinitialiser} className="focus-ring min-h-9 rounded-input px-2 text-body-sm font-medium text-green-text hover:underline">
            Réinitialiser
          </button>
        </div>
      )}
    </div>
  );
}

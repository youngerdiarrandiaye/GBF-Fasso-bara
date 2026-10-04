"use client";

import { formatMontant } from "@/lib/format";

export interface PointAgentCA {
  agentId: string;
  nom: string;
  total: number;
}

export function NestedRadialProgress({
  data,
  totalGeneral,
}: {
  data: PointAgentCA[];
  totalGeneral: number;
}) {
  const trie = [...data].sort((a, b) => b.total - a.total);
  const topAgents = trie.slice(0, 6);
  const autres = Math.max(0, trie.length - topAgents.length);

  if (trie.length === 0 || totalGeneral <= 0) {
    return (
      <div className="flex min-h-32 flex-col justify-center rounded-input border border-dashed border-border bg-surface-2/50 p-4 text-center">
        <p className="text-body font-medium text-text">Aucune vente ce mois-ci</p>
        <p className="mt-1 text-body-sm text-muted">La performance des agents apparaitra ici.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-end justify-between gap-3 rounded-input border border-border bg-surface-2/60 p-4">
        <div className="min-w-0">
          <p className="text-caption font-semibold uppercase tracking-[0.14em] text-muted">Agent leader</p>
          <p className="mt-1 truncate text-h3 font-semibold text-text">{topAgents[0]?.nom}</p>
        </div>
        <p className="shrink-0 font-mono text-body font-semibold text-green-text">{formatMontant(topAgents[0]?.total ?? 0)}</p>
      </div>

      <ul className="grid gap-3">
        {topAgents.map((agent, index) => {
          const pourcentage = totalGeneral > 0 ? Math.round((agent.total / totalGeneral) * 100) : 0;
          const largeur = Math.max(4, pourcentage);
          return (
            <li key={agent.agentId} className="grid gap-1.5">
              <div className="flex items-center justify-between gap-3">
                <p className="min-w-0 truncate text-body font-medium text-text">
                  <span className="mr-2 font-mono text-caption text-muted">{String(index + 1).padStart(2, "0")}</span>
                  {agent.nom}
                </p>
                <p className="shrink-0 font-mono text-body-sm text-muted">{pourcentage}% · {formatMontant(agent.total)}</p>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full bg-green" style={{ width: `${largeur}%` }} />
              </div>
            </li>
          );
        })}
      </ul>

      {autres > 0 && <p className="text-body-sm text-muted">+{autres} autres agents actifs</p>}
    </div>
  );
}

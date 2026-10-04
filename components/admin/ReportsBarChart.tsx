"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMontant } from "@/lib/format";

export interface PointRapport {
  label: string;
  total: number;
}

/**
 * Graphique en barres — docs/design-system.md §6.15 : série principale
 * verte, grille pointillée, axes muted, tooltip carte surface. Imprimable
 * (pas d'animation bloquante, contraste suffisant en impression noir/blanc
 * grâce au remplissage plein).
 */
export function ReportsBarChart({ data }: { data: PointRapport[] }) {
  return (
    <div className="h-72 w-full overflow-hidden print:h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 16, left: 10, bottom: 34 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
          <XAxis
            dataKey="label"
            stroke="var(--color-muted)"
            tick={{ fill: "var(--color-muted)", fontSize: 12 }}
            axisLine={{ stroke: "var(--color-border)" }}
            tickLine={false}
            interval={0}
            height={52}
            tickMargin={12}
            tickFormatter={(value: string) => (value.length > 14 ? `${value.slice(0, 13)}…` : value)}
          />
          <YAxis
            stroke="var(--color-muted)"
            tick={{ fill: "var(--color-muted)", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={48}
            tickMargin={8}
            tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
          />
          <Tooltip
            contentStyle={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-input)",
              boxShadow: "var(--shadow-md)",
              color: "var(--color-text)",
              fontSize: 14,
            }}
            formatter={(value: number) => [formatMontant(value), "Ventes"]}
            labelStyle={{ color: "var(--color-muted)" }}
          />
          <Bar dataKey="total" fill="var(--color-green)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

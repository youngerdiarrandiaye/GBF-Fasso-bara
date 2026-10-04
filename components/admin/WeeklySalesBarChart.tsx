"use client";

import { useRouter } from "next/navigation";
import type { CategoricalChartState } from "recharts/types/chart/types";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMontant } from "@/lib/format";

export interface PointVenteSemaine {
  semaine: string;
  /** CA facturé (total_general des factures aux statuts "de CA") de la semaine. */
  facture: number;
  /** CA encaissé (somme des paiements enregistrés) de la semaine. */
  encaisse: number;
  /** Date ISO (YYYY-MM-DD) du lundi de la semaine — utilisée pour le clic. */
  debutISO: string;
  /** Date ISO (YYYY-MM-DD) du dimanche de la semaine — utilisée pour le clic. */
  finISO: string;
}

/**
 * `WeeklySalesBarChart` — docs/design-system.md §6.23. Remplace
 * `SalesChart` sur le dashboard Admin (retour au thème sombre "neon green",
 * D-14/D-19) : barres groupées à deux séries par semaine, CA facturé
 * (`--color-chart-serie-1`, vert clair) vs CA encaissé
 * (`--color-chart-serie-2`, vert foncé) — lecture purement financière
 * agrégée, jamais réutilisée pour représenter un statut de facture (§5.1).
 *
 * Comportement clic-vers-liste-filtrée identique à l'ancien `SalesChart` :
 * cliquer sur une paire de barres redirige vers `/admin/factures` filtré sur
 * la période de la semaine correspondante.
 */
export function WeeklySalesBarChart({ data }: { data: PointVenteSemaine[] }) {
  const router = useRouter();

  function handleChartClick(state: CategoricalChartState) {
    const point = state?.activePayload?.[0]?.payload as PointVenteSemaine | undefined;
    if (!point) return;
    router.push(`/admin/factures?debut=${point.debutISO}&fin=${point.finISO}`);
  }

  return (
    <div className="h-72 w-full cursor-pointer">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} onClick={handleChartClick}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
          <XAxis
            dataKey="semaine"
            stroke="var(--color-muted)"
            tick={{ fill: "var(--color-muted)", fontSize: 11 }}
            axisLine={{ stroke: "var(--color-border)" }}
            tickLine={false}
          />
          <YAxis
            stroke="var(--color-muted)"
            tick={{ fill: "var(--color-muted)", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={72}
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
            formatter={(value: number, name: string) => [
              formatMontant(value),
              name === "facture" ? "CA facturé" : "CA encaissé",
            ]}
            labelStyle={{ color: "var(--color-muted)" }}
          />
          <Legend
            formatter={(value: string) => (value === "facture" ? "CA facturé" : "CA encaissé")}
            wrapperStyle={{ fontSize: 14, color: "var(--color-muted)" }}
          />
          <Bar
            dataKey="facture"
            name="facture"
            fill="var(--color-chart-serie-1)"
            radius={[4, 4, 0, 0]}
            maxBarSize={28}
            cursor="pointer"
          />
          <Bar
            dataKey="encaisse"
            name="encaisse"
            fill="var(--color-chart-serie-2)"
            radius={[4, 4, 0, 0]}
            maxBarSize={28}
            cursor="pointer"
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/Skeleton";
import { LoadingStatus } from "@/components/ui/LoadingStatus";

function ChartLoading() {
  return <div className="flex min-h-64 flex-col gap-3"><LoadingStatus label="Chargement du graphique…" /><Skeleton className="h-56 w-full" /></div>;
}

export const WeeklySalesBarChart = dynamic(() => import("./WeeklySalesBarChart").then((m) => m.WeeklySalesBarChart), { ssr: false, loading: ChartLoading });
export const DonutChart = dynamic(() => import("./DonutChart").then((m) => m.DonutChart), { ssr: false, loading: ChartLoading });
export const ReportsBarChart = dynamic(() => import("./ReportsBarChart").then((m) => m.ReportsBarChart), { ssr: false, loading: ChartLoading });

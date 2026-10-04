"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LoadingStatus } from "@/components/ui/LoadingStatus";

/** Regroupe les événements et rattrape les changements après une interruption. */
export function RealtimeRevalidate({ tables }: { tables: string[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const tableKey = [...new Set(tables)].sort().join(",");

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    let lastRefresh = 0;
    let degraded = false;
    let subscribed = false;

    function schedule() {
      if (disposed || timer || !navigator.onLine || document.visibilityState !== "visible") return;
      // Un délai maximal fixe évite de reporter ind?finiment une rafale continue.
      timer = setTimeout(() => {
        timer = undefined;
        if (disposed || !navigator.onLine || document.visibilityState !== "visible") return;
        lastRefresh = Date.now();
        startTransition(() => router.refresh());
      }, Math.max(400, 2000 - (Date.now() - lastRefresh)));
    }

    function resume() {
      if (Date.now() - lastRefresh > 15000) schedule();
    }

    const channel = supabase.channel(`revalidate-${tableKey}`);
    for (const table of tableKey.split(",").filter(Boolean)) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, schedule);
    }
    channel.subscribe((status) => {
      if (disposed) return;
      if (status === "SUBSCRIBED") {
        if (subscribed || degraded) schedule();
        subscribed = true;
        degraded = false;
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        degraded = true;
      }
    });
    // Filet de sécurité pour les événements manqués et les tables non publiées.
    const interval = setInterval(schedule, 60000);
    window.addEventListener("online", schedule);
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      disposed = true;
      clearTimeout(timer);
      clearInterval(interval);
      window.removeEventListener("online", schedule);
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", resume);
      void supabase.removeChannel(channel);
    };
  }, [router, tableKey]);

  return pending ? <div className="fixed bottom-4 right-4 z-toast rounded-input border border-border bg-surface px-4 py-3 shadow-lg"><LoadingStatus label="Actualisation des données…" /></div> : null;
}

"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRotateRight } from "@fortawesome/free-solid-svg-icons";

export function DashboardRefresh() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button type="button" disabled={pending} aria-busy={pending}
      onClick={() => startTransition(() => router.refresh())}
      className="focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-3 text-body-sm font-medium text-text transition-colors hover:border-green disabled:cursor-wait disabled:opacity-60">
      <FontAwesomeIcon icon={faRotateRight} aria-hidden="true" className={`h-4 w-4 ${pending ? "animate-spin motion-reduce:animate-none" : ""}`} />
      <span role="status">{pending ? "Actualisation…" : "Actualiser"}</span>
    </button>
  );
}

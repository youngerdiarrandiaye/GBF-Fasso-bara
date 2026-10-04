"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { LoadingStatus } from "@/components/ui/LoadingStatus";
import { Input } from "@/components/ui/Input";

export function SearchInput({ placeholder, label }: { placeholder: string; label: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [valeur, setValeur] = useState(searchParams.get("q") ?? "");
  const [isPending, startTransition] = useTransition();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  function handleChange(v: string) {
    setValeur(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      const valeurNettoyee = v.trim();
      if (valeurNettoyee) params.set("q", valeurNettoyee);
      else params.delete("q");
      params.delete("page");
      const query = params.toString();
      startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname));
    }, 300);
  }

  function reinitialiser() {
    if (timerRef.current) clearTimeout(timerRef.current);
    setValeur("");
    startTransition(() => router.push(pathname));
  }

  return (
    <div className="space-y-2" aria-busy={isPending}>
      <div className={isPending ? "opacity-70" : undefined}>
        <Input label={label} placeholder={placeholder} value={valeur} onChange={(e) => handleChange(e.target.value)} />
      </div>
      {isPending && <LoadingStatus label="Recherche en cours…" />}
      {valeur && (
        <button type="button" onClick={reinitialiser} className="focus-ring min-h-9 rounded-input px-2 text-body-sm font-medium text-green-text hover:underline">
          Réinitialiser la recherche
        </button>
      )}
    </div>
  );
}

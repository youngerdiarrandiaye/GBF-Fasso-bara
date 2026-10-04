"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
import { createClient } from "@/lib/supabase/client";

interface SearchResult {
  id: string;
  label: string;
  detail: string;
  href: string;
  type: "Facture" | "Client" | "Produit";
}

export function GlobalSearch() {
  const router = useRouter();
  const conteneurRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    function fermerSiExterieur(event: MouseEvent) {
      if (!conteneurRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", fermerSiExterieur);
    return () => {
      document.removeEventListener("mousedown", fermerSiExterieur);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  async function rechercher(terme: string) {
    const recherche = terme.trim().replace(/[%_,()]/g, " ");
    if (recherche.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const [{ data: factures }, { data: clients }, { data: produits }] = await Promise.all([
      supabase.from("factures").select("id, numero, client:clients(nom)").ilike("numero", `%${recherche}%`).limit(5),
      supabase.from("clients").select("id, nom, telephone").ilike("nom", `%${recherche}%`).limit(5),
      supabase.from("produits").select("id, nom, code").or(`nom.ilike.%${recherche}%,code.ilike.%${recherche}%`).limit(5),
    ]);

    const nouveauxResultats: SearchResult[] = [
      ...(factures ?? []).map((facture) => ({
        id: facture.id,
        label: facture.numero,
        detail: (facture.client as unknown as { nom?: string } | null)?.nom ?? "Facture",
        href: `/admin/factures/${facture.id}`,
        type: "Facture" as const,
      })),
      ...(clients ?? []).map((client) => ({ id: client.id, label: client.nom, detail: client.telephone ?? "Client", href: `/admin/clients/${client.id}`, type: "Client" as const })),
      ...(produits ?? []).map((produit) => ({ id: produit.id, label: produit.nom, detail: produit.code, href: `/admin/stock/${produit.id}`, type: "Produit" as const })),
    ];
    setResults(nouveauxResultats);
    setActiveIndex(-1);
    setLoading(false);
    setOpen(true);
  }

  function handleChange(value: string) {
    setQuery(value);
    setOpen(value.trim().length >= 2);
    setLoading(value.trim().length >= 2);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void rechercher(value), 250);
  }

  function choisir(result: SearchResult) {
    setOpen(false);
    setQuery("");
    router.push(result.href);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") return setOpen(false);
    if (!open || results.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index <= 0 ? results.length - 1 : index - 1));
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      choisir(results[activeIndex]);
    }
  }

  return (
    <div ref={conteneurRef} className="relative min-w-0 flex-1 sm:max-w-md">
      <FontAwesomeIcon icon={faMagnifyingGlass} className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
      <input type="search" value={query} onChange={(event) => handleChange(event.target.value)} onFocus={() => query.trim().length >= 2 && setOpen(true)} onKeyDown={handleKeyDown} placeholder="Facture, client, produit…" className="focus-ring h-10 w-full rounded-input border border-border bg-surface-2 pl-9 pr-3 text-body-sm text-text placeholder:text-muted" role="combobox" aria-label="Recherche globale" aria-expanded={open} aria-controls="global-search-results" aria-autocomplete="list" aria-activedescendant={activeIndex >= 0 ? `global-result-${activeIndex}` : undefined} />

      {open && (
        <div id="global-search-results" role="listbox" className="absolute left-0 right-0 z-dropdown mt-2 max-h-[70vh] overflow-y-auto rounded-card border border-border bg-surface p-2 shadow-lg">
          {loading ? <p className="px-3 py-4 text-body-sm text-muted" role="status">Recherche…</p> : results.length === 0 ? <p className="px-3 py-4 text-body-sm text-muted">Aucun résultat. Essayez un numéro, un client ou un produit.</p> : results.map((result, index) => (
            <button id={`global-result-${index}`} key={`${result.type}-${result.id}`} type="button" role="option" aria-selected={index === activeIndex} onMouseEnter={() => setActiveIndex(index)} onClick={() => choisir(result)} className={`focus-ring flex min-h-11 w-full items-center justify-between gap-3 rounded-input px-3 py-2 text-left ${index === activeIndex ? "bg-surface-2" : "hover:bg-surface-2"}`}>
              <span className="min-w-0"><span className="block truncate text-body-sm font-medium text-text">{result.label}</span><span className="block truncate text-caption text-muted">{result.detail}</span></span>
              <span className="shrink-0 text-caption uppercase tracking-wide text-muted">{result.type}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

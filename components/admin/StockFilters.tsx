"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Input } from "@/components/ui/Input";
import type { CategorieProduitRow } from "@/lib/supabase/database.types";

export function StockFilters({ categories }: { categories: CategorieProduitRow[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [recherche, setRecherche] = useState(searchParams.get("q") ?? "");
  const [isPending, startTransition] = useTransition();
  const rechercheTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (rechercheTimerRef.current) clearTimeout(rechercheTimerRef.current);
  }, []);

  function appliquerFiltre(cle: string, valeur: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (valeur) {
      params.set(cle, valeur);
    } else {
      params.delete(cle);
    }
    params.delete("page");
    const query = params.toString();
    startTransition(() => {
      router.push(query ? `${pathname}?${query}` : pathname);
    });
  }

  function rechercherProduit(valeur: string) {
    setRecherche(valeur);
    if (rechercheTimerRef.current) clearTimeout(rechercheTimerRef.current);
    rechercheTimerRef.current = setTimeout(() => appliquerFiltre("q", valeur.trim()), 300);
  }

  const filtresActifs = Array.from(searchParams.entries()).filter(([cle, valeur]) => cle !== "page" && valeur);

  function libelleFiltre(cle: string, valeur: string) {
    if (cle === "actif" && valeur === "1") return "Produits actifs";
    if (cle === "q") return `Recherche : ${valeur}`;
    if (cle === "categorie") return categories.find((categorie) => categorie.id === valeur)?.nom ?? "Catégorie";
    if (cle === "niveau") return valeur === "bas" ? "Stock bas / rupture" : "Stock sain";
    return valeur;
  }

  function reinitialiser() {
    setRecherche("");
    startTransition(() => router.push(pathname));
  }

  return (
    <div className="space-y-3" aria-busy={isPending}>
      <div className={`flex flex-col gap-3 transition-opacity sm:flex-row sm:items-end ${isPending ? "opacity-70" : ""}`}>
      <div className="flex-1">
        <Input
          label="Rechercher"
          placeholder="Nom ou code produit..."
          value={recherche}
          onChange={(e) => rechercherProduit(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5 sm:w-56">
        <label htmlFor="categorie-filtre" className="text-body font-medium text-text">
          Catégorie
        </label>
        <select
          id="categorie-filtre"
          className="focus-ring h-tap w-full rounded-input border border-border bg-surface px-3 text-body text-text"
          defaultValue={searchParams.get("categorie") ?? ""}
          onChange={(e) => appliquerFiltre("categorie", e.target.value)}
        >
          <option value="">Toutes les catégories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nom}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5 sm:w-56">
        <label htmlFor="niveau-filtre" className="text-body font-medium text-text">
          Niveau de stock
        </label>
        <select
          id="niveau-filtre"
          className="focus-ring h-tap w-full rounded-input border border-border bg-surface px-3 text-body text-text"
          defaultValue={searchParams.get("niveau") ?? ""}
          onChange={(e) => appliquerFiltre("niveau", e.target.value)}
        >
          <option value="">Tous les niveaux</option>
          <option value="bas">Stock bas / rupture</option>
          <option value="sain">Stock sain</option>
        </select>
      </div>
      </div>
      {filtresActifs.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <span className="text-body-sm text-muted">{filtresActifs.length} filtre{filtresActifs.length > 1 ? "s" : ""} actif{filtresActifs.length > 1 ? "s" : ""}</span>
          {filtresActifs.map(([cle, valeur]) => (
            <button key={cle} type="button" onClick={() => appliquerFiltre(cle, "")} className="focus-ring min-h-9 rounded-badge bg-surface-2 px-3 text-body-sm text-text hover:text-green-text" aria-label={`Retirer le filtre ${cle}`}>
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

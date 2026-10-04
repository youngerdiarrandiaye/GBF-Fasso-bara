"use client";

import { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
import { createClient } from "@/lib/supabase/client";
import type { ProduitAvecStockEntrepot } from "@/lib/supabase/database.types";
import { formatMontant } from "@/lib/format";
import { Badge } from "@/components/ui/Badge";
import { StockGauge } from "@/components/ui/StockGauge";

/**
 * Extrait la quantité/le seuil de `stock_entrepot` pour UN entrepôt précis à
 * partir d'un produit enrichi par la jointure filtrée (0 ou 1 ligne, cf.
 * `ProduitAvecStockEntrepot`). Exporté pour être réutilisé par
 * NouvelleFactureForm (ajout d'une ligne : `stock_disponible` doit venir de
 * CET entrepôt, jamais de `produits.quantite_stock`, désormais dépréciée —
 * règle 16, migration 0013).
 */
export function stockPourEntrepot(
  produit: ProduitAvecStockEntrepot,
  entrepotId: string
): { quantiteStock: number; seuilAlerte: number } {
  const ligne = produit.stock_entrepot.find((s) => s.entrepot_id === entrepotId);
  return { quantiteStock: ligne?.quantite_stock ?? 0, seuilAlerte: ligne?.seuil_alerte ?? 0 };
}

/**
 * Ajout de ligne produit — recherche code/nom avec autocomplétion (docs
 * §6.2). Règle métier 16 (0013_avenant_credit_entrepots.sql) : le stock
 * affiché est scopé à `entrepotId` (jointure `stock_entrepot` filtrée côté
 * requête), jamais lu depuis `produits.quantite_stock`/`seuil_alerte`
 * (colonnes désormais dépréciées, gelées en base — cf. en-tête de la
 * migration 0013). Recherche désactivée tant qu'aucun entrepôt n'est
 * sélectionné : il n'existe pas de "stock sans entrepôt" à afficher.
 */
export function ProduitAutocomplete({
  entrepotId,
  onSelect,
}: {
  entrepotId: string | null;
  onSelect: (produit: ProduitAvecStockEntrepot) => void;
}) {
  const [query, setQuery] = useState("");
  const [resultats, setResultats] = useState<ProduitAvecStockEntrepot[]>([]);
  const [ouvert, setOuvert] = useState(false);
  const [chargement, setChargement] = useState(false);
  const [erreurRecherche, setErreurRecherche] = useState(false);
  const [rechercheChargee, setRechercheChargee] = useState<string | null>(null);
  const cleRecherche = `${entrepotId ?? ""}:${query}`;
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!entrepotId) {
      return;
    }
    let actif = true;
    const timeout = setTimeout(async () => {
      setChargement(true);
      setErreurRecherche(false);
      const supabase = createClient();
      let recherche = supabase
        .from("produits")
        .select(
          "id, code, nom, description, categorie_id, unite, prix_unitaire, type_ligne_produit, kit_parent_id, photos_urls, actif, created_at, updated_at, stock_entrepot(quantite_stock, seuil_alerte, entrepot_id)"
        )
        // Filtre embarqué (pas `!inner`) : ne restreint QUE le tableau
        // `stock_entrepot` renvoyé par produit, jamais la liste des produits
        // elle-même — un produit jamais stocké dans cet entrepôt doit rester
        // trouvable (stock conventionnellement 0), pas disparaître de la
        // recherche.
        .eq("stock_entrepot.entrepot_id", entrepotId);
      const terme = query.trim().replace(/[,()%_*]/g, " ").trim();
      if (terme) recherche = recherche.or(`nom.ilike.%${terme}%,code.ilike.%${terme}%`);
      const { data, error: erreur } = await recherche.order("nom", { ascending: true }).limit(8);
      if (!actif) return;
      setResultats(erreur ? [] : (data as unknown as ProduitAvecStockEntrepot[]) ?? []);
      setErreurRecherche(!!erreur);
      setRechercheChargee(`${entrepotId}:${query}`);
      setChargement(false);
    }, 200);
    return () => { actif = false; clearTimeout(timeout); };
  }, [query, entrepotId]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOuvert(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative flex flex-col gap-1.5">
      <label htmlFor="recherche-produit" className="text-body font-medium text-text">
        Ajouter un produit
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true">
          <FontAwesomeIcon icon={faMagnifyingGlass} className="h-4 w-4" />
        </span>
        <input
          id="recherche-produit"
          value={query}
          disabled={!entrepotId}
          onChange={(e) => {
            setQuery(e.target.value);
            setOuvert(true);
          }}
          onFocus={() => setOuvert(true)}
          placeholder={entrepotId ? "Code ou nom du produit..." : "Sélectionnez d'abord un entrepôt..."}
          className="focus-ring h-tap w-full rounded-input border border-border bg-surface pl-9 pr-3 text-body text-text disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-muted"
          autoComplete="off"
        />
      </div>

      {(ouvert || !query.trim()) && entrepotId && (
        <div className="mt-1 w-full overflow-hidden rounded-input border border-border bg-surface" aria-live="polite" aria-busy={chargement || rechercheChargee !== cleRecherche}>
          {!query.trim() && <p className="px-3 pt-3 text-body-sm font-medium text-muted">Touchez un produit pour l’ajouter · recherchez pour en voir d’autres</p>}
          {(chargement || rechercheChargee !== cleRecherche) && <p className="px-3 py-3 text-body-sm text-muted">Recherche...</p>}
          {!chargement && rechercheChargee === cleRecherche && erreurRecherche && <p className="px-3 py-3 text-body-sm text-red-text">Impossible de charger les produits. Réessayez en recherchant un nom.</p>}
          {!chargement && rechercheChargee === cleRecherche && !erreurRecherche && resultats.length === 0 && (
            <p className="px-3 py-3 text-body-sm text-muted">{query.trim() ? `Aucun produit trouvé pour « ${query} ».` : "Aucun produit disponible."}</p>
          )}
          {!chargement && rechercheChargee === cleRecherche &&
            resultats.map((produit) => {
              const { quantiteStock, seuilAlerte } = stockPourEntrepot(produit, entrepotId);
              return (
                <button
                  key={produit.id}
                  type="button"
                  onClick={() => {
                    onSelect(produit);
                    setQuery("");
                    setOuvert(false);
                  }}
                  className="focus-ring flex min-h-tap w-full items-center justify-between gap-3 border-b border-border px-3 py-2 text-left last:border-b-0 hover:bg-surface-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body text-text">
                      {produit.nom}{" "}
                      <span className="font-mono text-body-sm text-muted">({produit.code})</span>
                    </p>
                    <div className="mt-1 max-w-[160px]">
                      <StockGauge
                        quantiteStock={quantiteStock}
                        seuilAlerte={seuilAlerte}
                        unite={produit.unite}
                        compact
                      />
                    </div>
                  </div>
                  {produit.type_ligne_produit === "inclus_dans_kit" ? (
                    <Badge tone="blue">Inclus dans kit</Badge>
                  ) : (
                    <span className="shrink-0 font-mono text-body text-text">
                      {formatMontant(produit.prix_unitaire ?? 0)}
                    </span>
                  )}
                </button>
              );
            })}
        </div>
      )}
    </div>
  );
}

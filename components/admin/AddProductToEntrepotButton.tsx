"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { StockEntrepotAdjustModal } from "@/components/admin/StockEntrepotAdjustModal";

export interface ProduitSansStockOption {
  id: string;
  code: string;
  nom: string;
  unite: string;
}

/**
 * Première mise en stock d'un produit dans un entrepôt (`stock_entrepot` n'a
 * pas encore de ligne pour ce couple produit/entrepôt) — réutilise
 * `StockEntrepotAdjustModal` avec `quantiteActuelle=0` : la RPC
 * `ajuster_stock_manuel_entrepot` fait un upsert défensif (migration 0013
 * section 15.1), donc le même chemin d'écriture (motif obligatoire) couvre
 * aussi bien l'ajustement d'un stock existant que sa toute première saisie.
 */
export function AddProductToEntrepotButton({
  entrepotId,
  entrepotNom,
  produitsSansStock,
}: {
  entrepotId: string;
  entrepotNom: string;
  produitsSansStock: ProduitSansStockOption[];
}) {
  const [ouvertChoix, setOuvertChoix] = useState(false);
  const [ouvertAjustement, setOuvertAjustement] = useState(false);
  const [produitId, setProduitId] = useState("");

  const produitChoisi = produitsSansStock.find((p) => p.id === produitId) ?? null;

  return (
    <>
      <Button variant="outline" onClick={() => setOuvertChoix(true)}>
        + Ajouter un produit à cet entrepôt
      </Button>

      <Modal open={ouvertChoix} onClose={() => setOuvertChoix(false)} title="Ajouter un produit à cet entrepôt">
        <div className="flex flex-col gap-4">
          {produitsSansStock.length === 0 ? (
            <InlineAlert tone="blue">Tous les produits actifs ont déjà une ligne de stock dans cet entrepôt.</InlineAlert>
          ) : (
            <>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="produit-a-ajouter" className="text-body font-medium text-text">
                  Produit
                </label>
                <select
                  id="produit-a-ajouter"
                  value={produitId}
                  onChange={(e) => setProduitId(e.target.value)}
                  className="focus-ring h-tap w-full rounded-input border border-border bg-surface px-3 text-body text-text"
                >
                  <option value="">Sélectionnez un produit...</option>
                  {produitsSansStock.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nom} ({p.code})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end">
                <Button
                  type="button"
                  disabled={!produitId}
                  onClick={() => {
                    setOuvertChoix(false);
                    setOuvertAjustement(true);
                  }}
                >
                  Continuer
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>

      {produitChoisi && (
        <StockEntrepotAdjustModal
          produitId={produitChoisi.id}
          produitNom={produitChoisi.nom}
          produitCode={produitChoisi.code}
          unite={produitChoisi.unite}
          entrepotId={entrepotId}
          entrepotNom={entrepotNom}
          quantiteActuelle={0}
          open={ouvertAjustement}
          onClose={() => {
            setOuvertAjustement(false);
            setProduitId("");
          }}
        />
      )}
    </>
  );
}

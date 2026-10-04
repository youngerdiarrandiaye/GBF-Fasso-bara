"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { NumberInput } from "@/components/ui/NumberInput";
import { EntrepotSelector } from "@/components/ui/EntrepotSelector";
import { useToast } from "@/components/ui/Toast";
import { ProduitSimpleSelect, type ProduitSimpleOption } from "@/components/admin/ProduitSimpleSelect";
import { creerDemandeTransfert } from "@/lib/actions/transferts";
import type { EntrepotRow } from "@/lib/supabase/database.types";

/**
 * Formulaire "Nouvelle demande de transfert" — docs/design-system.md §5.8/
 * §6.26 : DEUX `EntrepotSelector` simultanés (source/destination) avec
 * exclusion croisée visuelle (le chip sélectionné côté source devient
 * "Exclu" côté destination, et réciproquement) — donne un retour AVANT
 * l'échec serveur (contrainte `entrepot_source_id <> entrepot_destination_id`,
 * migration 0013 section 4). Confirmation redondante au point de validation
 * (libellé du bouton), non optionnelle (§6.26).
 */
export function TransfertForm({
  entrepots,
  produits,
  stockParProduit,
  onSuccess,
}: {
  entrepots: EntrepotRow[];
  produits: ProduitSimpleOption[];
  /** Quantité en stock par produit puis par entrepôt (`stock_entrepot` complet, précalculé côté page) — alimente le `stockHint` de `EntrepotSelector` (§6.26) sans requête supplémentaire à chaque changement de produit. */
  stockParProduit?: Record<string, Record<string, number>>;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [produitId, setProduitId] = useState("");
  const [source, setSource] = useState<string | null>(null);
  const [destination, setDestination] = useState<string | null>(null);
  const [quantite, setQuantite] = useState(1);
  const [notes, setNotes] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const produitChoisi = useMemo(() => produits.find((p) => p.id === produitId) ?? null, [produits, produitId]);
  const stockHints = useMemo(() => stockParProduit?.[produitId] ?? {}, [stockParProduit, produitId]);
  const nomSource = entrepots.find((e) => e.id === source)?.nom;
  const nomDestination = entrepots.find((e) => e.id === destination)?.nom;

  const pretASoumettre = !!produitId && !!source && !!destination && quantite > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!source || !destination) return;
    setErreur(null);
    setEnCours(true);

    const resultat = await creerDemandeTransfert({
      produit_id: produitId,
      entrepot_source_id: source,
      entrepot_destination_id: destination,
      quantite,
      notes,
    });

    setEnCours(false);

    if (resultat.error || !resultat.data) {
      setErreur(resultat.error ?? "Erreur inconnue.");
      return;
    }

    showToast(
      `Demande de transfert créée : ${produitChoisi?.nom ?? "produit"} — ${nomSource} → ${nomDestination}.`,
      "success"
    );
    router.refresh();
    onSuccess?.();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      {erreur && <InlineAlert tone="red">{erreur}</InlineAlert>}

      <ProduitSimpleSelect
        id="transfert-produit"
        label="Produit"
        produits={produits}
        value={produitId}
        onChange={setProduitId}
      />

      <EntrepotSelector
        label="Entrepôt source"
        entrepots={entrepots}
        value={source}
        onChange={setSource}
        excludedId={destination}
        stockHints={stockHints}
        unite={produitChoisi?.unite}
      />

      <EntrepotSelector
        label="Entrepôt destination"
        entrepots={entrepots}
        value={destination}
        onChange={setDestination}
        excludedId={source}
        stockHints={stockHints}
        unite={produitChoisi?.unite}
      />

      <NumberInput label="Quantité à transférer" value={quantite} onChange={setQuantite} min={0.01} step={1} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="transfert-notes" className="text-body font-medium text-text">
          Notes (optionnel)
        </label>
        <textarea
          id="transfert-notes"
          rows={2}
          className="focus-ring w-full rounded-input border border-border bg-surface px-3 py-2 text-body text-text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <div className="flex justify-end">
        <Button type="submit" loading={enCours} disabled={!pretASoumettre}>
          {nomSource && nomDestination
            ? `Créer la demande — ${nomSource} → ${nomDestination}`
            : "Créer la demande de transfert"}
        </Button>
      </div>
    </form>
  );
}

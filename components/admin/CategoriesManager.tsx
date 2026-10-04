"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { useToast } from "@/components/ui/Toast";
import { creerCategorie, supprimerCategorie } from "@/lib/actions/produits";
import type { CategorieProduitRow } from "@/lib/supabase/database.types";

export function CategoriesManager({ categories }: { categories: CategorieProduitRow[] }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [nom, setNom] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [suppressionEnCours, setSuppressionEnCours] = useState<string | null>(null);

  async function handleAjouter() {
    setErreur(null);
    if (nom.trim().length < 2) {
      setErreur("Le nom de la catégorie doit contenir au moins 2 caractères.");
      return;
    }
    setEnCours(true);
    const resultat = await creerCategorie({ nom });
    setEnCours(false);

    if (resultat.error) {
      setErreur(resultat.error);
      return;
    }

    showToast(`Catégorie "${nom}" créée.`, "success");
    setNom("");
    router.refresh();
  }

  async function handleSupprimer(categorie: CategorieProduitRow) {
    setSuppressionEnCours(categorie.id);
    const resultat = await supprimerCategorie(categorie.id);
    setSuppressionEnCours(null);

    if (resultat.error) {
      showToast(resultat.error, "error");
      return;
    }
    showToast(`Catégorie "${categorie.nom}" supprimée.`, "success");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {erreur && <InlineAlert tone="red">{erreur}</InlineAlert>}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Input
            label="Nouvelle catégorie"
            placeholder="Ex : Pompes, Tuyaux, Kits d'irrigation..."
            value={nom}
            onChange={(e) => setNom(e.target.value)}
          />
        </div>
        <Button type="button" onClick={handleAjouter} loading={enCours}>
          Ajouter
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {categories.length === 0 ? (
          <p className="text-body-sm text-muted">Aucune catégorie créée pour le moment.</p>
        ) : (
          categories.map((c) => (
            <span
              key={c.id}
              className="badge-pastel-neutral inline-flex items-center gap-2 rounded-badge px-3 py-1.5 text-body-sm"
            >
              {c.nom}
              <button
                type="button"
                onClick={() => handleSupprimer(c)}
                disabled={suppressionEnCours === c.id}
                className="focus-ring text-muted hover:text-red-text disabled:opacity-40"
                aria-label={`Supprimer ${c.nom}`}
              >
                ×
              </button>
            </span>
          ))
        )}
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { produitSchema, type ProduitInput } from "@/lib/validations/schemas";
import { creerProduit, modifierProduit } from "@/lib/actions/produits";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { useToast } from "@/components/ui/Toast";
import { ProductPhotosUploader } from "@/components/admin/ProductPhotosUploader";
import type { CategorieProduitRow, ProduitRow } from "@/lib/supabase/database.types";

const UNITES = [
  { value: "piece", label: "Pièce" },
  { value: "kit", label: "Kit" },
  { value: "metre", label: "Mètre" },
  { value: "rouleau", label: "Rouleau" },
  { value: "forfait", label: "Forfait" },
] as const;

export function ProductForm({
  categories,
  kitsDisponibles,
  produit,
}: {
  categories: CategorieProduitRow[];
  kitsDisponibles: Pick<ProduitRow, "id" | "nom" | "code" | "actif">[];
  produit?: ProduitRow;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [erreurServeur, setErreurServeur] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ProduitInput>({
    resolver: zodResolver(produitSchema),
    defaultValues: produit
      ? {
          code: produit.code,
          nom: produit.nom,
          description: produit.description ?? "",
          categorie_id: produit.categorie_id ?? "",
          unite: produit.unite,
          type_ligne_produit: produit.type_ligne_produit,
          kit_parent_id: produit.kit_parent_id ?? "",
          prix_unitaire: produit.prix_unitaire ?? 0,
          quantite_stock: produit.quantite_stock,
          seuil_alerte: produit.seuil_alerte,
          photos_urls: produit.photos_urls,
          actif: produit.actif,
        }
      : {
          type_ligne_produit: "vendu_separement",
          unite: "piece",
          quantite_stock: 0,
          seuil_alerte: 0,
          photos_urls: [],
          actif: true,
        },
  });

  const typeLigne = useWatch({ control, name: "type_ligne_produit" });
  const kitParentId = useWatch({ control, name: "kit_parent_id" });
  const photosUrls = useWatch({ control, name: "photos_urls" }) ?? [];

  const kitParentSelectionne = kitsDisponibles.find((k) => k.id === kitParentId);

  async function onSubmit(values: ProduitInput) {
    setErreurServeur(null);
    const resultat = produit
      ? await modifierProduit(produit.id, values)
      : await creerProduit(values);

    if (resultat.error || !resultat.data) {
      setErreurServeur(resultat.error ?? "Erreur inconnue.");
      return;
    }

    showToast(
      produit ? `Produit "${values.nom}" mis à jour.` : `Produit "${values.nom}" créé.`,
      "success"
    );
    router.push(`/admin/stock/${resultat.data.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
      {erreurServeur && <InlineAlert tone="red">{erreurServeur}</InlineAlert>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <span className="text-body font-medium text-text">Code produit</span>
          {produit ? (
            <div className="flex h-tap items-center rounded-input border border-border bg-surface-2 px-3 font-mono text-body text-muted">
              {produit.code}
            </div>
          ) : (
            <div className="flex h-tap items-center rounded-input border border-dashed border-border bg-surface-2 px-3 text-body-sm text-muted">
              Généré automatiquement (format GBF-XX)
            </div>
          )}
        </div>
        <Input label="Nom du produit" error={errors.nom?.message} {...register("nom")} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="description" className="text-body font-medium text-text">
          Description
        </label>
        <textarea
          id="description"
          rows={3}
          className="focus-ring w-full rounded-input border border-border bg-surface px-3 py-2 text-body text-text"
          {...register("description")}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="categorie_id" className="text-body font-medium text-text">
            Catégorie
          </label>
          <select
            id="categorie_id"
            className="focus-ring h-tap w-full rounded-input border border-border bg-surface px-3 text-body text-text"
            {...register("categorie_id")}
          >
            <option value="">Aucune catégorie</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="unite" className="text-body font-medium text-text">
            Unité
          </label>
          <select
            id="unite"
            className="focus-ring h-tap w-full rounded-input border border-border bg-surface px-3 text-body text-text"
            {...register("unite")}
          >
            {UNITES.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-body font-medium text-text">Type de ligne produit</label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="focus-within:ring-2 flex flex-1 cursor-pointer items-center gap-2 rounded-input border border-border bg-surface px-3 py-2.5">
            <input type="radio" value="vendu_separement" {...register("type_ligne_produit")} />
            <span className="text-body text-text">Vendu séparément</span>
          </label>
          <label className="focus-within:ring-2 flex flex-1 cursor-pointer items-center gap-2 rounded-input border border-border bg-surface px-3 py-2.5">
            <input type="radio" value="inclus_dans_kit" {...register("type_ligne_produit")} />
            <span className="text-body text-text">Inclus dans un kit</span>
          </label>
        </div>
        <p className="text-body-sm text-muted">
          Un produit &quot;inclus dans un kit&quot; n&apos;a pas de prix propre : il apparaît avec
          un badge &quot;Inclus&quot; sur les factures (docs/design-system.md §5.2).
        </p>
      </div>

      {typeLigne === "inclus_dans_kit" ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="kit_parent_id" className="text-body font-medium text-text">
            Produit kit parent
          </label>
          <select
            id="kit_parent_id"
            className="focus-ring h-tap w-full rounded-input border border-border bg-surface px-3 text-body text-text"
            {...register("kit_parent_id")}
          >
            <option value="">Sélectionner le kit parent</option>
            {kitsDisponibles.map((k) => (
              <option key={k.id} value={k.id}>
                {k.nom} ({k.code}){!k.actif ? " — inactif" : ""}
              </option>
            ))}
          </select>
          {typeLigne === "inclus_dans_kit" && kitParentSelectionne && !kitParentSelectionne.actif && (
            <InlineAlert tone="amber">
              Le produit parent &quot;{kitParentSelectionne.nom}&quot; est désactivé. Cet accessoire
              peut avoir un usage résiduel : vérifiez si ce lien est toujours pertinent.
            </InlineAlert>
          )}
        </div>
      ) : (
        <Input
          label="Prix unitaire (FCFA)"
          type="number"
          step="0.01"
          error={errors.prix_unitaire?.message}
          {...register("prix_unitaire", { valueAsNumber: true })}
        />
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {!produit && (
          <Input
            label="Quantité en stock initiale"
            type="number"
            step="0.01"
            error={errors.quantite_stock?.message}
            {...register("quantite_stock", { valueAsNumber: true })}
          />
        )}
        <Input
          label="Seuil d'alerte"
          type="number"
          step="0.01"
          hint="Déclenche une alerte de stock bas si la quantité descend à ce niveau ou en dessous."
          error={errors.seuil_alerte?.message}
          {...register("seuil_alerte", { valueAsNumber: true })}
        />
      </div>

      {produit && (
        <InlineAlert tone="blue">
          Pour modifier la quantité en stock, utilisez le bouton &quot;Ajuster le stock&quot; sur la
          fiche produit (motif obligatoire, traçabilité garantie).
        </InlineAlert>
      )}

      <ProductPhotosUploader
        photosUrls={photosUrls}
        onChange={(urls) => setValue("photos_urls", urls, { shouldDirty: true })}
      />

      <label className="flex items-center gap-2">
        <input type="checkbox" className="h-5 w-5 rounded-input" {...register("actif")} />
        <span className="text-body text-text">Produit actif (visible côté Espace Agent)</span>
      </label>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Annuler
        </Button>
        <Button type="submit" loading={isSubmitting}>
          {produit ? "Enregistrer les modifications" : "Créer le produit"}
        </Button>
      </div>
    </form>
  );
}

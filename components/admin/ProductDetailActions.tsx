"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { StockAdjustModal } from "@/components/admin/StockAdjustModal";
import { desactiverProduit, reactiverProduit } from "@/lib/actions/produits";
import type { ProduitRow } from "@/lib/supabase/database.types";

export function ProductDetailActions({ produit }: { produit: ProduitRow }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [modalOuvert, setModalOuvert] = useState(false);
  const [enCoursStatut, setEnCoursStatut] = useState(false);

  async function handleToggleActif() {
    setEnCoursStatut(true);

    if (produit.actif) {
      const resultat = await desactiverProduit(produit.id);
      setEnCoursStatut(false);

      if (resultat.error || !resultat.data) {
        showToast(resultat.error ?? "Erreur inconnue.", "error");
        return;
      }

      if (resultat.data.nombreFactures > 0) {
        showToast(
          `Ce produit est utilisé dans ${resultat.data.nombreFactures} factures — il sera désactivé, pas supprimé, pour préserver l'historique`,
          "info"
        );
      } else {
        showToast(`Produit "${produit.nom}" désactivé.`, "success");
      }
      router.refresh();
      return;
    }

    const resultat = await reactiverProduit(produit.id);
    setEnCoursStatut(false);

    if (resultat.error) {
      showToast(resultat.error, "error");
      return;
    }
    showToast(`Produit "${produit.nom}" réactivé.`, "success");
    router.refresh();
  }

  return (
    <div className="flex flex-wrap gap-3">
      <Button onClick={() => setModalOuvert(true)}>Ajuster le stock</Button>
      <Link href={`/admin/stock/${produit.id}/modifier`}>
        <Button variant="outline">Modifier la fiche</Button>
      </Link>
      <Button
        variant={produit.actif ? "destructive" : "secondary"}
        onClick={handleToggleActif}
        loading={enCoursStatut}
      >
        {produit.actif ? "Désactiver" : "Réactiver"}
      </Button>
      <StockAdjustModal produit={produit} open={modalOuvert} onClose={() => setModalOuvert(false)} />
    </div>
  );
}

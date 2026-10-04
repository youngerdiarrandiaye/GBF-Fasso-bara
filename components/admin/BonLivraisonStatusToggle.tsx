"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { changerStatutBonLivraison } from "@/lib/actions/bons-livraison";
import type { StatutBonLivraison } from "@/lib/supabase/database.types";

/**
 * Bascule livré-non-payé <-> livré-payé — décision d'UX non spécifiée par le
 * brief (§6.28 ne couvre que le badge, pas l'action de changement de statut).
 * Un simple bouton contextuel (pas de modal de confirmation) : contrairement
 * à un ajustement de stock ou une annulation de transfert, ce changement de
 * statut n'a aucun effet sur le stock ni sur un solde financier tiers — il
 * ne fait que documenter un règlement déjà survenu.
 */
export function BonLivraisonStatusToggle({
  bonLivraisonId,
  numero,
  statut,
}: {
  bonLivraisonId: string;
  numero: string;
  statut: StatutBonLivraison;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [enCours, setEnCours] = useState(false);

  const cible: StatutBonLivraison = statut === "livre_non_paye" ? "livre_paye" : "livre_non_paye";
  const libelle = statut === "livre_non_paye" ? "Marquer comme payé" : "Marquer comme non payé";

  async function handleClick() {
    setEnCours(true);
    const resultat = await changerStatutBonLivraison(bonLivraisonId, cible);
    setEnCours(false);

    if (resultat.error) {
      showToast(resultat.error, "error");
      return;
    }

    showToast(
      `Bon de livraison ${numero} marqué ${cible === "livre_paye" ? "livré, payé" : "livré, non payé"}.`,
      "success"
    );
    router.refresh();
  }

  return (
    <Button variant={cible === "livre_paye" ? "primary" : "outline"} onClick={handleClick} loading={enCours}>
      {libelle}
    </Button>
  );
}

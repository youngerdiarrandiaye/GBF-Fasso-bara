"use client";

import { Button } from "@/components/ui/Button";
import { useFacturePdfShare } from "./useFacturePdfShare";

/**
 * Bouton WhatsApp adaptatif compact, pour les lignes de tableau (ex. section
 * "Factures en retard de paiement" du dashboard) — même logique que le
 * bouton correspondant de `FactureActions`, extrait ici pour éviter
 * d'instancier tout `FactureActions` dans une cellule de tableau.
 */
export function QuickWhatsappButton({
  factureId,
  factureNumero,
  clientTelephone,
  totalGeneral,
}: {
  factureId: string;
  factureNumero: string;
  clientTelephone: string | null;
  totalGeneral: number;
}) {
  const { partager, enCours } = useFacturePdfShare();
  const supportePartageNatif = typeof navigator !== "undefined" && !!navigator.canShare;
  const libelle = supportePartageNatif ? "Partager la facture" : "Envoyer le lien par WhatsApp";

  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={() => partager(factureId, factureNumero, clientTelephone, totalGeneral)}
      loading={enCours}
    >
      {libelle}
    </Button>
  );
}

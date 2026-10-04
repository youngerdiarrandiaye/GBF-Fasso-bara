import { NouveauBonLivraisonForm } from "@/components/agent/NouveauBonLivraisonForm";

export const dynamic = "force-dynamic";

/**
 * Écran "Créer un bon de livraison" (règle métier 15, migration 0013) —
 * Espace Agent. Formulaire entièrement client (état local), pas de reprise
 * d'un BL existant : contrairement à une facture, un BL n'a pas de cycle
 * brouillon/validation permettant une édition différée (cf. RLS
 * `lignes_bon_livraison` : aucune policy UPDATE/DELETE pour l'agent, migration
 * 0013 section 6).
 */
export default function NouveauBonLivraisonPage() {
  return <NouveauBonLivraisonForm />;
}

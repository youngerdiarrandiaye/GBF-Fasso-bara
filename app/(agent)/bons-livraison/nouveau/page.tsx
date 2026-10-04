import { NouveauBonLivraisonForm } from "@/components/agent/NouveauBonLivraisonForm";
import { createClient } from "@/lib/supabase/server";
import type { FactureLivraisonOption } from "@/lib/actions/bons-livraison";
import type { StatutFacture } from "@/lib/supabase/database.types";

export const dynamic = "force-dynamic";

/**
 * Écran "Créer un bon de livraison" (règle métier 15, migration 0013) —
 * Espace Agent. Formulaire entièrement client (état local), pas de reprise
 * d'un BL existant : contrairement à une facture, un BL n'a pas de cycle
 * brouillon/validation permettant une édition différée (cf. RLS
 * `lignes_bon_livraison` : aucune policy UPDATE/DELETE pour l'agent, migration
 * 0013 section 6).
 *
 * `?facture=<id>` (bouton « Livrer » de l'accueil) présélectionne une facture
 * de `factures_a_livrer()` (0023) : seules les factures réellement livrables
 * et visibles par l'agent sont acceptées, sinon le formulaire s'ouvre vide.
 */
export default async function NouveauBonLivraisonPage({
  searchParams,
}: {
  searchParams: Promise<{ facture?: string }>;
}) {
  const { facture: factureId } = await searchParams;
  let factureInitiale: FactureLivraisonOption | null = null;

  if (factureId) {
    const supabase = await createClient();
    const { data } = await supabase.rpc("factures_a_livrer");
    const trouvee = (data as { id: string; numero: string; statut: StatutFacture; client_nom: string }[] | null)?.find(
      (f) => f.id === factureId
    );
    if (trouvee) {
      factureInitiale = {
        id: trouvee.id,
        numero: trouvee.numero,
        statut: trouvee.statut,
        client: { nom: trouvee.client_nom },
      };
    }
  }

  return <NouveauBonLivraisonForm factureInitiale={factureInitiale} />;
}

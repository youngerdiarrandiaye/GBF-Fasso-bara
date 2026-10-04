"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { declencherTelechargementPdf } from "@/components/facture/telechargerPdf";

/**
 * Appelle l'Edge Function `generer-facture-pdf` (déjà livrée par
 * dev-backend-edge, cf. supabase/functions/generer-facture-pdf) via le client
 * navigateur standard (anon key + JWT de session, jamais service_role) :
 * `supabase.functions.invoke` attache automatiquement le token de la session
 * courante en en-tête Authorization.
 */
export function GeneratePdfButton({
  factureId,
  factureNumero,
}: {
  factureId: string;
  factureNumero: string;
}) {
  const { showToast } = useToast();
  const [enCours, setEnCours] = useState(false);

  async function handleClick() {
    setEnCours(true);
    const supabase = createClient();
    const { data, error } = await supabase.functions.invoke("generer-facture-pdf", {
      body: { facture_id: factureId },
    });
    setEnCours(false);

    if (error || !data?.pdf_url) {
      showToast("Impossible de générer le PDF de cette facture.", "error");
      return;
    }

    // `handleClick` est async : cette ouverture survient après un `await`,
    // hors du tour de boucle synchrone du geste utilisateur — certains
    // navigateurs (Safari en particulier) la traitent comme un popup non
    // sollicité et la bloquent silencieusement. Le toast succès sert donc
    // aussi de filet de secours, pas seulement de confirmation cosmétique
    // (docs/toast-et-coherence-donnees.md §9 V3.4b).
    declencherTelechargementPdf(data.pdf_url, factureNumero);
    showToast(`Facture ${factureNumero} téléchargée.`, "success");
  }

  return (
    <Button variant="secondary" onClick={handleClick} loading={enCours}>
      Générer le PDF
    </Button>
  );
}

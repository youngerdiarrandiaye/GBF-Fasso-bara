"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useFacturePdfShare } from "./useFacturePdfShare";
import { declencherTelechargementPdf, messageErreurPdf, normaliserUrlFichierLocal } from "./telechargerPdf";
import { envoyerFactureParEmail } from "@/lib/actions/email-facture";
import type { StatutFacture } from "@/lib/supabase/database.types";

const MESSAGE_ECHEC_PDF = "Impossible de générer le PDF de cette facture.";

/**
 * Barre d'actions du détail facture — 3 boutons partageant la même Edge
 * Function `generer-facture-pdf` (cf. components/admin/GeneratePdfButton.tsx
 * pour le pattern d'appel d'origine) : téléchargement, impression, et
 * partage WhatsApp adaptatif (components/facture/useFacturePdfShare.ts).
 * Désactivés tant que la facture est un brouillon (le PDF n'existe pas
 * encore, l'Edge Function retourne 409 dans ce cas).
 */
export function FactureActions({
  factureId,
  factureNumero,
  statut,
  clientTelephone,
  clientEmail,
  totalGeneral,
}: {
  factureId: string;
  factureNumero: string;
  statut: StatutFacture;
  clientTelephone: string | null;
  clientEmail: string | null;
  totalGeneral: number;
}) {
  const { showToast } = useToast();
  const [enCoursTelechargement, setEnCoursTelechargement] = useState(false);
  const [enCoursImpression, setEnCoursImpression] = useState(false);
  const [pdfUrlImpression, setPdfUrlImpression] = useState<string | null>(null);
  const [enCoursEmail, setEnCoursEmail] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { partager, enCours: enCoursPartage } = useFacturePdfShare();

  const desactive = statut === "brouillon";
  // Détection synchrone au render — le libellé ne doit pas attendre un appel
  // réseau pour être décidé.
  const supportePartageNatif = typeof navigator !== "undefined" && !!navigator.canShare;
  const libelleWhatsapp = supportePartageNatif ? "Partager" : "WhatsApp";

  async function telecharger() {
    setEnCoursTelechargement(true);
    const supabase = createClient();
    const { data, error } = await supabase.functions.invoke("generer-facture-pdf", {
      body: { facture_id: factureId },
    });
    setEnCoursTelechargement(false);

    if (error || !data?.pdf_url) {
      showToast(messageErreurPdf(error, MESSAGE_ECHEC_PDF), "error");
      return;
    }

    declencherTelechargementPdf(data.pdf_url, factureNumero);
    showToast(`Facture ${factureNumero} téléchargée.`, "success");
  }

  async function imprimer() {
    setEnCoursImpression(true);
    const supabase = createClient();
    const { data, error } = await supabase.functions.invoke("generer-facture-pdf", {
      body: { facture_id: factureId },
    });
    setEnCoursImpression(false);

    if (error || !data?.pdf_url) {
      showToast(messageErreurPdf(error, MESSAGE_ECHEC_PDF), "error");
      return;
    }

    setPdfUrlImpression(normaliserUrlFichierLocal(data.pdf_url));
  }

  async function envoyerEmail() {
    if (!clientEmail) return;
    if (!window.confirm(`Envoyer ${factureNumero} par e-mail à ${clientEmail} ?`)) return;
    setEnCoursEmail(true);
    const resultat = await envoyerFactureParEmail(factureId);
    setEnCoursEmail(false);
    if (resultat.error || !resultat.data) {
      showToast(resultat.error ?? "L'e-mail n'a pas pu être envoyé.", "error");
      return;
    }
    showToast(`${factureNumero} envoyée à ${resultat.data.destinataire}.`, "success");
  }

  function handleIframeLoad() {
    if (!pdfUrlImpression) return;
    iframeRef.current?.contentWindow?.print();
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-3">
      <Button
        variant="secondary"
        className="w-full sm:w-auto"
        onClick={telecharger}
        loading={enCoursTelechargement}
        disabled={desactive}
      >
        Télécharger
      </Button>
      <Button
        variant="secondary"
        className="w-full sm:w-auto"
        onClick={imprimer}
        loading={enCoursImpression}
        disabled={desactive}
      >
        Imprimer
      </Button>
      <Button
        variant="secondary"
        className="w-full sm:w-auto"
        onClick={() => partager(factureId, factureNumero, clientTelephone, totalGeneral)}
        loading={enCoursPartage}
        disabled={desactive}
      >
        {libelleWhatsapp}
      </Button>
      <Button
        variant="secondary"
        className="w-full sm:w-auto"
        onClick={envoyerEmail}
        loading={enCoursEmail}
        disabled={desactive || statut === "annulee" || !clientEmail}
        title={clientEmail ? undefined : "Ajoutez l'e-mail du client sur sa fiche pour l'envoyer."}
      >
        E-mail
      </Button>

      {pdfUrlImpression && (
        <iframe
          ref={iframeRef}
          src={pdfUrlImpression}
          style={{ display: "none" }}
          onLoad={handleIframeLoad}
          title={`Impression facture ${factureNumero}`}
        />
      )}
    </div>
  );
}


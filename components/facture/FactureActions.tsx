"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useFacturePdfShare } from "./useFacturePdfShare";
import { declencherTelechargementPdf, normaliserUrlFichierLocal } from "./telechargerPdf";
import type { StatutFacture } from "@/lib/supabase/database.types";

const MESSAGE_ECHEC_PDF = "Impossible de gÃ©nÃ©rer le PDF de cette facture.";

/**
 * Barre d'actions du dÃ©tail facture â€” 3 boutons partageant la mÃªme Edge
 * Function `generer-facture-pdf` (cf. components/admin/GeneratePdfButton.tsx
 * pour le pattern d'appel d'origine) : tÃ©lÃ©chargement, impression, et
 * partage WhatsApp adaptatif (components/facture/useFacturePdfShare.ts).
 * DÃ©sactivÃ©s tant que la facture est un brouillon (le PDF n'existe pas
 * encore, l'Edge Function retourne 409 dans ce cas).
 */
export function FactureActions({
  factureId,
  factureNumero,
  statut,
  clientTelephone,
  totalGeneral,
}: {
  factureId: string;
  factureNumero: string;
  statut: StatutFacture;
  clientTelephone: string | null;
  totalGeneral: number;
}) {
  const { showToast } = useToast();
  const [enCoursTelechargement, setEnCoursTelechargement] = useState(false);
  const [enCoursImpression, setEnCoursImpression] = useState(false);
  const [pdfUrlImpression, setPdfUrlImpression] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { partager, enCours: enCoursPartage } = useFacturePdfShare();

  const desactive = statut === "brouillon";
  // DÃ©tection synchrone au render â€” le libellÃ© ne doit pas attendre un appel
  // rÃ©seau pour Ãªtre dÃ©cidÃ©.
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
      showToast(MESSAGE_ECHEC_PDF, "error");
      return;
    }

    declencherTelechargementPdf(data.pdf_url, factureNumero);
    showToast(`Facture ${factureNumero} tÃ©lÃ©chargÃ©e.`, "success");
  }

  async function imprimer() {
    setEnCoursImpression(true);
    const supabase = createClient();
    const { data, error } = await supabase.functions.invoke("generer-facture-pdf", {
      body: { facture_id: factureId },
    });
    setEnCoursImpression(false);

    if (error || !data?.pdf_url) {
      showToast(MESSAGE_ECHEC_PDF, "error");
      return;
    }

    setPdfUrlImpression(normaliserUrlFichierLocal(data.pdf_url));
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
        TÃ©lÃ©charger
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


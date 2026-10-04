"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/Toast";
import { normaliserTelephoneSenegal, construireMessageWhatsapp } from "@/lib/format";
import { messageErreurPdf, normaliserUrlFichierLocal } from "./telechargerPdf";

const MESSAGE_TELEPHONE_INVALIDE =
  "Numéro de téléphone du client manquant ou invalide — impossible de préparer l'envoi";
const MESSAGE_PARTAGE_OUVERT = "Fenêtre de partage WhatsApp ouverte";
const MESSAGE_ECHEC_PDF = "Impossible de générer le PDF de cette facture.";
const MESSAGE_ECHEC_PARTAGE = "Impossible de partager la facture.";
const MESSAGE_POPUP_BLOQUE =
  "WhatsApp a été bloqué par le navigateur. Autorisez les fenêtres contextuelles puis réessayez.";

function supportePartageDeFichier(): boolean {
  if (typeof navigator === "undefined" || !navigator.share || !navigator.canShare) return false;

  try {
    const fichierTest = new File([""], "facture.pdf", { type: "application/pdf" });
    return navigator.canShare({ files: [fichierTest] });
  } catch {
    return false;
  }
}

/**
 * Hook client partagé entre le bouton d'actions du détail facture et
 * l'action rapide du dashboard — évite de dupliquer la logique de
 * génération de PDF + partage WhatsApp (Web Share API si disponible, sinon
 * lien `wa.me`) à plusieurs endroits.
 *
 * L'app ne peut jamais garantir une réception réelle par le client : le
 * toast de succès confirme uniquement l'ouverture de la fenêtre de partage,
 * jamais "Facture envoyée au client".
 */
export function useFacturePdfShare() {
  const { showToast } = useToast();
  const [enCours, setEnCours] = useState(false);

  async function partager(
    factureId: string,
    factureNumero: string,
    clientTelephone: string | null,
    totalGeneral: number
  ) {
    const partageNatif = supportePartageDeFichier();
    const numeroNormalise = normaliserTelephoneSenegal(clientTelephone);

    // Sans partage natif de fichier, WhatsApp exige un destinataire valide.
    // Cette vérification précède la génération afin de ne pas lancer un job
    // PDF inutile quand la fiche client doit d'abord être corrigée.
    if (!partageNatif && !numeroNormalise) {
      showToast(MESSAGE_TELEPHONE_INVALIDE, "error");
      return;
    }

    // L'ouverture doit rester dans le geste synchrone du clic. Si elle avait
    // lieu après l'appel réseau, Safari/Chrome pourraient la bloquer comme
    // popup. La page WhatsApp est injectée dans cette fenêtre une fois le PDF
    // prêt ; l'utilisateur voit entre-temps un écran de préparation neutre.
    const fenetreWhatsapp = partageNatif ? null : window.open("about:blank", "partage-facture-whatsapp");
    if (!partageNatif && !fenetreWhatsapp) {
      showToast(MESSAGE_POPUP_BLOQUE, "error");
      return;
    }
    if (fenetreWhatsapp) {
      fenetreWhatsapp.opener = null;
      fenetreWhatsapp.document.title = "Préparation de la facture…";
      fenetreWhatsapp.document.body.textContent = "Préparation de la facture pour WhatsApp…";
    }

    setEnCours(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.functions.invoke("generer-facture-pdf", {
        body: { facture_id: factureId },
      });

      if (error || !data?.pdf_url) {
        fenetreWhatsapp?.close();
        showToast(messageErreurPdf(error, MESSAGE_ECHEC_PDF), "error");
        return;
      }

      const pdfUrl = normaliserUrlFichierLocal(data.pdf_url);

      if (partageNatif) {
        try {
          const reponse = await fetch(pdfUrl);
          if (!reponse.ok) throw new Error(`PDF inaccessible (${reponse.status})`);
          const blob = await reponse.blob();
          const fichier = new File([blob], `${factureNumero}.pdf`, { type: "application/pdf" });

          if (navigator.canShare({ files: [fichier] })) {
            try {
              await navigator.share({
                files: [fichier],
                title: `Facture ${factureNumero}`,
                text: construireMessageWhatsapp(factureNumero, totalGeneral, pdfUrl),
              });
              showToast(MESSAGE_PARTAGE_OUVERT, "success");
              return;
            } catch (erreurPartage) {
              // Annulation silencieuse : l'utilisateur a fermé la feuille de
              // partage, ce n'est pas un échec.
              if (erreurPartage instanceof Error && erreurPartage.name === "AbortError") {
                return;
              }
              showToast(MESSAGE_ECHEC_PARTAGE, "error");
              return;
            }
          }
        } catch {
          // Échec de récupération/construction du fichier à partager : on
          // se rabat silencieusement sur le lien wa.me ci-dessous.
        }
      }

      if (!numeroNormalise) {
        fenetreWhatsapp?.close();
        showToast(MESSAGE_TELEPHONE_INVALIDE, "error");
        return;
      }

      const message = construireMessageWhatsapp(factureNumero, totalGeneral, pdfUrl);
      const url = `https://wa.me/${numeroNormalise}?text=${encodeURIComponent(message)}`;
      if (fenetreWhatsapp && !fenetreWhatsapp.closed) {
        fenetreWhatsapp.location.replace(url);
      } else {
        const nouvelleFenetre = window.open(url, "_blank", "noopener,noreferrer");
        if (!nouvelleFenetre) {
          showToast(MESSAGE_POPUP_BLOQUE, "error");
          return;
        }
      }
      showToast(MESSAGE_PARTAGE_OUVERT, "success");
    } catch {
      fenetreWhatsapp?.close();
      showToast(MESSAGE_ECHEC_PARTAGE, "error");
    } finally {
      setEnCours(false);
    }
  }

  return { partager, enCours };
}



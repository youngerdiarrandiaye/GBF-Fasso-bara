"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { supabaseServerFetch } from "@/lib/supabase/server-fetch";
import { formatDate, formatMontant } from "@/lib/format";
import { messageErreurPdf, normaliserUrlFichierLocal } from "@/components/facture/telechargerPdf";

/**
 * Envoi d'une facture (ou proforma) au client par e-mail, PDF en pièce jointe.
 *
 * Fournisseur : Resend (API HTTP, aucune dépendance npm). Variables serveur,
 * sans préfixe NEXT_PUBLIC_ :
 *   - RESEND_API_KEY     clé API Resend ;
 *   - EMAIL_EXPEDITEUR   ex. "GFB-STOCK <factures@votre-domaine.sn>" (domaine
 *                        vérifié dans Resend) ;
 *   - EMAIL_REPONSE_A    facultatif, adresse de réponse.
 *
 * Autorisation : la facture est lue avec le client authentifié (RLS : un
 * agent n'accède qu'à ses factures) et le PDF est produit par l'Edge
 * Function `generer-facture-pdf` avec le jeton de l'utilisateur. Aucune clé
 * service_role ici.
 */

type ActionResult<T> = { data: T; error?: undefined } | { data?: undefined; error: string };

const RESEND_URL = "https://api.resend.com/emails";

function echapperHtml(texte: string): string {
  return texte
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function envoyerFactureParEmail(
  factureId: string
): Promise<ActionResult<{ destinataire: string }>> {
  if (!z.string().uuid().safeParse(factureId).success) {
    return { error: "Identifiant de facture invalide." };
  }

  const cleApi = process.env.RESEND_API_KEY;
  const expediteur = process.env.EMAIL_EXPEDITEUR;
  if (!cleApi || !expediteur) {
    return {
      error: "L'envoi d'e-mails n'est pas encore configuré. Contactez votre administrateur.",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée, veuillez vous reconnecter." };

  const { data: facture } = await supabase
    .from("factures")
    .select("id, numero, statut, total_general, date_echeance, client:clients(nom, email)")
    .eq("id", factureId)
    .single();

  if (!facture) return { error: "Facture introuvable ou accès refusé." };

  // Limitation de débit (0022) : 10 e-mails par heure et par utilisateur.
  const { data: autorise, error: erreurLimite } = await supabase.rpc("consommer_limite_action", {
    p_action: "email_facture",
  });
  if (erreurLimite) {
    console.error("[email-facture.limite]", erreurLimite.message);
    return { error: "L'e-mail n'a pas pu être envoyé. Réessayez dans un instant." };
  }
  if (autorise === false) {
    return { error: "Limite atteinte : 10 e-mails par heure. Réessayez plus tard." };
  }
  if (facture.statut === "brouillon" || facture.statut === "annulee") {
    return { error: "Seule une facture validée ou une proforma peut être envoyée." };
  }

  const client = (Array.isArray(facture.client) ? facture.client[0] : facture.client) as
    | { nom: string; email: string | null }
    | null;
  const destinataire = client?.email?.trim();
  if (!client || !destinataire) {
    return { error: "Ce client n'a pas d'adresse e-mail. Ajoutez-la sur sa fiche." };
  }

  // getUser() ci-dessus a validé la session ; on transmet son jeton à l'Edge
  // Function pour qu'elle applique les mêmes droits que l'utilisateur.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const { data: pdf, error: erreurPdf } = await supabase.functions.invoke("generer-facture-pdf", {
    body: { facture_id: factureId },
    headers: session ? { Authorization: `Bearer ${session.access_token}` } : undefined,
  });
  if (erreurPdf || !pdf?.pdf_url) {
    console.error("[email-facture.pdf]", erreurPdf?.message);
    return { error: messageErreurPdf(erreurPdf, "Impossible de générer le PDF de cette facture.") };
  }

  // Même correction de port local que le téléchargement côté navigateur.
  const reponsePdf = await supabaseServerFetch(normaliserUrlFichierLocal(pdf.pdf_url));
  if (!reponsePdf.ok) {
    console.error("[email-facture.telechargement]", reponsePdf.status);
    return { error: "Impossible de récupérer le PDF de cette facture." };
  }
  const pdfBase64 = Buffer.from(await reponsePdf.arrayBuffer()).toString("base64");

  const { data: entreprise } = await supabase
    .from("entreprise_config_public")
    .select("nom")
    .eq("id", true)
    .maybeSingle();
  const nomEntreprise = entreprise?.nom ?? "GIE FASSO BARA";
  const estProforma = facture.statut === "proforma";
  const document = estProforma ? "Proforma" : "Facture";

  const lignes = [
    `<p>Bonjour ${echapperHtml(client.nom)},</p>`,
    `<p>Veuillez trouver ci-joint ${estProforma ? "la proforma" : "la facture"} <strong>${echapperHtml(facture.numero)}</strong> d'un montant de <strong>${formatMontant(facture.total_general)}</strong>.</p>`,
    !estProforma && facture.date_echeance
      ? `<p>Échéance de paiement : <strong>${formatDate(facture.date_echeance)}</strong>.</p>`
      : "",
    `<p>Cordialement,<br>${echapperHtml(nomEntreprise)}</p>`,
  ];

  const reponse = await fetch(RESEND_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${cleApi}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: expediteur,
      to: [destinataire],
      reply_to: process.env.EMAIL_REPONSE_A || undefined,
      subject: `${document} ${facture.numero} — ${nomEntreprise}`,
      html: lignes.filter(Boolean).join("\n"),
      attachments: [{ filename: `${facture.numero}.pdf`, content: pdfBase64 }],
    }),
  });

  if (!reponse.ok) {
    console.error("[email-facture.envoi]", reponse.status, await reponse.text());
    return { error: "L'e-mail n'a pas pu être envoyé. Réessayez dans un instant." };
  }

  return { data: { destinataire } };
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { useToast } from "@/components/ui/Toast";
import { annulerFactureAdmin } from "@/lib/actions/factures-admin";
import type { StatutFacture } from "@/lib/supabase/database.types";

/**
 * Modal de confirmation destructive — docs/design-system.md §6.6 : icône
 * d'alerte rouge, texte expliquant la conséquence exacte, deux boutons
 * (outline "Annuler" / destructive "Confirmer").
 */
export function CancelInvoiceButton({
  factureId,
  statut,
  numero,
}: {
  factureId: string;
  statut: StatutFacture;
  numero: string;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [ouvert, setOuvert] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  if (statut === "annulee" || statut === "payee") return null;

  const stockSeraRestaure = statut === "validee" || statut === "payee_partielle";

  async function confirmer() {
    setEnCours(true);
    setErreur(null);
    const resultat = await annulerFactureAdmin(factureId);
    setEnCours(false);

    if (resultat.error) {
      setErreur(resultat.error);
      return;
    }

    showToast(`Facture ${numero} annulée.`, "success");
    setOuvert(false);
    router.refresh();
  }

  return (
    <>
      <Button variant="destructive" onClick={() => setOuvert(true)}>
        Annuler la facture
      </Button>
      <Modal open={ouvert} onClose={() => setOuvert(false)} title="Annuler cette facture ?">
        <div className="flex flex-col gap-4">
          {erreur && <InlineAlert tone="red">{erreur}</InlineAlert>}
          <InlineAlert tone="red">
            <FontAwesomeIcon icon={faTriangleExclamation} aria-hidden="true" className="mr-1 h-3.5 w-3.5" /> Cette
            action est irréversible. La facture {numero}{" "}
            passera au statut &quot;Annulée&quot;.
            {stockSeraRestaure && " Le stock des produits vendus sera automatiquement restauré."}
          </InlineAlert>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setOuvert(false)}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={confirmer} loading={enCours}>
              Confirmer l&apos;annulation
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

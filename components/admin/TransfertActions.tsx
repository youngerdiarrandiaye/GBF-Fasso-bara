"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { useToast } from "@/components/ui/Toast";
import { marquerTransfertEnTransit, receptionnerTransfert, annulerTransfert } from "@/lib/actions/transferts";
import type { StatutTransfertStock } from "@/lib/supabase/database.types";

/**
 * Actions de transition d'un transfert — écran Transferts de stock. RLS
 * (migration 0013 section 4) : SEULE l'admin peut faire progresser un
 * transfert (aucune policy UPDATE agent, y compris pour "réceptionner" sa
 * propre demande) — cet écran étant 100% Admin, toute action ici est
 * légitime côté serveur.
 *
 * Point de vigilance transmis par le designer (docs/design-system.md §6.28) :
 * `receptionne` est un état TERMINAL côté base (trigger
 * `traiter_transfert_stock`) — l'action "Annuler" est masquée dès ce statut,
 * jamais seulement désactivée, pour ne pas laisser deviner une action que le
 * serveur rejettera systématiquement.
 */
export function TransfertActions({
  transfertId,
  statut,
  produitNom,
  entrepotSourceNom,
  entrepotDestinationNom,
}: {
  transfertId: string;
  statut: StatutTransfertStock;
  produitNom: string;
  entrepotSourceNom: string;
  entrepotDestinationNom: string;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [modalOuverte, setModalOuverte] = useState<"receptionner" | "annuler" | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  if (statut === "annule") return null;

  async function handleEnTransit() {
    setEnCours(true);
    setErreur(null);
    const resultat = await marquerTransfertEnTransit(transfertId);
    setEnCours(false);
    if (resultat.error) {
      showToast(resultat.error, "error");
      return;
    }
    showToast(`Transfert de "${produitNom}" marqué en transit (${entrepotSourceNom} → ${entrepotDestinationNom}).`, "success");
    router.refresh();
  }

  async function handleReceptionner() {
    setEnCours(true);
    setErreur(null);
    const resultat = await receptionnerTransfert(transfertId);
    setEnCours(false);
    if (resultat.error) {
      setErreur(resultat.error);
      return;
    }
    showToast(`Transfert de "${produitNom}" réceptionné à "${entrepotDestinationNom}".`, "success");
    setModalOuverte(null);
    router.refresh();
  }

  async function handleAnnuler() {
    setEnCours(true);
    setErreur(null);
    const resultat = await annulerTransfert(transfertId);
    setEnCours(false);
    if (resultat.error) {
      setErreur(resultat.error);
      return;
    }
    showToast(`Transfert de "${produitNom}" annulé.`, "success");
    setModalOuverte(null);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {statut === "demande" && (
        <Button size="sm" onClick={handleEnTransit} loading={enCours}>
          Marquer en transit
        </Button>
      )}
      {statut === "en_transit" && (
        <Button size="sm" onClick={() => setModalOuverte("receptionner")}>
          Réceptionner
        </Button>
      )}
      {/* "Annuler" masqué dès receptionne (état terminal) — jamais affiché ni désactivé, cf. commentaire ci-dessus. */}
      {statut !== "receptionne" && (
        <Button size="sm" variant="destructive" onClick={() => setModalOuverte("annuler")}>
          Annuler
        </Button>
      )}

      <Modal
        open={modalOuverte === "receptionner"}
        onClose={() => setModalOuverte(null)}
        title="Réceptionner ce transfert ?"
      >
        <div className="flex flex-col gap-4">
          {erreur && <InlineAlert tone="red">{erreur}</InlineAlert>}
          <InlineAlert tone="blue">
            Le stock de &quot;{produitNom}&quot; sera incrémenté à l&apos;entrepôt &quot;{entrepotDestinationNom}&quot;.
            Cette action est définitive : un transfert réceptionné ne peut plus être annulé (créez un transfert en
            sens inverse pour le corriger).
          </InlineAlert>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setModalOuverte(null)} disabled={enCours}>
              Annuler
            </Button>
            <Button onClick={handleReceptionner} loading={enCours}>
              Confirmer la réception
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={modalOuverte === "annuler"} onClose={() => setModalOuverte(null)} title="Annuler ce transfert ?">
        <div className="flex flex-col gap-4">
          {erreur && <InlineAlert tone="red">{erreur}</InlineAlert>}
          <InlineAlert tone="red">
            <FontAwesomeIcon icon={faTriangleExclamation} aria-hidden="true" className="mr-1 h-3.5 w-3.5" />
            Cette action est irréversible.{" "}
            {statut === "en_transit"
              ? `Le stock de "${produitNom}" déjà décrémenté à "${entrepotSourceNom}" sera restitué.`
              : "Aucun mouvement de stock n'a encore eu lieu pour cette demande."}
          </InlineAlert>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setModalOuverte(null)} disabled={enCours}>
              Retour
            </Button>
            <Button variant="destructive" onClick={handleAnnuler} loading={enCours}>
              Confirmer l&apos;annulation
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

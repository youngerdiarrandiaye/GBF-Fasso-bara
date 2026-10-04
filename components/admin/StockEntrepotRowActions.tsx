"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { NumberInput } from "@/components/ui/NumberInput";
import { useToast } from "@/components/ui/Toast";
import { StockEntrepotAdjustModal } from "@/components/admin/StockEntrepotAdjustModal";
import { definirSeuilAlerteEntrepot } from "@/lib/actions/entrepots";

/**
 * Actions de ligne — écran Entrepôts (fiche détail) : ajustement manuel de
 * stock (motif obligatoire, modal dédiée) + modification du seuil d'alerte
 * (RPC `definir_seuil_alerte_entrepot`, jamais un mouvement de stock).
 * Les deux passent exclusivement par des Server Actions (jamais une écriture
 * directe côté client), conformément à la contrainte du brief.
 */
export function StockEntrepotRowActions({
  produitId,
  produitNom,
  produitCode,
  unite,
  entrepotId,
  entrepotNom,
  quantiteStock,
  seuilAlerte,
}: {
  produitId: string;
  produitNom: string;
  produitCode: string;
  unite: string;
  entrepotId: string;
  entrepotNom: string;
  quantiteStock: number;
  seuilAlerte: number;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [ouvertAjustement, setOuvertAjustement] = useState(false);
  const [editionSeuil, setEditionSeuil] = useState(false);
  const [nouveauSeuil, setNouveauSeuil] = useState(seuilAlerte);
  const [enCours, setEnCours] = useState(false);

  async function enregistrerSeuil() {
    setEnCours(true);
    const resultat = await definirSeuilAlerteEntrepot({
      produit_id: produitId,
      entrepot_id: entrepotId,
      seuil: nouveauSeuil,
    });
    setEnCours(false);

    if (resultat.error) {
      showToast(resultat.error, "error");
      return;
    }

    showToast(`Seuil d'alerte de "${produitNom}" à l'entrepôt "${entrepotNom}" mis à jour : ${nouveauSeuil}.`, "success");
    setEditionSeuil(false);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {editionSeuil ? (
        <div className="flex items-center gap-2">
          <NumberInput
            aria-label="Nouveau seuil d'alerte"
            value={nouveauSeuil}
            onChange={setNouveauSeuil}
            className="w-32"
          />
          <Button size="sm" onClick={enregistrerSeuil} loading={enCours}>
            Enregistrer
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEditionSeuil(false)} disabled={enCours}>
            Annuler
          </Button>
        </div>
      ) : (
        <>
          <Button size="sm" variant="outline" onClick={() => setOuvertAjustement(true)}>
            Ajuster le stock
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditionSeuil(true)}>
            Modifier le seuil
          </Button>
        </>
      )}
      <StockEntrepotAdjustModal
        produitId={produitId}
        produitNom={produitNom}
        produitCode={produitCode}
        unite={unite}
        entrepotId={entrepotId}
        entrepotNom={entrepotNom}
        quantiteActuelle={quantiteStock}
        open={ouvertAjustement}
        onClose={() => setOuvertAjustement(false)}
      />
    </div>
  );
}

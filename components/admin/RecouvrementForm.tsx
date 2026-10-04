"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { useToast } from "@/components/ui/Toast";
import { enregistrerRemboursement } from "@/lib/actions/credits";
import { formatMontant, formatQuantite } from "@/lib/format";

export interface CreditEligibleRecouvrement {
  id: string;
  clientNom: string;
  soldeRestant: number;
  montantTotal: number;
}

/**
 * Formulaire "caisse du soir" — enregistrement rapide d'un recouvrement :
 * sélection du client parmi les crédits `en_cours` + montant du jour. Un ou
 * plusieurs remboursements peuvent être enregistrés par soir sur un même
 * crédit (règle métier 14) — le formulaire reste ouvert après succès (pas de
 * redirection), pour enchaîner la tournée de recouvrement sans réouvrir la
 * modal à chaque client.
 *
 * Toasts exacts imposés par le brief (le libellé du crédit soldé prime sur le
 * libellé générique de recouvrement quand le remboursement solde le crédit).
 */
export function RecouvrementForm({
  credits,
  creditPreselectionne,
  onSuccess,
}: {
  credits: CreditEligibleRecouvrement[];
  /** Pré-sélection depuis la fiche détail d'un crédit (bouton "Enregistrer un recouvrement" sur /admin/credits/[id]). */
  creditPreselectionne?: string;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [creditId, setCreditId] = useState(creditPreselectionne ?? "");
  const [montant, setMontant] = useState<string>("");
  const [dateRemboursement, setDateRemboursement] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const creditChoisi = useMemo(() => credits.find((c) => c.id === creditId) ?? null, [credits, creditId]);
  const montantNombre = Number(montant.replace(",", "."));
  const montantValide = !Number.isNaN(montantNombre) && montantNombre > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!creditId || !montantValide) return;
    setErreur(null);
    setEnCours(true);

    const resultat = await enregistrerRemboursement({
      credit_id: creditId,
      montant: montantNombre,
      date_remboursement: dateRemboursement,
      notes,
    });

    setEnCours(false);

    if (resultat.error || !resultat.data) {
      setErreur(resultat.error ?? "Erreur inconnue.");
      return;
    }

    const { creditStatut, montantRembourseCumule, montantTotal, clientNom } = resultat.data;

    // Toasts exacts imposés par le brief.
    if (creditStatut === "solde") {
      showToast(`Crédit soldé — ${clientNom} peut à nouveau acheter à crédit`, "success");
    } else {
      showToast(
        `Recouvrement de ${formatMontant(montantNombre)} enregistré — crédit de ${clientNom} : ${formatQuantite(montantRembourseCumule)}/${formatQuantite(montantTotal)} FCFA récupérés`,
        "success"
      );
    }

    setMontant("");
    setNotes("");
    router.refresh();
    onSuccess?.();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      {erreur && <InlineAlert tone="red">{erreur}</InlineAlert>}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="recouvrement-credit" className="text-body font-medium text-text">
          Client (crédit en cours)
        </label>
        <select
          id="recouvrement-credit"
          value={creditId}
          disabled={!!creditPreselectionne}
          onChange={(e) => setCreditId(e.target.value)}
          className="focus-ring h-tap w-full rounded-input border border-border bg-surface px-3 text-body text-text disabled:bg-surface-2 disabled:text-muted"
        >
          <option value="">Sélectionnez un client...</option>
          {credits.map((c) => (
            <option key={c.id} value={c.id}>
              {c.clientNom} — reste {formatMontant(c.soldeRestant)}
            </option>
          ))}
        </select>
        {credits.length === 0 && (
          <p className="text-body-sm text-muted">Aucun crédit en cours à recouvrer pour le moment.</p>
        )}
      </div>

      {creditChoisi && (
        <InlineAlert tone="blue">
          Solde restant dû : {formatMontant(creditChoisi.soldeRestant)} sur {formatMontant(creditChoisi.montantTotal)}.
        </InlineAlert>
      )}

      <Input
        label="Montant récupéré aujourd'hui (FCFA)"
        type="number"
        step="0.01"
        min="0"
        value={montant}
        onChange={(e) => setMontant(e.target.value)}
      />

      <Input
        label="Date du recouvrement"
        type="date"
        value={dateRemboursement}
        onChange={(e) => setDateRemboursement(e.target.value)}
      />

      <Input
        label="Notes (optionnel)"
        placeholder="Ex : versement en espèces, reçu n°..."
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />

      <div className="flex justify-end">
        <Button type="submit" loading={enCours} disabled={!creditId || !montantValide}>
          Enregistrer le recouvrement
        </Button>
      </div>
    </form>
  );
}

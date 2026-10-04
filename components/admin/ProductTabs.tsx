"use client";

import { useState } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowUp, faArrowDown, faRightLeft, type IconDefinition } from "@fortawesome/free-solid-svg-icons";
import { cn } from "@/lib/cn";
import { formatDateTime, formatDate, formatMontant, formatQuantite, libelleUnite } from "@/lib/format";
import type { UniteProduit } from "@/lib/supabase/database.types";

export interface MouvementAffiche {
  id: string;
  type: "entree" | "sortie" | "ajustement";
  quantite: number;
  motif: string | null;
  created_at: string;
  utilisateur_nom: string | null;
  /** `mouvements_stock.reference_facture_id` — présent uniquement pour les
   *  mouvements générés par la validation/annulation d'une facture (jamais
   *  pour un ajustement manuel), cf. supabase/migrations/0001_schema_initial.sql
   *  section 12 et 0010_verrouillage_ajustement_stock.sql. */
  facture_id: string | null;
  facture_numero: string | null;
}

export interface VenteAffichee {
  id: string;
  facture_id: string;
  numero: string;
  date_facture: string;
  client_nom: string;
  quantite: number;
  total_ligne: number;
}

const MOUVEMENT_CONFIG: Record<
  MouvementAffiche["type"],
  { label: string; icon: IconDefinition; tone: string }
> = {
  entree: { label: "Entrée", icon: faArrowUp, tone: "text-green-text" },
  sortie: { label: "Sortie", icon: faArrowDown, tone: "text-red-text" },
  ajustement: { label: "Ajustement", icon: faRightLeft, tone: "text-blue-text" },
};

/**
 * Onglets fiche produit — docs/design-system.md §6.10 : soulignement green
 * 2px sur l'onglet actif, transition 150ms.
 */
export function ProductTabs({
  unite,
  mouvements,
  ventes,
}: {
  unite: UniteProduit;
  mouvements: MouvementAffiche[];
  ventes: VenteAffichee[];
}) {
  const [onglet, setOnglet] = useState<"mouvements" | "ventes">("mouvements");

  return (
    <div>
      <div className="flex border-b border-border">
        <button
          type="button"
          onClick={() => setOnglet("mouvements")}
          className={cn(
            "focus-ring border-b-2 px-4 py-3 text-body font-medium transition-colors duration-btn",
            onglet === "mouvements" ? "border-green text-text" : "border-transparent text-muted"
          )}
        >
          Mouvements de stock
        </button>
        <button
          type="button"
          onClick={() => setOnglet("ventes")}
          className={cn(
            "focus-ring border-b-2 px-4 py-3 text-body font-medium transition-colors duration-btn",
            onglet === "ventes" ? "border-green text-text" : "border-transparent text-muted"
          )}
        >
          Historique des ventes
        </button>
      </div>

      {onglet === "mouvements" ? (
        <div className="overflow-x-auto">
          <table className="min-w-[820px] w-full border-collapse">
            <thead>
              <tr className="border-b border-border text-left text-caption uppercase tracking-[0.06em] text-muted">
                <th className="px-4 py-2.5 font-medium">Type</th>
                <th className="px-4 py-2.5 text-right font-medium">Quantité</th>
                <th className="px-4 py-2.5 font-medium">Motif</th>
                <th className="px-4 py-2.5 font-medium">Facture</th>
                <th className="px-4 py-2.5 font-medium">Utilisateur</th>
                <th className="px-4 py-2.5 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {mouvements.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-body text-muted">
                    Aucun mouvement de stock enregistré.
                  </td>
                </tr>
              ) : (
                mouvements.map((m) => {
                  const config = MOUVEMENT_CONFIG[m.type];
                  return (
                    <tr key={m.id} className="border-t border-border hover:bg-surface-2">
                      <td className="px-4 py-3">
                        <span className={cn("inline-flex items-center gap-1.5 font-medium", config.tone)}>
                          <FontAwesomeIcon icon={config.icon} className="h-3.5 w-3.5" aria-hidden="true" />
                          {config.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-body text-text">
                        {formatQuantite(m.quantite, libelleUnite(unite, Math.abs(m.quantite)))}
                      </td>
                      <td className="px-4 py-3 text-body-sm text-muted">{m.motif ?? "—"}</td>
                      <td className="px-4 py-3">
                        {m.facture_id ? (
                          <Link
                            href={`/admin/factures/${m.facture_id}`}
                            className="focus-ring rounded-input bg-surface-2 px-2 py-1 font-mono text-body-sm text-text hover:underline"
                          >
                            {m.facture_numero ?? m.facture_id}
                          </Link>
                        ) : (
                          <span className="text-body-sm text-muted">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-body-sm text-muted">{m.utilisateur_nom ?? "—"}</td>
                      <td className="px-4 py-3 text-body-sm text-muted">{formatDateTime(m.created_at)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-[640px] w-full border-collapse">
            <thead>
              <tr className="border-b border-border text-left text-caption uppercase tracking-[0.06em] text-muted">
                <th className="px-4 py-2.5 font-medium">Facture</th>
                <th className="px-4 py-2.5 font-medium">Client</th>
                <th className="px-4 py-2.5 font-medium">Date</th>
                <th className="px-4 py-2.5 text-right font-medium">Quantité</th>
                <th className="px-4 py-2.5 text-right font-medium">Montant</th>
              </tr>
            </thead>
            <tbody>
              {ventes.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-body text-muted">
                    Aucune vente enregistrée pour ce produit.
                  </td>
                </tr>
              ) : (
                ventes.map((v) => (
                  <tr key={v.id} className="border-t border-border hover:bg-surface-2">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/factures/${v.facture_id}`}
                        className="focus-ring rounded-input bg-surface-2 px-2 py-1 font-mono text-body-sm text-text hover:underline"
                      >
                        {v.numero}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-body text-text">{v.client_nom}</td>
                    <td className="px-4 py-3 text-body-sm text-muted">{formatDate(v.date_facture)}</td>
                    <td className="px-4 py-3 text-right font-mono text-body text-text">
                      {formatQuantite(v.quantite, libelleUnite(unite, v.quantite))}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-body text-text">
                      {formatMontant(v.total_ligne)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

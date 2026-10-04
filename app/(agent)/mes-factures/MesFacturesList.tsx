"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { EntrepotRow, FactureAvecClientEtEntrepot, StatutFacture } from "@/lib/supabase/database.types";
import { annulerBrouillon } from "@/lib/actions/factures";
import { formatDate, formatMontant } from "@/lib/format";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { OverdueBadge } from "@/components/facture/OverdueBadge";
import { useToast } from "@/components/ui/Toast";
import { EmptyState } from "@/components/ui/EmptyState";
import { faFileInvoice } from "@fortawesome/free-solid-svg-icons";

const ONGLETS: { value: StatutFacture | "toutes"; label: string }[] = [
  { value: "toutes", label: "Toutes" },
  { value: "brouillon", label: "Brouillons" },
  { value: "proforma", label: "Proformas" },
  { value: "validee", label: "Validées" },
  { value: "payee", label: "Payées" },
  { value: "annulee", label: "Annulées" },
];

/** Valeur spéciale du filtre entrepôt (distincte d'un id réel). */
const TOUS_LES_ENTREPOTS = "tous";

export function MesFacturesList({
  facturesInitiales,
  joursDeRetardParFacture,
  entrepots,
}: {
  facturesInitiales: FactureAvecClientEtEntrepot[];
  joursDeRetardParFacture: Map<string, number>;
  /**
   * Règle métier 16 (0013_avenant_credit_entrepots.sql) : filtre additionnel
   * par entrepôt, cohérent avec les filtres déjà existants sur cet écran
   * (onglet statut + recherche texte). Liste complète (y compris entrepôts
   * désactivés depuis) : une facture ancienne rattachée à un entrepôt qu'un
   * admin aurait entre-temps désactivé doit rester filtrable, pas disparaître
   * silencieusement du sélecteur.
   */
  entrepots: EntrepotRow[];
}) {
  const { showToast } = useToast();
  const [factures, setFactures] = useState(facturesInitiales);
  const [onglet, setOnglet] = useState<StatutFacture | "toutes">("toutes");
  const [entrepotFiltre, setEntrepotFiltre] = useState<string>(TOUS_LES_ENTREPOTS);
  const [recherche, setRecherche] = useState("");
  const [idEnCoursAnnulation, setIdEnCoursAnnulation] = useState<string | null>(null);

  const facturesFiltrees = useMemo(() => {
    return factures.filter((f) => {
      const correspondOnglet = onglet === "toutes" || f.statut === onglet;
      const correspondEntrepot = entrepotFiltre === TOUS_LES_ENTREPOTS || f.entrepot_id === entrepotFiltre;
      const texte = recherche.trim().toLowerCase();
      const correspondRecherche =
        texte === "" ||
        f.numero.toLowerCase().includes(texte) ||
        f.client?.nom?.toLowerCase().includes(texte);
      return correspondOnglet && correspondEntrepot && correspondRecherche;
    });
  }, [factures, onglet, entrepotFiltre, recherche]);

  async function handleAnnuler(factureId: string) {
    setIdEnCoursAnnulation(factureId);
    const result = await annulerBrouillon(factureId);
    setIdEnCoursAnnulation(null);
    if (result.error) {
      showToast(result.error, "error");
      return;
    }
    setFactures((prev) =>
      prev.map((f) => (f.id === factureId ? { ...f, statut: "annulee" } : f))
    );
    showToast("Facture annulée.", "success");
  }

  return (
    <div className="flex flex-col gap-4">
      <input
        value={recherche}
        onChange={(e) => setRecherche(e.target.value)}
        placeholder="Rechercher par numéro ou client..."
        className="focus-ring h-tap w-full rounded-input border border-border bg-surface px-3 text-body text-text"
      />

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {ONGLETS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setOnglet(tab.value)}
            className={`focus-ring tap-target shrink-0 rounded-pill px-4 text-body font-medium ${
              onglet === tab.value
                ? "bg-green text-white"
                : "bg-surface-2 text-muted hover:text-text"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {entrepots.length > 0 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          <button
            type="button"
            onClick={() => setEntrepotFiltre(TOUS_LES_ENTREPOTS)}
            className={`focus-ring tap-target shrink-0 rounded-pill px-4 text-body font-medium ${
              entrepotFiltre === TOUS_LES_ENTREPOTS
                ? "bg-surface-2 text-text ring-1 ring-border"
                : "bg-surface-2 text-muted hover:text-text"
            }`}
          >
            Tous les entrepôts
          </button>
          {entrepots.map((entrepot) => (
            <button
              key={entrepot.id}
              type="button"
              onClick={() => setEntrepotFiltre(entrepot.id)}
              className={`focus-ring tap-target shrink-0 rounded-pill px-4 text-body font-medium ${
                entrepotFiltre === entrepot.id
                  ? "bg-surface-2 text-text ring-1 ring-border"
                  : "bg-surface-2 text-muted hover:text-text"
              }`}
            >
              {entrepot.nom}
            </button>
          ))}
        </div>
      )}

      {facturesFiltrees.length === 0 ? (
        <EmptyState icone={faFileInvoice} titre="Aucune facture ne correspond à ces critères." description="Changez de filtre ou créez une nouvelle facture." action={{ href: "/nouvelle-facture", label: "Créer une facture" }} className="rounded-card border border-dashed border-border bg-surface-2" />
      ) : (
        <div className="flex flex-col gap-3">
          {facturesFiltrees.map((facture) => (
            <Card key={facture.id} interactive>
              <Link
                href={`/mes-factures/${facture.id}`}
                className="focus-ring -m-4 flex items-start justify-between gap-3 rounded-card p-4"
              >
                <div className="min-w-0">
                  <p className="truncate text-body font-medium text-text">{facture.client?.nom}</p>
                  <p className="font-mono text-body text-muted">
                    {facture.numero} · {formatDate(facture.date_facture)}
                    {facture.entrepot?.nom ? ` · ${facture.entrepot.nom}` : ""}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <span className="font-mono text-body text-text">
                    {formatMontant(facture.total_general)}
                  </span>
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    <StatusBadge statut={facture.statut} />
                    {joursDeRetardParFacture.has(facture.id) && (
                      <OverdueBadge joursDeRetard={joursDeRetardParFacture.get(facture.id)!} />
                    )}
                  </div>
                </div>
              </Link>

              {["brouillon", "proforma"].includes(facture.statut) && (
                <div className="mt-3 flex justify-end gap-2 border-t border-border pt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    loading={idEnCoursAnnulation === facture.id}
                    onClick={() => handleAnnuler(facture.id)}
                  >
                    Annuler
                  </Button>
                  <Link href={`/nouvelle-facture?id=${facture.id}`}>
                    <Button size="sm">{facture.statut === "brouillon" ? "Continuer" : "Modifier"}</Button>
                  </Link>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

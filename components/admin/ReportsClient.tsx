"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { ReportsBarChart } from "@/components/admin/LazyCharts";
import type { PointRapport } from "@/components/admin/ReportsBarChart";
import { formatDate } from "@/lib/format";
import { normaliserUrlFichierLocal } from "@/components/facture/telechargerPdf";
import type { UtilisateurRow } from "@/lib/supabase/database.types";

const LIBELLE_TYPE: Record<"ventes" | "stock", string> = {
  ventes: "Rapport des ventes",
  stock: "Rapport de stock",
};

const LIBELLE_FORMAT: Record<"pdf" | "excel", string> = {
  pdf: "PDF",
  excel: "Excel",
};

/**
 * Écran Rapports — filtres période/agent/catégorie + export PDF/Excel.
 *
 * L'export (génération du fichier) est délégué à l'Edge Function
 * `export-rapport` déjà livrée par dev-backend-edge
 * (supabase/functions/export-rapport), appelée ici via `supabase-js` — pas
 * de réimplémentation de la génération PDF/Excel côté frontend, conformément
 * à la consigne de méthode. Le filtre "catégorie" n'est PAS supporté par
 * cette Edge Function (cf. son README : type/format/periode/agent_id
 * uniquement) : il s'applique donc uniquement aux graphiques imprimables
 * affichés à l'écran (agrégation déjà faite côté serveur, filtrée ici
 * côté client), jamais à l'export PDF/Excel lui-même.
 */
export function ReportsClient({
  agents,
  ventesParAgent,
  ventesParCategorie,
}: {
  agents: Pick<UtilisateurRow, "id" | "nom">[];
  ventesParAgent: PointRapport[];
  ventesParCategorie: PointRapport[];
}) {
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const debutMois = new Date();
  debutMois.setDate(1);

  const { showToast } = useToast();
  const [type, setType] = useState<"ventes" | "stock">("ventes");
  const [format, setFormat] = useState<"pdf" | "excel">("pdf");
  const [dateDebut, setDateDebut] = useState(debutMois.toISOString().slice(0, 10));
  const [dateFin, setDateFin] = useState(aujourdhui);
  const [agentId, setAgentId] = useState("");
  const [enCours, setEnCours] = useState(false);

  async function handleExport() {
    setEnCours(true);
    const supabase = createClient();

    const body: Record<string, unknown> = { type, format };
    if (type === "ventes") {
      body.periode = { date_debut: dateDebut, date_fin: dateFin };
    }
    if (agentId) {
      body.agent_id = agentId;
    }

    const { data, error } = await supabase.functions.invoke("export-rapport", { body });
    setEnCours(false);

    // Nom de l'objet à nommer explicitement dans le toast (succès ou échec) —
    // docs/toast-et-coherence-donnees.md §1 règle 3 et §9 V3.4b.
    const libelleRapport =
      type === "ventes"
        ? `${LIBELLE_TYPE.ventes} du ${formatDate(dateDebut)} au ${formatDate(dateFin)}`
        : LIBELLE_TYPE.stock;

    if (error || !data?.url) {
      // Harmonisé sur le système de Toast (persistant, fermeture manuelle) au
      // lieu de l'InlineAlert local précédemment utilisé ici — cf. §9 V3.4b :
      // c'est le seul écran de l'app à dévier de ce patron pour une erreur
      // bloquante d'action serveur.
      showToast(`Impossible de générer ce rapport (${libelleRapport}, ${LIBELLE_FORMAT[format]}).`, "error");
      return;
    }

    // Même risque de blocage de popup que pour l'export PDF de facture
    // (handleExport est async, window.open survient hors du tour de boucle
    // synchrone du clic) : le toast succès sert aussi de filet de secours.
    const urlExport = normaliserUrlFichierLocal(data.url);
    const nouvelleFenetre = window.open(urlExport, "_blank");
    if (!nouvelleFenetre) {
      showToast(
        `${libelleRapport} généré (${LIBELLE_FORMAT[format]}) — le téléchargement automatique a été bloqué par le navigateur, ouvrez-le ici : ${urlExport}`,
        "success"
      );
      return;
    }

    showToast(`${libelleRapport} généré (${LIBELLE_FORMAT[format]}).`, "success");
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <h2 className="mb-4 text-h2 text-text">Générer un export</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="r-type" className="text-body font-medium text-text">
              Type de rapport
            </label>
            <select
              id="r-type"
              className="focus-ring h-tap w-full rounded-input border border-border bg-surface px-3 text-body text-text"
              value={type}
              onChange={(e) => setType(e.target.value as "ventes" | "stock")}
            >
              <option value="ventes">Ventes</option>
              <option value="stock">Stock</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="r-format" className="text-body font-medium text-text">
              Format
            </label>
            <select
              id="r-format"
              className="focus-ring h-tap w-full rounded-input border border-border bg-surface px-3 text-body text-text"
              value={format}
              onChange={(e) => setFormat(e.target.value as "pdf" | "excel")}
            >
              <option value="pdf">PDF</option>
              <option value="excel">Excel</option>
            </select>
          </div>

          {type === "ventes" && (
            <div className="flex flex-col gap-1.5 sm:col-span-2 xl:col-span-2">
              <span className="text-body font-medium text-text">Période</span>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={dateDebut}
                  onChange={(e) => setDateDebut(e.target.value)}
                  className="focus-ring h-tap w-full rounded-input border border-border bg-surface px-2 text-body-sm text-text"
                />
                <span className="text-muted">→</span>
                <input
                  type="date"
                  value={dateFin}
                  onChange={(e) => setDateFin(e.target.value)}
                  className="focus-ring h-tap w-full rounded-input border border-border bg-surface px-2 text-body-sm text-text"
                />
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="r-agent" className="text-body font-medium text-text">
              Agent
            </label>
            <select
              id="r-agent"
              className="focus-ring h-tap w-full rounded-input border border-border bg-surface px-3 text-body text-text"
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
            >
              <option value="">Tous les agents</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nom}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <Button onClick={handleExport} loading={enCours}>
            Générer et télécharger
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 print:grid-cols-1">
        <Card>
          <h3 className="mb-3 text-h3 text-text">Ventes par agent (30 derniers jours)</h3>
          <ReportsBarChart data={ventesParAgent} />
        </Card>
        <Card>
          <h3 className="mb-3 text-h3 text-text">Ventes par catégorie (30 derniers jours)</h3>
          <ReportsBarChart data={ventesParCategorie} />
        </Card>
      </div>
    </div>
  );
}



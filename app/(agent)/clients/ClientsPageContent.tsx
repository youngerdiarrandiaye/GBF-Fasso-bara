"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ClientRow } from "@/lib/supabase/database.types";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { NouveauClientModal } from "@/components/agent/NouveauClientModal";

const LIBELLE_TYPE: Record<ClientRow["type_client"], string> = {
  particulier: "Particulier",
  entreprise: "Entreprise",
  cooperative: "Coopérative",
};

/**
 * Écran Clients — recherche et ajout rapide (docs §6.2 pour le champ
 * recherche, §6.6 pour le modal "Nouveau client", même composant que
 * l'écran Nouvelle facture, pas de duplication).
 */
export function ClientsPageContent({ clientsInitiaux }: { clientsInitiaux: ClientRow[] }) {
  const [clients, setClients] = useState(clientsInitiaux);
  const [recherche, setRecherche] = useState("");
  const [resultatsRecherche, setResultatsRecherche] = useState<ClientRow[] | null>(null);
  const [chargement, setChargement] = useState(false);
  const [modalOuvert, setModalOuvert] = useState(false);

  useEffect(() => {
    const texte = recherche.trim();
    // Champ vide : aucune requête réseau, la liste affichée retombe sur
    // `clients` via la valeur dérivée ci-dessous (pas de setState ici,
    // règle react-hooks/set-state-in-effect).
    if (texte.length === 0) {
      return;
    }
    // setChargement(true) est déclenché dans le callback du debounce (et non
    // synchroniquement en tête d'effet) pour respecter la règle
    // react-hooks/set-state-in-effect.
    const timeout = setTimeout(async () => {
      setChargement(true);
      const supabase = createClient();
      const { data } = await supabase
        .from("clients")
        .select("id, nom, type_client, adresse, telephone, email, ninea, created_by, created_at, updated_at")
        .or(`nom.ilike.%${texte}%,telephone.ilike.%${texte}%`)
        .order("nom", { ascending: true })
        .limit(50);
      setResultatsRecherche((data as ClientRow[]) ?? []);
      setChargement(false);
    }, 250);
    return () => clearTimeout(timeout);
  }, [recherche]);

  const clientsAffiches = useMemo(
    () => (recherche.trim().length === 0 ? clients : resultatsRecherche ?? []),
    [recherche, clients, resultatsRecherche]
  );
  const compteur = clientsAffiches.length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher par nom ou téléphone..."
          className="focus-ring h-tap w-full rounded-input border border-border bg-surface px-3 text-body text-text"
        />
        <Button size="lg" className="shrink-0" onClick={() => setModalOuvert(true)}>
          + Nouveau client
        </Button>
      </div>

      <p className="text-body text-muted">
        {chargement ? "Recherche..." : `${compteur} client${compteur > 1 ? "s" : ""}`}
      </p>

      {clientsAffiches.length === 0 ? (
        <p className="rounded-card border border-dashed border-border bg-surface-2 p-4 text-center text-body text-muted">
          Aucun client trouvé.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {clientsAffiches.map((client) => (
            <Card key={client.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-body font-medium text-text">{client.nom}</p>
                  <p className="truncate text-body text-muted">
                    {client.telephone || "Sans téléphone"}
                  </p>
                  {client.adresse && (
                    <p className="truncate text-body text-muted">{client.adresse}</p>
                  )}
                </div>
                <Badge tone="neutral">{LIBELLE_TYPE[client.type_client]}</Badge>
              </div>
            </Card>
          ))}
        </div>
      )}

      <NouveauClientModal
        open={modalOuvert}
        onClose={() => setModalOuvert(false)}
        onCreated={(client) => {
          setClients((prev) => [client, ...prev]);
          setRecherche("");
        }}
      />
    </div>
  );
}

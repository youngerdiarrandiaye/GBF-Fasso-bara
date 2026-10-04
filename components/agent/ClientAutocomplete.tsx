"use client";

import { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
import { createClient } from "@/lib/supabase/client";
import type { ClientRow } from "@/lib/supabase/database.types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { NouveauClientModal } from "@/components/agent/NouveauClientModal";

const LIBELLE_TYPE: Record<ClientRow["type_client"], string> = {
  particulier: "Particulier",
  entreprise: "Entreprise",
  cooperative: "Coopérative",
};

/**
 * Sélection client — recherche nom/téléphone avec autocomplétion, docs
 * §6.2 : dropdown z-dropdown, résultats ≥ 44px, état vide + bouton "Nouveau
 * client" inline (modal, §6.6).
 */
export function ClientAutocomplete({
  value,
  onChange,
  error,
}: {
  value: ClientRow | null;
  onChange: (client: ClientRow | null) => void;
  error?: string;
}) {
  const [query, setQuery] = useState("");
  const [resultats, setResultats] = useState<ClientRow[]>([]);
  const [ouvert, setOuvert] = useState(false);
  const [chargement, setChargement] = useState(false);
  const [erreurRecherche, setErreurRecherche] = useState(false);
  const [requeteChargee, setRequeteChargee] = useState<string | null>(null);
  const [modalOuvert, setModalOuvert] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let actif = true;
    const timeout = setTimeout(async () => {
      setChargement(true);
      setErreurRecherche(false);
      const supabase = createClient();
      let recherche = supabase
        .from("clients")
        .select("id, nom, type_client, adresse, telephone, email, ninea, created_by, created_at, updated_at");
      const terme = query.trim().replace(/[,()%_*]/g, " ").trim();
      if (terme) recherche = recherche.or(`nom.ilike.%${terme}%,telephone.ilike.%${terme}%`);
      const { data, error: erreur } = await recherche
        .order(terme ? "nom" : "created_at", { ascending: !!terme }).limit(8);
      if (!actif) return;
      setResultats(erreur ? [] : (data as ClientRow[]) ?? []);
      setErreurRecherche(!!erreur);
      setRequeteChargee(query);
      setChargement(false);
    }, 250);
    return () => { actif = false; clearTimeout(timeout); };
  }, [query]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOuvert(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (value) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-body font-medium text-text">Client</span>
        <div className="flex items-center justify-between gap-3 rounded-input border border-border bg-surface-2 px-3 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-body font-medium text-text">{value.nom}</p>
            <p className="truncate text-body-sm text-muted">
              {value.telephone || "Sans téléphone"} · {LIBELLE_TYPE[value.type_client]}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="md"
            onClick={() => onChange(null)}
          >
            Changer
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative flex flex-col gap-1.5">
      <label htmlFor="recherche-client" className="text-body font-medium text-text">
        Client
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true">
          <FontAwesomeIcon icon={faMagnifyingGlass} className="h-4 w-4" />
        </span>
        <input
          id="recherche-client"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOuvert(true);
          }}
          onFocus={() => setOuvert(true)}
          placeholder="Nom ou téléphone du client..."
          className={`focus-ring h-tap w-full rounded-input border bg-surface pl-9 pr-3 text-body text-text ${
            error ? "border-red" : "border-border"
          }`}
          autoComplete="off"
        />
      </div>
      {error && <p className="text-body-sm text-red-text">{error}</p>}
      <Button type="button" variant="outline" onClick={() => setModalOuvert(true)}>
        + Nouveau client
      </Button>

      {(ouvert || !query.trim()) && (
        <div className="mt-1 w-full overflow-hidden rounded-input border border-border bg-surface" aria-live="polite" aria-busy={chargement || requeteChargee !== query}>
          {!query.trim() && <p className="px-3 pt-3 text-body-sm font-medium text-muted">Clients récemment ajoutés · touchez un nom</p>}
          {(chargement || requeteChargee !== query) && (
            <p className="px-3 py-3 text-body-sm text-muted">Recherche...</p>
          )}
          {!chargement && requeteChargee === query && erreurRecherche && <p className="px-3 py-3 text-body-sm text-red-text">Impossible de charger les clients. Réessayez en recherchant un nom.</p>}
          {!chargement && requeteChargee === query && !erreurRecherche && resultats.length === 0 && (
            <div className="flex flex-col gap-2 p-3">
              <p className="text-body-sm text-muted">{query.trim() ? `Aucun client trouvé pour « ${query} ».` : "Ajoutez votre premier client pour commencer."}</p>
            </div>
          )}
          {!chargement && requeteChargee === query &&
            resultats.map((client) => (
              <button
                key={client.id}
                type="button"
                onClick={() => {
                  onChange(client);
                  setQuery("");
                  setOuvert(false);
                }}
                className="focus-ring flex min-h-tap w-full items-center justify-between gap-3 border-b border-border px-3 py-2 text-left last:border-b-0 hover:bg-surface-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-body text-text">{client.nom}</p>
                  <p className="truncate text-body-sm text-muted">
                    {client.telephone || "Sans téléphone"}
                  </p>
                </div>
                <Badge tone="neutral">{LIBELLE_TYPE[client.type_client]}</Badge>
              </button>
            ))}
        </div>
      )}

      <NouveauClientModal
        open={modalOuvert}
        onClose={() => setModalOuvert(false)}
        nomInitial={query}
        onCreated={(client) => {
          onChange(client);
          setQuery("");
          setOuvert(false);
        }}
      />
    </div>
  );
}

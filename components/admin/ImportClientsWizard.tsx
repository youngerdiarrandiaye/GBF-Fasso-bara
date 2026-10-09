"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFileExcel, faRotateLeft } from "@fortawesome/free-solid-svg-icons";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import {
  analyserFichierClients,
  importerClients,
  type ApercuImport,
  type LigneApercu,
  type ResultatImport,
} from "@/lib/actions/import-clients";
import type { TypeClient } from "@/lib/supabase/database.types";

type Filtre = "tous" | "importer" | "doublons" | "verifier";

const LIBELLES_TYPE: Record<TypeClient, string> = {
  particulier: "Particulier",
  entreprise: "Entreprise",
  cooperative: "Coopérative",
};

const CHAMP =
  "focus-ring h-9 rounded-input border border-border bg-surface px-2 text-body-sm text-text";

function etat(ligne: LigneApercu): { libelle: string; tone: "green" | "amber" | "red" } {
  if (ligne.erreurs.length > 0) return { libelle: "Erreur", tone: "red" };
  if (ligne.existant) return { libelle: "Déjà client", tone: "amber" };
  if (ligne.doublon_fichier) return { libelle: "Doublon du fichier", tone: "amber" };
  return { libelle: "Prêt", tone: "green" };
}

function importable(ligne: LigneApercu): boolean {
  return ligne.erreurs.length === 0 && !ligne.existant && !ligne.doublon_fichier;
}

export function ImportClientsWizard() {
  const { showToast } = useToast();
  const entreeFichier = useRef<HTMLInputElement>(null);
  const [analyse, setAnalyse] = useState(false);
  const [apercu, setApercu] = useState<ApercuImport | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [choisies, setChoisies] = useState<Set<number>>(new Set());
  const [types, setTypes] = useState<Record<number, TypeClient>>({});
  const [regions, setRegions] = useState<Record<number, string>>({});
  const [filtre, setFiltre] = useState<Filtre>("tous");
  const [enCours, setEnCours] = useState(false);
  const [resultat, setResultat] = useState<ResultatImport | null>(null);
  const [glisse, setGlisse] = useState(false);

  async function lireFichier(fichier: File) {
    setErreur(null);
    setAnalyse(true);
    const donnees = new FormData();
    donnees.set("fichier", fichier);
    const reponse = await analyserFichierClients(donnees);
    setAnalyse(false);
    if (reponse.error || !reponse.data) {
      setErreur(reponse.error ?? "Impossible de lire ce fichier.");
      return;
    }
    setApercu(reponse.data);
    setChoisies(new Set(reponse.data.lignes.filter(importable).map((l) => l.ligne)));
    setTypes({});
    setRegions({});
    setFiltre("tous");
  }

  function recommencer() {
    setApercu(null);
    setResultat(null);
    setErreur(null);
    if (entreeFichier.current) entreeFichier.current.value = "";
  }

  const lignes = useMemo(() => apercu?.lignes ?? [], [apercu]);
  const compteurs = useMemo(
    () => ({
      importer: lignes.filter(importable).length,
      doublons: lignes.filter((l) => l.existant || l.doublon_fichier).length,
      verifier: lignes.filter((l) => l.erreurs.length > 0 || l.avertissements.length > 0).length,
    }),
    [lignes]
  );
  const visibles = useMemo(
    () =>
      lignes.filter((l) => {
        if (filtre === "importer") return importable(l);
        if (filtre === "doublons") return l.existant || l.doublon_fichier;
        if (filtre === "verifier") return l.erreurs.length > 0 || l.avertissements.length > 0;
        return true;
      }),
    [lignes, filtre]
  );

  function basculer(ligne: LigneApercu) {
    if (ligne.erreurs.length > 0) return;
    setChoisies((precedent) => {
      const suivant = new Set(precedent);
      if (suivant.has(ligne.ligne)) suivant.delete(ligne.ligne);
      else suivant.add(ligne.ligne);
      return suivant;
    });
  }

  function toutSelectionner(valeur: boolean) {
    setChoisies(valeur ? new Set(lignes.filter(importable).map((l) => l.ligne)) : new Set());
  }

  async function valider() {
    const aImporter = lignes
      .filter((l) => choisies.has(l.ligne))
      .map((l) => ({
        nom: l.nom,
        type_client: types[l.ligne] ?? l.type_client,
        telephone: l.telephone,
        adresse: l.adresse,
        region: (regions[l.ligne] ?? l.region)?.trim() || null,
        email: l.email,
      }));
    setEnCours(true);
    const reponse = await importerClients(aImporter);
    setEnCours(false);
    if (reponse.error || !reponse.data) {
      showToast(reponse.error ?? "Import impossible.", "error");
      return;
    }
    setResultat(reponse.data);
    showToast(`${reponse.data.importes} client(s) importé(s).`, "success");
  }

  // --- Étape 3 : résultat ---------------------------------------------------
  if (resultat) {
    return (
      <Card className="flex flex-col gap-4">
        <InlineAlert tone="green">
          {resultat.importes} client{resultat.importes > 1 ? "s" : ""} importé{resultat.importes > 1 ? "s" : ""}.
          {resultat.ignores > 0 && ` ${resultat.ignores} ignoré${resultat.ignores > 1 ? "s" : ""} (déjà présents).`}
        </InlineAlert>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/admin/clients"
            className="focus-ring inline-flex h-tap items-center rounded-input border border-green-dk bg-green-dk px-4 text-body font-medium text-white hover:brightness-90"
          >
            Voir les clients
          </Link>
          <Button variant="outline" onClick={recommencer}>
            Importer un autre fichier
          </Button>
        </div>
      </Card>
    );
  }

  // --- Étape 1 : choix du fichier ------------------------------------------
  if (!apercu) {
    return (
      <div className="flex flex-col gap-4">
        {erreur && <InlineAlert tone="red">{erreur}</InlineAlert>}
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setGlisse(true);
          }}
          onDragLeave={() => setGlisse(false)}
          onDrop={(e) => {
            e.preventDefault();
            setGlisse(false);
            const fichier = e.dataTransfer.files[0];
            if (fichier) void lireFichier(fichier);
          }}
          className={cn(
            "focus-within:ring-2 focus-within:ring-green flex cursor-pointer flex-col items-center gap-3 rounded-card border-2 border-dashed px-6 py-12 text-center transition-colors",
            glisse ? "border-green bg-green/5" : "border-border bg-surface hover:border-green/60"
          )}
        >
          <FontAwesomeIcon icon={faFileExcel} className="h-10 w-10 text-green-text" aria-hidden="true" />
          <span className="text-h3 font-semibold text-text">
            {analyse ? "Lecture du fichier…" : "Déposez votre fichier Excel ici"}
          </span>
          <span className="text-body-sm text-muted">
            ou touchez pour le choisir · format .xlsx · 5 Mo maximum
          </span>
          <input
            ref={entreeFichier}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            disabled={analyse}
            onChange={(e) => {
              const fichier = e.target.files?.[0];
              if (fichier) void lireFichier(fichier);
            }}
          />
        </label>
        <Card className="text-body-sm text-muted">
          <p className="font-medium text-text">Ce que l&apos;import reconnaît</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Colonnes : nom du client, téléphone / contact, adresse ou marché, type de client.</li>
            <li>Les titres de région (« REGION DE THIES ») qui découpent le fichier : chaque client reçoit sa région.</li>
            <li>Les lignes vides et les totaux sont ignorés. Rien n&apos;est enregistré avant votre validation.</li>
          </ul>
        </Card>
      </div>
    );
  }

  // --- Étape 2 : aperçu -----------------------------------------------------
  const FILTRES: { id: Filtre; label: string; n: number }[] = [
    { id: "tous", label: "Tous", n: lignes.length },
    { id: "importer", label: "À importer", n: compteurs.importer },
    { id: "doublons", label: "Doublons", n: compteurs.doublons },
    { id: "verifier", label: "À vérifier", n: compteurs.verifier },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-wrap items-center gap-3">
        <FontAwesomeIcon icon={faFileExcel} className="h-5 w-5 text-green-text" aria-hidden="true" />
        <div className="mr-auto min-w-0">
          <p className="truncate text-body font-semibold text-text">{apercu.nomFichier}</p>
          <p className="text-body-sm text-muted">
            {lignes.length} client{lignes.length > 1 ? "s" : ""} lu{lignes.length > 1 ? "s" : ""}
            {apercu.ignorees > 0 && ` · ${apercu.ignorees} ligne${apercu.ignorees > 1 ? "s" : ""} ignorée${apercu.ignorees > 1 ? "s" : ""} (titres, totaux)`}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={recommencer} className="gap-2">
          <FontAwesomeIcon icon={faRotateLeft} className="h-3.5 w-3.5" aria-hidden="true" />
          Changer de fichier
        </Button>
      </Card>

      <p className="text-body-sm text-muted">
        Colonnes reconnues :{" "}
        {Object.entries(apercu.colonnes)
          .filter(([, colonne]) => colonne)
          .map(([champ, colonne]) => `${champ} ← ${colonne}`)
          .join(" · ")}
      </p>

      <div role="tablist" aria-label="Filtrer l'aperçu" className="flex flex-wrap gap-2">
        {FILTRES.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={filtre === f.id}
            onClick={() => setFiltre(f.id)}
            className={cn(
              "focus-ring inline-flex h-9 items-center gap-2 rounded-input border px-3 text-body-sm font-medium transition-colors",
              filtre === f.id ? "border-green-dk bg-green-dk text-white" : "border-border bg-surface text-text hover:bg-surface-2"
            )}
          >
            {f.label}
            <span className={cn("font-mono text-caption", filtre === f.id ? "text-white/80" : "text-muted")}>{f.n}</span>
          </button>
        ))}
        <span className="mx-1 hidden h-9 w-px bg-border sm:block" aria-hidden="true" />
        <Button variant="ghost" size="sm" onClick={() => toutSelectionner(true)}>
          Tout sélectionner
        </Button>
        <Button variant="ghost" size="sm" onClick={() => toutSelectionner(false)}>
          Tout désélectionner
        </Button>
      </div>

      <Card className="!p-0">
        {visibles.length === 0 ? (
          <p className="px-4 py-10 text-center text-body-sm text-muted">Aucune ligne dans cette catégorie.</p>
        ) : (
          <>
          <ul className="divide-y divide-border md:hidden">
            {visibles.map((ligne) => {
              const { libelle, tone } = etat(ligne);
              const choisie = choisies.has(ligne.ligne);
              return (
                <li key={ligne.ligne} className={cn("flex flex-col gap-3 p-4", !choisie && "bg-surface-2/50")}>
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={choisie}
                      disabled={ligne.erreurs.length > 0}
                      onChange={() => basculer(ligne)}
                      aria-label={`Importer ${ligne.nom}`}
                      className="focus-ring mt-0.5 h-6 w-6 shrink-0 accent-[var(--color-green-dk)]"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-body font-semibold text-text">{ligne.nom}</p>
                      <p className="text-body-sm text-muted">
                        {[ligne.telephone, ligne.adresse].filter(Boolean).join(" · ") || "Aucune coordonnée"}
                      </p>
                      <p className="text-caption text-muted">Ligne {ligne.ligne}</p>
                    </div>
                    <Badge tone={tone}>{libelle}</Badge>
                  </div>
                  {[...ligne.erreurs, ...ligne.avertissements].map((message) => (
                    <p key={message} className="text-caption text-amber-text">{message}</p>
                  ))}
                  <div className="grid grid-cols-2 gap-2 pl-9">
                    <input
                      value={regions[ligne.ligne] ?? ligne.region ?? ""}
                      onChange={(e) => setRegions((r) => ({ ...r, [ligne.ligne]: e.target.value }))}
                      aria-label={`Région de ${ligne.nom}`}
                      placeholder="Région"
                      className={cn(CHAMP, "min-w-0")}
                    />
                    <select
                      value={types[ligne.ligne] ?? ligne.type_client}
                      onChange={(e) => setTypes((t) => ({ ...t, [ligne.ligne]: e.target.value as TypeClient }))}
                      aria-label={`Type de ${ligne.nom}`}
                      className={cn(CHAMP, "min-w-0")}
                    >
                      {(Object.keys(LIBELLES_TYPE) as TypeClient[]).map((t) => (
                        <option key={t} value={t}>{LIBELLES_TYPE[t]}</option>
                      ))}
                    </select>
                  </div>
                  {ligne.type_source && <p className="pl-9 text-caption text-muted">Fichier : {ligne.type_source}</p>}
                </li>
              );
            })}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[860px] border-collapse">
              <thead>
                <tr className="border-b border-border text-left text-caption uppercase tracking-[0.06em] text-muted">
                  <th className="w-10 px-4 py-2.5" scope="col">
                    <span className="sr-only">Importer</span>
                  </th>
                  <th className="px-2 py-2.5 font-medium" scope="col">Client</th>
                  <th className="px-2 py-2.5 font-medium" scope="col">Téléphone</th>
                  <th className="px-2 py-2.5 font-medium" scope="col">Adresse</th>
                  <th className="px-2 py-2.5 font-medium" scope="col">Région</th>
                  <th className="px-2 py-2.5 font-medium" scope="col">Type</th>
                  <th className="px-4 py-2.5 font-medium" scope="col">État</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((ligne) => {
                  const { libelle, tone } = etat(ligne);
                  const choisie = choisies.has(ligne.ligne);
                  return (
                    <tr key={ligne.ligne} className={cn("border-t border-border align-top", !choisie && "bg-surface-2/50")}>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={choisie}
                          disabled={ligne.erreurs.length > 0}
                          onChange={() => basculer(ligne)}
                          aria-label={`Importer ${ligne.nom}`}
                          className="focus-ring h-5 w-5 accent-[var(--color-green-dk)]"
                        />
                      </td>
                      <td className="px-2 py-3">
                        <p className="text-body font-medium text-text">{ligne.nom}</p>
                        <p className="text-caption text-muted">Ligne {ligne.ligne}</p>
                        {[...ligne.erreurs, ...ligne.avertissements].map((message) => (
                          <p key={message} className="mt-0.5 text-caption text-amber-text">{message}</p>
                        ))}
                      </td>
                      <td className="px-2 py-3 text-body-sm text-text">{ligne.telephone ?? <span className="text-muted">—</span>}</td>
                      <td className="px-2 py-3 text-body-sm text-text">{ligne.adresse ?? <span className="text-muted">—</span>}</td>
                      <td className="px-2 py-3">
                        <input
                          value={regions[ligne.ligne] ?? ligne.region ?? ""}
                          onChange={(e) => setRegions((r) => ({ ...r, [ligne.ligne]: e.target.value }))}
                          aria-label={`Région de ${ligne.nom}`}
                          className={cn(CHAMP, "w-32")}
                        />
                      </td>
                      <td className="px-2 py-3">
                        <select
                          value={types[ligne.ligne] ?? ligne.type_client}
                          onChange={(e) => setTypes((t) => ({ ...t, [ligne.ligne]: e.target.value as TypeClient }))}
                          aria-label={`Type de ${ligne.nom}`}
                          className={CHAMP}
                        >
                          {(Object.keys(LIBELLES_TYPE) as TypeClient[]).map((t) => (
                            <option key={t} value={t}>{LIBELLES_TYPE[t]}</option>
                          ))}
                        </select>
                        {ligne.type_source && <p className="mt-1 text-caption text-muted">{ligne.type_source}</p>}
                      </td>
                      <td className="px-4 py-3"><Badge tone={tone}>{libelle}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </Card>

      <div className="sticky bottom-3 z-sticky rounded-card border border-border bg-surface p-3 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-body text-text" role="status">
            <span className="font-semibold">{choisies.size}</span> client{choisies.size > 1 ? "s" : ""} sélectionné{choisies.size > 1 ? "s" : ""}
            {compteurs.doublons > 0 && <span className="text-muted"> · {compteurs.doublons} doublon{compteurs.doublons > 1 ? "s" : ""} écarté{compteurs.doublons > 1 ? "s" : ""}</span>}
          </p>
          <Button onClick={valider} loading={enCours} disabled={choisies.size === 0}>
            Importer {choisies.size > 0 ? `${choisies.size} client${choisies.size > 1 ? "s" : ""}` : ""}
          </Button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { ClientRow, EntrepotRow, ProduitAvecStockEntrepot } from "@/lib/supabase/database.types";
import type { LigneBonLivraisonInput } from "@/lib/validations/schemas";
import { bonLivraisonSchema } from "@/lib/validations/schemas";
import { creerBonLivraison, rechercherFacturesLivraison, chargerFactureLivraison, type FactureLivraisonOption } from "@/lib/actions/bons-livraison";
import { Button } from "@/components/ui/Button";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EntrepotSelector } from "@/components/ui/EntrepotSelector";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { ClientAutocomplete } from "@/components/agent/ClientAutocomplete";
import { ProduitAutocomplete, stockPourEntrepot } from "@/components/agent/ProduitAutocomplete";
import { LigneBonLivraisonRow } from "@/components/agent/LigneBonLivraisonRow";

type FactureLegere = FactureLivraisonOption;

function aujourdhuiISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function FactureLinkPicker({
  value,
  onChange,
}: {
  value: FactureLegere | null;
  onChange: (facture: FactureLegere | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [resultats, setResultats] = useState<FactureLegere[]>([]);
  const [ouvert, setOuvert] = useState(true);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let annule = false;
    const timeout = setTimeout(async () => {
      setChargement(true);
      setErreur(null);
      try {
        const result = await rechercherFacturesLivraison(query);
        if (annule) return;
        setResultats(result.data ?? []);
        setErreur(result.error ?? null);
      } catch {
        if (!annule) setErreur("Impossible de rechercher les factures.");
      } finally {
        if (!annule) setChargement(false);
      }
    }, 250);
    return () => { annule = true; clearTimeout(timeout); };
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
      <section className="relative z-[40] rounded-card border border-border bg-surface p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <span className="text-body font-medium text-text">Facture liée (optionnel)</span>
            <p className="mt-1 text-body text-muted">
              Les informations du bon seront reprises depuis cette facture.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" className="self-start sm:self-center" onClick={() => onChange(null)}>
            Retirer
          </Button>
        </div>
        <div className="mt-3 rounded-input border border-border bg-surface-2 px-3 py-2.5">
          <p className="truncate font-mono text-body text-text">{value.numero} — {value.client?.nom}</p>
          <p className="mt-1 text-body text-muted">Client, entrepôt et quantités verrouillés par la facture.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="relative z-[40] rounded-card border border-border bg-surface p-4 shadow-sm">
      <div className="mb-3">
        <label htmlFor="recherche-facture-bl" className="text-body font-medium text-text">
          Facture liée (optionnel)
        </label>
        <p className="mt-1 text-body text-muted">
          Recherchez par numéro de facture ou par nom du client.
        </p>
      </div>
      <div ref={containerRef} className="relative">
        <input
          id="recherche-facture-bl"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setChargement(true);
            setOuvert(true);
          }}
          onFocus={() => setOuvert(true)}
          placeholder="Ex. FAC-00012 ou nom du client"
          className="focus-ring h-tap w-full rounded-input border border-border bg-surface px-3 text-body text-text"
          autoComplete="off"
        />
        {ouvert && (
          <div className="mt-2 max-h-80 overflow-y-auto rounded-input border border-border bg-surface">
            {chargement && <p className="px-3 py-3 text-body text-muted">Recherche...</p>}
            {erreur && <p role="alert" className="px-3 py-3 text-red-text">{erreur}</p>}
            {!chargement && !erreur && resultats.length === 0 && (
              <p className="px-3 py-3 text-body text-muted">Aucune facture validée à livrer pour « {query} ».</p>
            )}
            {!chargement &&
              resultats.map((facture) => (
                <button
                  key={facture.id}
                  type="button"
                  onClick={() => {
                    onChange(facture);
                    setQuery("");
                    setOuvert(false);
                  }}
                  className="focus-ring flex min-h-tap w-full items-center justify-between gap-3 border-b border-border px-3 py-2 text-left last:border-b-0 hover:bg-surface-2"
                >
                  <span className="min-w-0 truncate font-mono text-body text-text">{facture.numero} — {facture.client?.nom}</span>
                  <StatusBadge statut={facture.statut} className="shrink-0" />
                </button>
              ))}
          </div>
        )}
      </div>
    </section>
  );
}

export function NouveauBonLivraisonForm({
  espaceAdmin = false,
  factureInitiale = null,
}: {
  espaceAdmin?: boolean;
  /** Facture à livrer présélectionnée (bouton « Livrer » de l'accueil). */
  factureInitiale?: FactureLegere | null;
}) {
  const router = useRouter();
  const { showToast } = useToast();

  const [client, setClient] = useState<ClientRow | null>(null);
  const [entrepots, setEntrepots] = useState<EntrepotRow[]>([]);
  const [entrepotsChargement, setEntrepotsChargement] = useState(true);
  const [entrepotId, setEntrepotId] = useState<string | null>(null);
  const [factureLiee, setFactureLiee] = useState<FactureLegere | null>(null);
  const [dateLivraison, setDateLivraison] = useState(aujourdhuiISO());
  const [notes, setNotes] = useState("");
  const [lignes, setLignes] = useState<LigneBonLivraisonInput[]>([]);
  const [etape, setEtape] = useState(1);
  const titreEtapeRef = useRef<HTMLHeadingElement>(null);

  function allerEtape(prochaine: number) {
    setEtape(prochaine);
    requestAnimationFrame(() => {
      titreEtapeRef.current?.focus();
      titreEtapeRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  }

  const [factureChargement, setFactureChargement] = useState(false);
  const selectionVersion = useRef(0);
  const soumissionEnCours = useRef(false);
  const [enCours, setEnCours] = useState(false);
  const [erreurGlobale, setErreurGlobale] = useState<string | null>(null);
  const [ligneEnErreur, setLigneEnErreur] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    (async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("entrepots")
        .select("id, nom, adresse, actif, created_at, updated_at")
        .eq("actif", true)
        .order("nom", { ascending: true });
      if (annule) return;
      if (error) {
        setErreurGlobale("Impossible de charger les entrepôts. Actualisez la page.");
        setEntrepotsChargement(false);
        return;
      }
      const liste = (data as EntrepotRow[]) ?? [];
      setEntrepots(liste);
      setEntrepotsChargement(false);
      setEntrepotId((prev) => prev ?? (liste.length === 1 ? liste[0].id : prev));
    })();
    return () => {
      annule = true;
    };
  }, []);

  async function choisirFacture(facture: FactureLegere | null) {
    const version = ++selectionVersion.current;
    setFactureLiee(facture);
    setClient(null);
    setLignes([]);
    setEntrepotId(null);
    setErreurGlobale(null);
    setFactureChargement(!!facture);
    if (!facture) return;
    try {
      const result = await chargerFactureLivraison(facture.id);
      if (version !== selectionVersion.current) return;
      if (!result.data) {
        setErreurGlobale(result.error ?? "Impossible de charger cette facture.");
        setFactureLiee(null);
        return;
      }
      setClient(result.data.client);
      setEntrepotId(result.data.entrepot_id);
      setLignes(result.data.lignes);
    } catch {
      if (version === selectionVersion.current) {
        setErreurGlobale("Impossible de charger cette facture. Veuillez réessayer.");
        setFactureLiee(null);
      }
    } finally {
      if (version === selectionVersion.current) setFactureChargement(false);
    }
  }

  // Présélection depuis « À livrer » : même chargement qu'un choix manuel,
  // donc mêmes données imposées et même revérification serveur.
  const factureInitialeChargee = useRef(false);
  useEffect(() => {
    if (!factureInitiale || factureInitialeChargee.current) return;
    factureInitialeChargee.current = true;
    void choisirFacture(factureInitiale);
  }, [factureInitiale]);

  function ajouterProduit(produit: ProduitAvecStockEntrepot) {
    if (!entrepotId) return;
    const { quantiteStock } = stockPourEntrepot(produit, entrepotId);
    setLignes((prev) => {
      const index = prev.findIndex((l) => l.produit_id === produit.id);
      if (index >= 0) {
        const copie = [...prev];
        copie[index] = { ...copie[index], quantite: copie[index].quantite + 1 };
        return copie;
      }
      return [
        ...prev,
        {
          produit_id: produit.id,
          code: produit.code,
          nom: produit.nom,
          unite: produit.unite,
          quantite: 1,
          stock_disponible: quantiteStock,
        },
      ];
    });
  }

  const entrepotSelectionne = entrepots.find((e) => e.id === entrepotId);
  const soumissionBloquee = enCours || factureChargement || !client || !entrepotSelectionne || !lignes.length;

  async function handleSubmit() {
    if (etape !== 3 || soumissionEnCours.current || soumissionBloquee) return;
    setErreurGlobale(null);
    setLigneEnErreur(null);

    const parsed = bonLivraisonSchema.safeParse({
      client_id: client?.id ?? "",
      entrepot_id: entrepotId ?? "",
      facture_id: factureLiee?.id ?? "",
      date_livraison: dateLivraison,
      notes,
      lignes,
    });
    if (!parsed.success) {
      setErreurGlobale(parsed.error.issues[0]?.message ?? "Bon de livraison invalide.");
      return;
    }

    soumissionEnCours.current = true;
    setEnCours(true);
    let result;
    try {
      result = await creerBonLivraison(parsed.data);
    } catch {
      setErreurGlobale("La création n’a pas pu être confirmée. Consultez la liste des bons avant de réessayer.");
      return;
    } finally {
      soumissionEnCours.current = false;
      setEnCours(false);
    }

    if (result.error || !result.data) {
      setErreurGlobale(result.error ?? "Erreur inconnue.");
      // Le message whitelisté "Stock insuffisant pour "X" dans..." permet de
      // repérer la ligne fautive côté UI, même principe que NouvelleFactureForm.
      const produitEnCause = lignes.find((l) => result.error?.includes(`"${l.nom}"`));
      if (produitEnCause) {
        setLigneEnErreur(produitEnCause.nom);
        allerEtape(2);
      }
      showToast(result.error ?? "Erreur inconnue.", "error");
      return;
    }

    showToast(`Bon de livraison ${result.data.bonLivraison.numero} créé`, "success");
    router.push(espaceAdmin ? `/admin/bons-livraison/${result.data.bonLivraison.id}` : "/bons-livraison");
  }

  return (
    <div className="flex flex-col gap-6 pb-8">
      <h1 className="text-h1 text-text">Nouveau bon de livraison</h1>
      <ol aria-label="Étapes de la livraison" className="grid grid-cols-3 gap-2">
        {["Client", "Produits", "Confirmation"].map((label, index) => (
          <li key={label} aria-current={etape === index + 1 ? "step" : undefined} className="flex flex-col gap-1.5 pt-1 text-body">
            <span aria-hidden="true" className={`h-1 rounded-pill ${index + 1 <= etape ? "bg-green-dk" : "bg-border"}`} />
            <span className={etape === index + 1 ? "font-semibold text-text" : index + 1 < etape ? "font-medium text-green-text" : "text-muted"}>{label}</span>
          </li>
        ))}
      </ol>
      <h2 ref={titreEtapeRef} tabIndex={-1} className="scroll-mt-24 text-h2 text-text">
        {etape === 1 ? "1. Choisir la facture ou le client" : etape === 2 ? "2. Vérifier les produits" : "3. Confirmer la livraison"}
      </h2>
      {erreurGlobale && <InlineAlert tone="red">{erreurGlobale}</InlineAlert>}
      <fieldset disabled={enCours} className="flex min-w-0 flex-col gap-6">
      <div hidden={etape !== 1} className="space-y-6">
      <FactureLinkPicker value={factureLiee} onChange={choisirFacture} />
      {factureChargement && <p role="status">Chargement du client et des produits de la facture…</p>}
      {factureLiee && <InlineAlert tone="blue">Le client, l’entrepôt et les quantités sont repris de la facture. Ce bon livre la totalité des produits facturés.</InlineAlert>}

      <div className="bg-surface py-3">
        {entrepotsChargement ? (
          // Cf. commentaire équivalent dans NouvelleFactureForm.tsx :
          // EntrepotSelector n'a pas d'état de chargement dédié, un skeleton
          // local évite d'afficher "Aucun entrepôt configuré" à tort le
          // temps du fetch initial.
          <div className="flex flex-col gap-1.5">
            <p className="text-body font-medium text-text">Entrepôt de départ</p>
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-11 w-32" />
              <Skeleton className="h-11 w-28" />
              <Skeleton className="h-11 w-36" />
            </div>
          </div>
        ) : (
          <EntrepotSelector
            label="Entrepôt de départ"
            entrepots={entrepots}
            value={entrepotId}
            disabled={!!factureLiee || factureChargement}
            onChange={(id) => { setEntrepotId(id); setLignes([]); }}
          />
        )}
      </div>

      {factureLiee ? (
        <p className="rounded-input border border-border bg-surface-2 p-3">Client : <strong>{client?.nom ?? "Chargement…"}</strong></p>
      ) : <><p className="text-body text-muted">Sans facture ? Choisissez directement votre client.</p><ClientAutocomplete value={client} onChange={setClient} /></>}
      </div>

      <div hidden={etape !== 3} className="space-y-4">
      <div className="rounded-card border border-border bg-surface-2 p-4">
        <p>Client : <strong>{client?.nom}</strong></p>
        <p>Entrepôt : <strong>{entrepotSelectionne?.nom}</strong></p>
        <p>Facture : <strong>{factureLiee?.numero ?? "Sans facture"}</strong></p>
        <ul className="mt-3 space-y-2">{lignes.map((ligne) => <li key={ligne.produit_id} className="flex justify-between gap-3"><span>{ligne.nom}</span><strong>{ligne.quantite} {ligne.unite}</strong></li>)}</ul>
      </div>
      <InlineAlert tone="blue">En confirmant, ces produits seront retirés du stock de l’entrepôt {entrepotSelectionne?.nom}. Aucun stock n’est retiré avant cette confirmation.</InlineAlert>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="date-livraison" className="text-body font-medium text-text">
          Date de livraison
        </label>
        <input
          id="date-livraison"
          type="date"
          value={dateLivraison}
          onChange={(e) => setDateLivraison(e.target.value)}
          className="focus-ring h-tap w-full rounded-input border border-border bg-surface px-3 text-body text-text"
        />
      </div>
      </div>

      <div hidden={etape !== 2}>
      <div className="flex flex-col gap-3">
        {!factureLiee && <ProduitAutocomplete entrepotId={entrepotId} onSelect={ajouterProduit} />}

        {lignes.length === 0 ? (
          <p className="rounded-card border border-dashed border-border bg-surface-2 p-4 text-center text-body text-muted">
            Aucun produit ajouté. Recherchez un article par code ou par nom ci-dessus.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {lignes.map((ligne, index) => (
              <LigneBonLivraisonRow
                key={ligne.produit_id}
                ligne={ligne}
                lectureSeule={!!factureLiee}
                erreurServeur={ligneEnErreur === ligne.nom ? erreurGlobale ?? undefined : undefined}
                onQuantiteChange={(quantite) =>
                  setLignes((prev) => prev.map((l, i) => (i === index ? { ...l, quantite } : l)))
                }
                onRemove={() => setLignes((prev) => prev.filter((_, i) => i !== index))}
              />
            ))}
          </div>
        )}
      </div>
      </div>

      <details hidden={etape !== 3} className="rounded-card border border-border p-4">
      <summary className="focus-ring cursor-pointer text-body font-medium">Ajouter une note (optionnel)</summary>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="notes-bl" className="text-body font-medium text-text">
          Notes (optionnel)
        </label>
        <textarea
          id="notes-bl"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="focus-ring w-full rounded-input border border-border bg-surface px-3 py-2 text-body text-text"
          placeholder="Précision à ajouter sur ce bon de livraison..."
        />
      </div>
      </details>

      </fieldset>
      <div className={`sticky z-sticky -mx-4 flex flex-col gap-2 border-t border-border bg-surface p-4 sm:flex-row sm:justify-end ${espaceAdmin ? "bottom-0" : "bottom-[calc(4rem+env(safe-area-inset-bottom))] md:bottom-0"}`}>
        {etape > 1 && <Button type="button" variant="outline" size="lg" disabled={enCours} onClick={() => allerEtape(etape - 1)}>Retour</Button>}
        {etape < 3 ? <Button type="button" size="lg" fullWidth className="sm:w-auto" disabled={enCours || factureChargement || !client || !entrepotSelectionne || (etape === 2 && !lignes.length)} onClick={() => {
          if (etape === 2) {
            const parsed = bonLivraisonSchema.pick({ client_id: true, entrepot_id: true, lignes: true }).safeParse({ client_id: client?.id, entrepot_id: entrepotId, lignes });
            if (!parsed.success) { setErreurGlobale(parsed.error.issues[0]?.message ?? "Vérifiez les produits."); return; }
          }
          setErreurGlobale(null);
          allerEtape(etape + 1);
        }}>{etape === 1 ? "Continuer vers les produits" : "Vérifier la livraison"}</Button> :
        <Button
          type="button"
          variant="primary"
          size="lg"
          fullWidth
          className="sm:w-auto"
          loading={enCours}
          disabled={soumissionBloquee}
          onClick={handleSubmit}
        >
          Confirmer la livraison
        </Button>}
      </div>
    </div>
  );
}

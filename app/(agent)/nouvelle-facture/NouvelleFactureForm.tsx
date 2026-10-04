"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type {
  ClientRow,
  EntrepotRow,
  FrequenceEcheanceCredit,
  ProduitAvecStockEntrepot,
  StatutFacture,
  StockEntrepotRow,
} from "@/lib/supabase/database.types";
import type { LigneFactureInput } from "@/lib/validations/schemas";
import { factureSchema, TVA_TAUX_STANDARD } from "@/lib/validations/schemas";
import { enregistrerBrouillon, validerFacture } from "@/lib/actions/factures";
import { ouvrirCreditPourFacture } from "@/lib/actions/credits";
import { formatMontant } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EntrepotSelector } from "@/components/ui/EntrepotSelector";
import { CreditGauge } from "@/components/ui/CreditGauge";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { ClientAutocomplete } from "@/components/agent/ClientAutocomplete";
import { ProduitAutocomplete, stockPourEntrepot } from "@/components/agent/ProduitAutocomplete";
import { LigneFactureRow } from "@/components/agent/LigneFactureRow";
import { RecapTotaux } from "@/components/agent/RecapTotaux";
import { CompanyBrandMark } from "@/components/facture/CompanyBrandMark";

type ActionEnCours = "brouillon" | "proforma" | "validee" | null;

interface FactureInitiale {
  factureId: string;
  numero: string;
  statut: StatutFacture;
  client: ClientRow;
  lignes: LigneFactureInput[];
  remise: number;
  forfaitTransport: number;
  tvaActive: boolean;
  notes: string;
  /** Échéance de paiement (AAAA-MM-JJ) ou "" : règle des 10 jours après validation. */
  dateEcheance?: string;
  /**
   * Optionnel (pas encore renseigné par app/(admin)/admin/nouvelle-facture/
   * page.tsx, hors périmètre dev-frontend-agent) : quand absent, l'agent/
   * admin qui reprend un brouillon doit re-sélectionner consciemment son
   * entrepôt via EntrepotSelector — jamais de valeur par défaut invisible
   * (règle 16, docs/design-system.md §6.26), ce comportement reste donc sûr
   * même sans cette info, simplement moins pré-rempli.
   */
  entrepotId?: string;
}

/** Résultat du pré-contrôle client (immédiat, non bloquant côté BDD) avant
 *  l'ouverture réelle d'un crédit — règles 12/13, migration 0013 section 7.
 *  Ne remplace JAMAIS le trigger serveur `bloquer_nouveau_credit()`, seul
 *  juge final : cf. `ouvrirCreditPourFacture` (lib/actions/credits.ts). */
interface PrecontroleCredit {
  bloque: boolean;
  message?: string;
  encoursActuel: number;
  seuilMax: number;
}

async function precontrolerCredit(clientId: string, clientNom: string, montantFacture: number): Promise<PrecontroleCredit> {
  const supabase = createClient();
  const [{ data: creditExistant }, { data: entreprise }, { data: creditsEnCours }] = await Promise.all([
    supabase
      .from("credits")
      .select("solde_restant")
      .eq("client_id", clientId)
      .eq("statut", "en_cours")
      .maybeSingle(),
    supabase.from("entreprise_config_public").select("seuil_credit_max").eq("id", true).single(),
    supabase.from("credits").select("solde_restant").eq("statut", "en_cours"),
  ]);

  const seuilMax = (entreprise as { seuil_credit_max: number } | null)?.seuil_credit_max ?? 0;
  const encoursActuel = ((creditsEnCours as { solde_restant: number }[] | null) ?? []).reduce(
    (somme, c) => somme + c.solde_restant,
    0
  );

  // Règle 13 en premier (client-spécifique) : si ce client a déjà un crédit
  // en_cours, la question du seuil global ne se pose même pas pour lui —
  // même ordre de vérification que le trigger bloquer_nouveau_credit().
  if (creditExistant) {
    return {
      bloque: true,
      message: `Crédit refusé — ${clientNom} a déjà un crédit en cours de ${formatMontant(creditExistant.solde_restant)}`,
      encoursActuel,
      seuilMax,
    };
  }

  // Règle 12 : même calcul exact que le trigger (v_en_cours + NEW.montant_total > v_seuil).
  const montantProjete = encoursActuel + montantFacture;
  if (montantProjete > seuilMax) {
    return {
      bloque: true,
      message: `Crédit refusé — dépasserait le seuil global (${formatMontant(montantProjete)} / ${formatMontant(seuilMax)})`,
      encoursActuel,
      seuilMax,
    };
  }

  return { bloque: false, encoursActuel, seuilMax };
}

export function NouvelleFactureForm({
  initial,
  redirectApresValidation = "/mes-factures",
  sansBarreOngletsMobile = false,
  brand,
}: {
  initial?: FactureInitiale;
  /** Espace Admin redirige vers /admin/factures plutôt que /mes-factures (route agent-only). */
  redirectApresValidation?: string;
  /**
   * true côté Espace Admin : ce layout n'a jamais de BottomTabBar (fixed,
   * h-16, md:hidden — seulement en Espace Agent), donc la barre d'actions
   * sticky ne doit pas réserver les 64px prévus pour la dégager en dessous
   * de md — sinon elle flotte avec un espace mort inutile, sans rien à
   * dégager. Corrige un chevauchement observé côté Admin en test mobile.
   */
  sansBarreOngletsMobile?: boolean;
  /**
   * Optionnel, opt-in : logo entreprise affiché à côté du titre. Utilisé
   * uniquement côté Espace Admin (branding "Ultraleads", cf. écrans-listes) —
   * l'Espace Agent n'appelle pas ce prop, son en-tête reste inchangé.
   */
  brand?: { nom: string; logoUrl: string | null };
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [etape, setEtape] = useState(1);
  const titreEtapeRef = useRef<HTMLHeadingElement>(null);

  const [client, setClient] = useState<ClientRow | null>(initial?.client ?? null);
  const [lignes, setLignes] = useState<LigneFactureInput[]>(initial?.lignes ?? []);
  const [remise, setRemise] = useState(initial?.remise ?? 0);
  const [forfaitTransport, setForfaitTransport] = useState(initial?.forfaitTransport ?? 0);
  // TVA activée par défaut sur toute nouvelle facture (retour client) — reste
  // modifiable manuellement via la case à cocher (RecapTotaux), et une
  // reprise de facture existante respecte toujours la valeur réelle stockée
  // (`initial.tvaActive`, cf. page.tsx : `tva_taux > 0`).
  const [tvaActive, setTvaActive] = useState(initial?.tvaActive ?? true);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [dateEcheance, setDateEcheance] = useState(initial?.dateEcheance ?? "");

  // --- Avenant Crédit / Bon de Livraison / Multi-entrepôts (règle 16) -------
  // Entrepôt source, OBLIGATOIRE dès le brouillon (factures.entrepot_id est
  // NOT NULL en base sans exception de statut, migration 0013 section 12).
  const [entrepots, setEntrepots] = useState<EntrepotRow[]>([]);
  const [entrepotsChargement, setEntrepotsChargement] = useState(true);
  const [entrepotId, setEntrepotId] = useState<string | null>(initial?.entrepotId ?? null);
  const entrepotIdRef = useRef(entrepotId);
  useEffect(() => {
    entrepotIdRef.current = entrepotId;
  }, [entrepotId]);

  // --- Avenant : "Vendre à crédit" (règles 11-14) ---------------------------
  const [venteACredit, setVenteACredit] = useState(false);
  const [frequenceEcheance, setFrequenceEcheance] = useState<FrequenceEcheanceCredit>("journalier");
  const [blocageCredit, setBlocageCredit] = useState<string | null>(null);
  const [creditGaugeInfo, setCreditGaugeInfo] = useState<{ encoursCredit: number; seuilCreditMax: number } | null>(
    null
  );

  const [factureId, setFactureId] = useState<string | undefined>(initial?.factureId);
  const [numeroFacture, setNumeroFacture] = useState<string | undefined>(initial?.numero);
  // Statut au chargement de la reprise (brouillon ou proforma, cf. EF-FAC-12).
  // Volontairement figé sur la valeur initiale : sert uniquement au badge de
  // désambiguïsation ci-dessous, pas de resynchronisation nécessaire tant que
  // le formulaire est ouvert (une validation renvoie de toute façon vers
  // /mes-factures).
  const [statutInitial] = useState<StatutFacture | undefined>(initial?.statut);
  const [actionEnCours, setActionEnCours] = useState<ActionEnCours>(null);
  const [erreurGlobale, setErreurGlobale] = useState<string | null>(null);
  const [ligneEnErreur, setLigneEnErreur] = useState<string | null>(null);

  const totalHT = useMemo(
    () =>
      lignes.reduce(
        (sum, ligne) =>
          sum + (ligne.type_ligne_produit === "inclus_dans_kit" ? 0 : ligne.quantite * ligne.prix_unitaire),
        0
      ),
    [lignes]
  );
  // Assiette après remise : reprend exactement GREATEST(0, total_ht -
  // remise_montant) de la colonne générée `total_general` (0008, section 1)
  // — la TVA se calcule sur cette assiette, jamais sur le total_ht brut, et
  // ne peut jamais descendre sous 0 même si la remise saisie dépasse le
  // total HT.
  const assietteApresRemise = Math.max(0, totalHT - remise);
  const montantTva = tvaActive ? assietteApresRemise * TVA_TAUX_STANDARD : 0;
  const totalGeneral = assietteApresRemise + forfaitTransport + montantTva;

  const entrepotSelectionne = entrepots.find((e) => e.id === entrepotId);

  // Le stock affiché sur une ligne déjà ajoutée est un instantané capturé au
  // moment de `ajouterProduit()` (voir plus bas) : sans mise à jour en
  // direct, il resterait périmé si un autre agent (ou un ajustement Admin)
  // fait évoluer ce stock pendant la composition de CETTE facture — l'alerte
  // de dépassement de stock (LigneFactureRow) se fierait alors à une donnée
  // obsolète jusqu'à l'échec de validation côté serveur (docs/toast-et-
  // coherence-donnees.md §4c, §5.1). `lignesRef` évite une closure figée sur
  // le premier rendu de l'effet de montage (abonné une seule fois).
  const lignesRef = useRef(lignes);
  useEffect(() => {
    lignesRef.current = lignes;
  }, [lignes]);

  // Chargement des entrepôts actifs (règle 16) — une seule fois au montage.
  // Pré-sélection sûre uniquement s'il n'existe qu'UN SEUL entrepôt actif
  // (aucune ambiguïté possible) ou si `initial.entrepotId` était déjà fourni
  // (reprise d'un brouillon) : jamais de présélection arbitraire parmi
  // plusieurs entrepôts (docs/design-system.md §6.26, D-22).
  useEffect(() => {
    let annule = false;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("entrepots")
        .select("id, nom, adresse, actif, created_at, updated_at")
        .eq("actif", true)
        .order("nom", { ascending: true });
      if (annule) return;
      const liste = (data as EntrepotRow[]) ?? [];
      setEntrepots(liste);
      setEntrepotsChargement(false);
      setEntrepotId((prev) => prev ?? (liste.length === 1 ? liste[0].id : prev));
    })();
    return () => {
      annule = true;
    };
  }, []);

  // Règle 16 : si l'agent change d'entrepôt en cours de saisie, les
  // quantités disponibles déjà affichées sur les lignes existantes doivent
  // se recalculer pour CE nouvel entrepôt (jamais rester sur le stock de
  // l'entrepôt précédemment sélectionné).
  useEffect(() => {
    if (!entrepotId) return;
    const produitIds = lignesRef.current.map((l) => l.produit_id);
    if (produitIds.length === 0) return;
    let annule = false;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("stock_entrepot")
        .select("produit_id, quantite_stock")
        .eq("entrepot_id", entrepotId)
        .in("produit_id", produitIds);
      if (annule) return;
      const stockParProduit = new Map<string, number>(
        ((data as { produit_id: string; quantite_stock: number }[]) ?? []).map((s) => [
          s.produit_id,
          s.quantite_stock,
        ])
      );
      setLignes((prev) =>
        prev.map((l) => ({ ...l, stock_disponible: stockParProduit.get(l.produit_id) ?? 0 }))
      );
    })();
    return () => {
      annule = true;
    };
  }, [entrepotId]);

  // Alerte stock en temps réel — scopée à `stock_entrepot` (source de vérité
  // depuis l'avenant, règle 16), plus `produits.quantite_stock` (dépréciée,
  // gelée, plus jamais mise à jour par aucun trigger depuis la migration
  // 0013 — écouter cette table ne recevrait plus jamais aucun événement
  // pertinent). Filtré côté client sur `entrepotIdRef.current` : seul un
  // changement de stock DANS L'ENTREPÔT ACTUELLEMENT SÉLECTIONNÉ doit
  // rafraîchir l'affichage de cette facture en cours de saisie.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel("nouvelle-facture-stock-entrepot");

    channel.on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "stock_entrepot" },
      (payload) => {
        const stockMaj = payload.new as StockEntrepotRow;
        if (stockMaj.entrepot_id !== entrepotIdRef.current) return;
        const ligne = lignesRef.current.find((l) => l.produit_id === stockMaj.produit_id);
        if (!ligne) return;

        setLignes((prev) =>
          prev.map((l) =>
            l.produit_id === stockMaj.produit_id ? { ...l, stock_disponible: stockMaj.quantite_stock } : l
          )
        );
        showToast(
          `Le stock de ${ligne.nom} a changé pendant votre saisie : ${stockMaj.quantite_stock} ${ligne.unite} restant(s).`,
          "warning"
        );
      }
    );

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pré-contrôle crédit (règles 12/13) — feedback immédiat, JAMAIS une
  // garantie : ne se déclenche que si "Vendre à crédit" est coché (aucun
  // coût réseau supplémentaire pour la vente comptant normale), débounce
  // 400ms pour ne pas déclencher une requête à chaque frappe pendant que le
  // total de la facture varie encore.
  useEffect(() => {
    // Pas de reset synchrone de blocageCredit/creditGaugeInfo ici (évite un
    // setState synchrone en tête d'effet, règle react-hooks/set-state-in-effect
    // — même idiome que ClientAutocomplete/ProduitAutocomplete ci-dessus) :
    // le panneau qui les affiche est de toute façon masqué par la condition
    // JSX `{venteACredit && (...)}` tant que la case n'est pas cochée, donc
    // un état momentanément périmé pendant qu'il est caché est sans
    // conséquence visible — il sera recalculé au prochain déclenchement.
    if (!venteACredit || !client) {
      return;
    }
    const timeout = setTimeout(async () => {
      const precontrole = await precontrolerCredit(client.id, client.nom, totalGeneral);
      setBlocageCredit(precontrole.bloque ? (precontrole.message ?? null) : null);
      // Jauge = encours projeté (encours actuel + CETTE vente), pas
      // seulement l'encours actuel : donne à l'agent un aperçu direct de
      // "où on en serait si je valide maintenant", cohérent avec le calcul
      // réellement fait par le trigger serveur bloquer_nouveau_credit().
      setCreditGaugeInfo({
        encoursCredit: precontrole.encoursActuel + totalGeneral,
        seuilCreditMax: precontrole.seuilMax,
      });
    }, 400);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venteACredit, client?.id, totalGeneral]);

  function ajouterProduit(produit: ProduitAvecStockEntrepot) {
    if (!entrepotId) return; // défensif : ProduitAutocomplete est désactivé sans entrepôt sélectionné
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
          prix_unitaire: produit.type_ligne_produit === "inclus_dans_kit" ? 0 : produit.prix_unitaire ?? 0,
          stock_disponible: quantiteStock,
          type_ligne_produit: produit.type_ligne_produit,
        },
      ];
    });
  }

  function construirePayload() {
    return {
      client_id: client?.id ?? "",
      entrepot_id: entrepotId ?? "",
      lignes,
      remise,
      forfait_transport: forfaitTransport,
      tva_active: tvaActive,
      tva_taux: TVA_TAUX_STANDARD,
      date_echeance: dateEcheance,
      notes,
    };
  }

  async function handleEnregistrerBrouillon() {
    setErreurGlobale(null);
    setLigneEnErreur(null);
    const parsed = factureSchema.safeParse(construirePayload());
    if (!parsed.success) {
      setErreurGlobale(parsed.error.issues[0]?.message ?? "Facture invalide.");
      return;
    }

    setActionEnCours("brouillon");
    const result = await enregistrerBrouillon({ factureId, ...parsed.data });
    setActionEnCours(null);

    if (result.error || !result.data) {
      setErreurGlobale(result.error ?? "Erreur inconnue.");
      showToast(result.error ?? "Erreur inconnue.", "error");
      return;
    }

    setFactureId(result.data.id);
    setNumeroFacture(result.data.numero);
    showToast(`Brouillon ${result.data.numero} enregistré.`, "success");
  }

  async function handleValider(cible: "proforma" | "validee") {
    setErreurGlobale(null);
    setLigneEnErreur(null);
    const parsed = factureSchema.safeParse(construirePayload());
    if (!parsed.success) {
      setErreurGlobale(parsed.error.issues[0]?.message ?? "Facture invalide.");
      return;
    }

    setActionEnCours(cible);

    // Vente à crédit : décision de conception — seule la validation
    // DÉFINITIVE (cible === "validee") ouvre réellement un crédit. Un
    // brouillon/proforma coché "Vendre à crédit" n'a encore aucun effet
    // financier (ni côté facture, ni côté crédit) : proforma reste un simple
    // devis, pas un engagement (cf. RecapTotaux, la case n'est qu'une
    // intention tant que "Valider (facture définitive)" n'a pas été cliqué).
    if (cible === "validee" && venteACredit && client) {
      const precontrole = await precontrolerCredit(client.id, client.nom, totalGeneral);
      if (precontrole.bloque) {
        setActionEnCours(null);
        const message = precontrole.message ?? "Crédit refusé.";
        setErreurGlobale(message);
        showToast(message, "error", { persistent: true });
        return;
      }
    }

    const enregistre = await enregistrerBrouillon({ factureId, ...parsed.data });
    if (enregistre.error || !enregistre.data) {
      setActionEnCours(null);
      setErreurGlobale(enregistre.error ?? "Erreur inconnue.");
      showToast(enregistre.error ?? "Erreur inconnue.", "error");
      return;
    }
    setFactureId(enregistre.data.id);
    setNumeroFacture(enregistre.data.numero);

    // Ouverture du crédit AVANT la validation définitive de la facture (pas
    // après) : si le serveur refuse ce crédit (course concurrente malgré le
    // pré-contrôle ci-dessus — cf. lib/actions/credits.ts), la facture reste
    // au statut brouillon plutôt que validée sans crédit pour tracer la somme due.
    if (cible === "validee" && venteACredit && client) {
      const creditResult = await ouvrirCreditPourFacture({
        client_id: client.id,
        facture_id: enregistre.data.id,
        montant_total: totalGeneral,
        frequence_echeance: frequenceEcheance,
      });
      if (creditResult.error || !creditResult.data) {
        setActionEnCours(null);
        const message = creditResult.error ?? "Impossible d'ouvrir un crédit pour cette facture.";
        setErreurGlobale(message);
        showToast(message, "error", { persistent: true });
        return;
      }
    }

    const result = await validerFacture(enregistre.data.id, cible);
    setActionEnCours(null);

    if (result.error || !result.data) {
      setErreurGlobale(result.error ?? "Erreur inconnue.");
      if (result.ligneProduitNom) {
        setLigneEnErreur(result.ligneProduitNom);
        setEtape(2);
        requestAnimationFrame(() => titreEtapeRef.current?.focus());
      }
      showToast(result.error ?? "Erreur inconnue.", "error");
      return;
    }

    showToast(
      `Facture ${result.data.numero} ${cible === "validee" ? "validée" : "enregistrée en proforma"}.`,
      "success"
    );
    router.push(`${redirectApresValidation}/${enregistre.data.id}`);
  }

  const soumissionBloquee = actionEnCours !== null || !entrepotId;

  function changerEtape(cible: number) {
    if (actionEnCours !== null) return;
    if (cible > etape) {
      const schema = cible === 2
        ? factureSchema.pick({ client_id: true, entrepot_id: true })
        : factureSchema.pick({ client_id: true, entrepot_id: true, lignes: true });
      const resultat = schema.safeParse(construirePayload());
      if (!resultat.success) {
        setErreurGlobale(resultat.error.issues[0]?.message ?? "Vérifiez les informations saisies.");
        return;
      }
    }
    setErreurGlobale(null);
    setEtape(cible);
    requestAnimationFrame(() => {
      titreEtapeRef.current?.focus({ preventScroll: true });
      titreEtapeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  return (
    <div className="flex flex-col gap-6 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          {brand && <CompanyBrandMark nom={brand.nom} logoUrl={brand.logoUrl} size="sm" />}
          <h1 className="text-h1 text-text">
            {statutInitial ? "Modifier la facture" : "Nouvelle facture"}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {statutInitial && <StatusBadge statut={statutInitial} />}
          {numeroFacture && (
            <span className="rounded-input bg-surface-2 px-3 py-1.5 font-mono text-body-sm text-muted">
              {numeroFacture}
            </span>
          )}
        </div>
      </div>

      <nav aria-label="Étapes de la facture" className="grid grid-cols-3 gap-2">
        {["Client", "Produits", "Vérifier"].map((libelle, index) => (
          <button
            key={libelle}
            type="button"
            onClick={() => changerEtape(index + 1)}
            disabled={actionEnCours !== null || (index > 0 && (!client || !entrepotId)) || (index === 2 && lignes.length === 0)}
            aria-current={etape === index + 1 ? "step" : undefined}
            className={`focus-ring min-h-14 rounded-card border px-2 py-3 text-body-sm font-medium disabled:opacity-40 ${etape === index + 1 ? "border-green bg-green/10 text-text" : "border-border bg-surface text-muted"}`}
          >
            <span className="mr-1">{index + 1}.</span> {libelle}
          </button>
        ))}
      </nav>

      {/* Règle métier 16 (docs/design-system.md §6.26) : sticky, en tête du
          formulaire, toujours visible pendant le défilement — jamais un
          <select> refermé ni une valeur par défaut invisible. */}
      <div className="sticky top-16 z-sticky -mx-4 bg-surface px-4 py-3">
        {entrepotsChargement ? (
          // EntrepotSelector (components/ui/) n'a pas d'état de chargement
          // dédié : lui passer une liste vide pendant la requête initiale
          // afficherait à tort "Aucun entrepôt configuré" (InlineAlert
          // rouge) pendant quelques centaines de ms. Skeleton local (docs
          // §6.26 : "shimmer à la forme exacte des chips") le temps du fetch,
          // sans toucher au composant partagé avec l'Espace Admin.
          <div className="flex flex-col gap-1.5">
            <p className="text-body font-medium text-text">Entrepôt source</p>
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-11 w-32" />
              <Skeleton className="h-11 w-28" />
              <Skeleton className="h-11 w-36" />
            </div>
          </div>
        ) : (
          <EntrepotSelector
            label="Entrepôt source"
            entrepots={entrepots}
            value={entrepotId}
            onChange={(id) => {
              setEntrepotId(id);
              if (etape === 3) setEtape(2);
            }}
            disabled={actionEnCours !== null}
          />
        )}
      </div>

      {statutInitial === "proforma" && (
        <InlineAlert tone="blue">
          Vous modifiez une facture déjà en <strong>proforma</strong> (pas un simple brouillon). En
          cliquant sur « Créer la facture », elle passera directement au statut validée,
          sans ressaisie.
        </InlineAlert>
      )}

      <h2 ref={titreEtapeRef} tabIndex={-1} className="text-h2 text-text outline-none">
        {etape === 1 ? "À qui vendez-vous ?" : etape === 2 ? "Quels produits ?" : "Vérifiez votre facture"}
      </h2>
      {erreurGlobale && <div role="alert"><InlineAlert tone="red">{erreurGlobale}</InlineAlert></div>}

      {etape === 1 && <ClientAutocomplete value={client} onChange={setClient} />}

      {etape === 2 && <div className="flex flex-col gap-3">
        <ProduitAutocomplete entrepotId={entrepotId} onSelect={ajouterProduit} />

        {lignes.length === 0 ? (
          <p className="rounded-card border border-dashed border-border bg-surface-2 p-4 text-center text-body text-muted">
            Aucun produit ajouté. Recherchez un article par code ou par nom ci-dessus.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {lignes.map((ligne, index) => (
              <LigneFactureRow
                key={ligne.produit_id}
                ligne={ligne}
                erreurServeur={ligneEnErreur === ligne.nom ? erreurGlobale ?? undefined : undefined}
                onQuantiteChange={(quantite) =>
                  setLignes((prev) => prev.map((l, i) => (i === index ? { ...l, quantite } : l)))
                }
                onPrixChange={(prix_unitaire) =>
                  setLignes((prev) => prev.map((l, i) => (i === index ? { ...l, prix_unitaire } : l)))
                }
                onRemove={() => setLignes((prev) => prev.filter((_, i) => i !== index))}
              />
            ))}
          </div>
        )}
      </div>}

      {etape === 3 && <>
      <div className="rounded-card border border-border bg-surface p-4">
        <p className="font-medium text-text">{client?.nom}</p>
        <p className="text-body-sm text-muted">Entrepôt : {entrepotSelectionne?.nom}</p>
        <ul className="mt-3 divide-y divide-border">
          {lignes.map((ligne) => <li key={ligne.produit_id} className="flex justify-between gap-3 py-3 text-body-sm">
            <span>{ligne.nom} <span className="text-muted">× {ligne.quantite}</span></span>
            <span className="shrink-0 font-mono">{ligne.type_ligne_produit === "inclus_dans_kit" ? "Inclus" : formatMontant(ligne.quantite * ligne.prix_unitaire)}</span>
          </li>)}
        </ul>
      </div>
      <RecapTotaux
        totalHT={totalHT}
        remise={remise}
        onRemiseChange={setRemise}
        forfaitTransport={forfaitTransport}
        onForfaitTransportChange={setForfaitTransport}
        tvaActive={tvaActive}
        onTvaActiveChange={setTvaActive}
        tvaTaux={TVA_TAUX_STANDARD}
        montantTva={montantTva}
        totalGeneral={totalGeneral}
      />

      {/* Avenant : "Vendre à crédit" (règles 11-14, migration 0013 sections
          7-8) — ajout pur, aucun effet sur le parcours comptant tant que la
          case n'est pas cochée (ni requête réseau, ni changement de
          comportement des 3 actions ci-dessous). */}
      <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4">
        <label className="flex items-center justify-between gap-3">
          <span className="flex flex-col">
            <span className="text-body font-medium text-text">Vendre à crédit</span>
            <span className="text-body-sm text-muted">
              {client
                ? "Le crédit sera ouvert lorsque vous cliquerez sur « Créer la facture »."
                : "Sélectionnez d'abord un client."}
            </span>
          </span>
          <input
            type="checkbox"
            checked={venteACredit}
            disabled={!client}
            onChange={(e) => setVenteACredit(e.target.checked)}
            className="focus-ring tap-target h-5 w-5 shrink-0 rounded-input border-border accent-green disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Vendre à crédit"
          />
        </label>

        {venteACredit && (
          <div className="flex flex-col gap-3 border-t border-border pt-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="frequence-echeance" className="text-body font-medium text-text">
                Échéancier de remboursement
              </label>
              <select
                id="frequence-echeance"
                value={frequenceEcheance}
                onChange={(e) => setFrequenceEcheance(e.target.value as FrequenceEcheanceCredit)}
                className="focus-ring h-tap w-full rounded-input border border-border bg-surface px-3 text-body text-text"
              >
                <option value="journalier">Journalier</option>
                <option value="mensuel">Mensuel</option>
              </select>
            </div>

            {creditGaugeInfo && (
              <div className="flex flex-col gap-1.5">
                <span className="text-body-sm text-muted">
                  Encours de crédit projeté si cette facture est validée à crédit
                </span>
                <CreditGauge
                  compact
                  encoursCredit={creditGaugeInfo.encoursCredit}
                  seuilCreditMax={creditGaugeInfo.seuilCreditMax}
                />
              </div>
            )}

            {blocageCredit && <InlineAlert tone="red">{blocageCredit}</InlineAlert>}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1.5 rounded-card border border-border bg-surface p-4">
        <label htmlFor="date-echeance" className="text-body font-medium text-text">
          Échéance de paiement (optionnel)
        </label>
        <input
          id="date-echeance"
          type="date"
          value={dateEcheance}
          min={new Date().toISOString().slice(0, 10)}
          onChange={(e) => setDateEcheance(e.target.value)}
          className="focus-ring h-tap w-full rounded-input border border-border bg-surface px-3 text-body text-text sm:w-56"
        />
        <p className="text-body-sm text-muted">
          Sans date, la facture passe en retard 10 jours après sa validation.
        </p>
      </div>

      <details className="rounded-card border border-border bg-surface p-4" open={notes ? true : undefined}>
        <summary className="focus-ring cursor-pointer text-body font-medium text-text">Ajouter une note (optionnel)</summary>
      <div className="mt-3 flex flex-col gap-1.5">
        <label htmlFor="notes" className="text-body font-medium text-text">
          Notes (optionnel)
        </label>
        <textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="focus-ring w-full rounded-input border border-border bg-surface px-3 py-2 text-body text-text"
          placeholder="Précision à ajouter sur la facture..."
        />
      </div>
      </details>

      <details className="rounded-card border border-border bg-surface p-4">
        <summary className="focus-ring cursor-pointer text-body font-medium text-text">Enregistrer un brouillon ou un devis</summary>
        <p className="my-3 text-body-sm text-muted">Le brouillon reste modifiable. Le devis (proforma) peut être partagé avant de créer la facture définitive.</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="button" variant="outline" loading={actionEnCours === "brouillon"} disabled={soumissionBloquee} onClick={handleEnregistrerBrouillon}>Enregistrer en brouillon</Button>
          <Button type="button" variant="outline" loading={actionEnCours === "proforma"} disabled={soumissionBloquee} onClick={() => handleValider("proforma")}>Créer un devis (proforma)</Button>
        </div>
      </details>
      <p className="text-body-sm text-muted">La facture ne modifie pas le stock. Créez ensuite un bon de livraison pour enregistrer la sortie des produits.</p>
      </>}

      <div
        className={`sticky z-sticky -mx-4 flex flex-col gap-2 border-t border-border bg-surface p-4 sm:flex-row sm:justify-end ${
          sansBarreOngletsMobile ? "bottom-0" : "bottom-[calc(4rem+env(safe-area-inset-bottom))] md:bottom-0"
        }`}
      >
        <div className="flex items-center justify-between gap-3 sm:mr-auto">
          {etape > 1 && <Button type="button" variant="outline" disabled={actionEnCours !== null} onClick={() => changerEtape(etape - 1)}>Retour</Button>}
          <span className="text-body-sm text-muted">Total <strong className="font-mono text-text">{formatMontant(totalGeneral)}</strong></span>
        </div>
        <Button
          type="button"
          variant="primary"
          size="lg"
          fullWidth
          className="sm:w-auto"
          loading={actionEnCours === "validee"}
          disabled={actionEnCours !== null || entrepotsChargement}
          onClick={() => etape < 3 ? changerEtape(etape + 1) : handleValider("validee")}
        >
          {etape === 1 ? "Choisir les produits" : etape === 2 ? "Vérifier la facture" : "Créer la facture"}
        </Button>
      </div>
    </div>
  );
}

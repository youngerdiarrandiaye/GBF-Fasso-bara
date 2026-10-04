/**
 * Types TypeScript du schéma Supabase, écrits à la main à partir de
 * supabase/migrations/0001_schema_initial.sql, 0002_ajustements_backend.sql
 * et 0003_correctifs_securite.sql (agent architecte-bdd).
 *
 * Couvrait initialement seulement l'Espace Agent ; complété par
 * dev-frontend-admin (Phase 4b) avec les tables/colonnes nécessaires à
 * l'Espace Admin (entreprise_config complet, categories_produits,
 * mouvements_stock, paiements, alertes_stock, journal_activites) — sans
 * dupliquer les types déjà utilisés par l'Espace Agent ci-dessus.
 * Si le schéma évolue (nouvelle migration), ce fichier doit être mis à jour
 * en conséquence — idéalement remplacé par `supabase gen types typescript`
 * une fois un projet Supabase réel branché.
 */

export type RoleUtilisateur = "admin" | "agent";

export type StatutFacture =
  | "brouillon"
  | "proforma"
  | "validee"
  | "payee_partielle"
  | "payee"
  | "annulee";

export type TypeClient = "particulier" | "entreprise" | "cooperative";

export type UniteProduit = "piece" | "kit" | "metre" | "rouleau" | "forfait";

export type TypeLigneProduit = "vendu_separement" | "inclus_dans_kit";

export type ModePaiement = "especes" | "virement" | "mobile_money" | "cheque";

// NB (dev-frontend-agent) : les types énumérés de l'avenant Crédit / Bon de
// Livraison / Multi-entrepôts (StatutCredit, FrequenceEcheanceCredit,
// StatutBonLivraison, StatutTransfertStock) sont déjà déclarés plus bas dans
// ce fichier (bloc "Avenant n°1", ajouté par dev-frontend-admin) — pas de
// redéclaration ici pour éviter un doublon d'export TypeScript.

export interface UtilisateurRow {
  id: string;
  nom: string;
  role: RoleUtilisateur;
  actif: boolean;
  created_at: string;
  updated_at: string;
}

export interface ClientRow {
  id: string;
  nom: string;
  type_client: TypeClient;
  adresse: string | null;
  telephone: string | null;
  email: string | null;
  ninea: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProduitRow {
  id: string;
  code: string;
  nom: string;
  description: string | null;
  categorie_id: string | null;
  unite: UniteProduit;
  prix_unitaire: number | null;
  type_ligne_produit: TypeLigneProduit;
  kit_parent_id: string | null;
  quantite_stock: number;
  seuil_alerte: number;
  photos_urls: string[];
  actif: boolean;
  created_at: string;
  updated_at: string;
}

export interface FactureRow {
  id: string;
  numero: string;
  client_id: string;
  agent_id: string;
  statut: StatutFacture;
  total_ht: number;
  remise_montant: number;
  forfait_transport: number;
  tva_taux: number;
  total_general: number;
  date_facture: string;
  date_validation: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  /** Entrepôt source repris par le BL. Depuis 0017, la facture ne modifie pas le stock. */
  entrepot_id: string;
  /** Ancien lien conservé pour historique. Les nouveaux BL utilisent bons_livraison.facture_id. */
  bon_livraison_id: string | null;
}

export interface LigneFactureRow {
  id: string;
  facture_id: string;
  produit_id: string;
  quantite: number;
  prix_unitaire: number;
  total_ligne: number;
  created_at: string;
  updated_at: string;
}

/**
 * Ligne complète de entreprise_config (0001 section 2), lecture réservée à
 * l'admin depuis 0003 (policy entreprise_config_lecture_admin) — colonnes
 * bancaires incluses. Ne JAMAIS lire cette table depuis l'Espace Agent (voir
 * EntrepriseConfigPublicRow ci-dessous pour l'équivalent non sensible).
 */
export interface EntrepriseConfigRow {
  id: true;
  nom: string;
  activites: string[];
  adresses: string[];
  telephones: string[];
  email: string | null;
  ninea: string | null;
  rc: string | null;
  banque_nom: string | null;
  banque_code: string | null;
  banque_agence: string | null;
  banque_numero_compte: string | null;
  banque_cle_rib: string | null;
  iban: string | null;
  swift: string | null;
  logo_url: string | null;
  modalites_reglement: string;
  delai_disponibilite: string | null;
  validite_proforma_jours: number;
  created_at: string;
  updated_at: string;
  /** Image du tampon/signature officiel (0007_tampon_entreprise.sql), même bucket public `logo` que logo_url. */
  tampon_url: string | null;
  /** Règle métier 12 (0013_avenant_credit_entrepots.sql) : plafond global de l'encours de crédit ('en_cours', tous clients confondus). Défaut 0 = crédit désactivé tant qu'un admin ne l'a pas configuré. */
  seuil_credit_max: number;
}

/** Vue entreprise_config_public (0003 section 20) : aucune colonne bancaire. */
export type EntrepriseConfigPublicRow = Omit<
  EntrepriseConfigRow,
  | "banque_nom"
  | "banque_code"
  | "banque_agence"
  | "banque_numero_compte"
  | "banque_cle_rib"
  | "iban"
  | "swift"
>;

export interface CategorieProduitRow {
  id: string;
  nom: string;
  created_at: string;
}

export interface MouvementStockRow {
  id: string;
  produit_id: string;
  type: TypeMouvementStock;
  quantite: number;
  motif: string | null;
  reference_facture_id: string | null;
  utilisateur_id: string | null;
  created_at: string;
}

export type TypeMouvementStock = "entree" | "sortie" | "ajustement";

export interface PaiementRow {
  id: string;
  facture_id: string;
  montant: number;
  mode_paiement: ModePaiement;
  reference: string | null;
  date_paiement: string;
  utilisateur_id: string | null;
  created_at: string;
}

export interface AlerteStockRow {
  id: string;
  produit_id: string;
  type: "stock_bas" | "rupture";
  message: string;
  lue: boolean;
  created_at: string;
  updated_at: string;
}

export interface AlerteFactureRow {
  id: string;
  facture_id: string;
  jours_de_retard: number;
  message: string;
  lue: boolean;
  created_at: string;
  updated_at: string;
}

/** Ligne de la vue v_factures_retard_paiement (règle métier 10, 0009). Vue
 * security_invoker=true : déjà filtrée par les RLS de factures/paiements
 * (un agent n'y voit que ses propres factures, un admin les voit toutes). */
export interface FactureRetardPaiementRow {
  facture_id: string;
  numero: string;
  client_id: string;
  client_nom: string;
  client_telephone: string | null;
  agent_id: string;
  agent_nom: string;
  statut: StatutFacture;
  total_general: number;
  solde_restant: number;
  date_facture: string;
  date_validation: string;
  jours_de_retard: number;
}

export interface JournalActiviteRow {
  id: string;
  utilisateur_id: string | null;
  action: string;
  table_cible: string;
  avant: Record<string, unknown> | null;
  apres: Record<string, unknown> | null;
  created_at: string;
}

/** Ligne de facture enrichie du produit associé (jointure lecture). */
export interface LigneFactureAvecProduit extends LigneFactureRow {
  produit: Pick<
    ProduitRow,
    "id" | "code" | "nom" | "unite" | "type_ligne_produit" | "quantite_stock" | "photos_urls"
  >;
}

/** Facture enrichie du client associé (jointure lecture, liste "Mes factures"). */
export interface FactureAvecClient extends FactureRow {
  client: Pick<ClientRow, "id" | "nom" | "telephone">;
}

/** Facture enrichie client + agent — vue globale Admin (tous agents confondus). */
export interface FactureAvecClientEtAgent extends FactureRow {
  client: Pick<ClientRow, "id" | "nom" | "telephone" | "type_client">;
  agent: Pick<UtilisateurRow, "id" | "nom">;
}

/** Produit enrichi de sa catégorie (catalogue Admin). */
export interface ProduitAvecCategorie extends ProduitRow {
  categorie: Pick<CategorieProduitRow, "id" | "nom"> | null;
}

/** Client enrichi d'un agrégat de solde impayé (liste/fiche client Admin). */
export interface ClientAvecSolde extends ClientRow {
  solde_impaye: number;
  nb_factures: number;
}

/**
 * =============================================================================
 * Avenant n°1 — Crédit client / Bon de Livraison / Multi-entrepôts
 * (supabase/migrations/0013_avenant_credit_entrepots.sql, agent architecte-bdd)
 * Types énumérés + interfaces de lignes/jointures ajoutés par
 * dev-frontend-admin (Phase C) — écrit à la main, même convention que le
 * reste de ce fichier (pas de génération automatique). Déclarés une seule
 * fois ici (StatutCredit, FrequenceEcheanceCredit, StatutBonLivraison,
 * StatutTransfertStock) : voir la note en tête de fichier — dev-frontend-agent
 * ne les redéclare pas de son côté, pour éviter un conflit d'identifiant.
 * =============================================================================
 */

export type StatutCredit = "en_cours" | "solde";

export type FrequenceEcheanceCredit = "journalier" | "mensuel";

export type StatutTransfertStock = "demande" | "en_transit" | "receptionne" | "annule";

export type StatutBonLivraison = "livre_non_paye" | "livre_paye";

export interface EntrepotRow {
  id: string;
  nom: string;
  adresse: string | null;
  actif: boolean;
  created_at: string;
  updated_at: string;
}

/** Règle métier 16 : source de vérité du stock, PAR (produit, entrepôt) — remplace produits.quantite_stock/seuil_alerte (dépréciées, cf. migration 0013 en-tête). */
export interface StockEntrepotRow {
  id: string;
  produit_id: string;
  entrepot_id: string;
  quantite_stock: number;
  seuil_alerte: number;
  created_at: string;
  updated_at: string;
}

export interface TransfertStockRow {
  id: string;
  produit_id: string;
  entrepot_source_id: string;
  entrepot_destination_id: string;
  quantite: number;
  statut: StatutTransfertStock;
  demande_par_id: string;
  receptionne_par_id: string | null;
  date_demande: string;
  date_transit: string | null;
  date_reception: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreditRow {
  id: string;
  client_id: string;
  facture_id: string | null;
  agent_id: string;
  montant_total: number;
  montant_rembourse: number;
  /** Colonne générée (montant_total - montant_rembourse), maintenue en base — jamais recalculée côté client (règle 4d). */
  solde_restant: number;
  frequence_echeance: FrequenceEcheanceCredit;
  statut: StatutCredit;
  date_ouverture: string;
  date_solde: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface RemboursementCreditRow {
  id: string;
  credit_id: string;
  montant: number;
  date_remboursement: string;
  utilisateur_id: string | null;
  notes: string | null;
  created_at: string;
}

export interface BonLivraisonRow {
  id: string;
  numero: string;
  client_id: string;
  facture_id: string | null;
  entrepot_id: string;
  agent_id: string;
  statut: StatutBonLivraison;
  date_livraison: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface LigneBonLivraisonRow {
  id: string;
  bon_livraison_id: string;
  produit_id: string;
  quantite: number;
  created_at: string;
  updated_at: string;
}

/** Ligne de stock_entrepot enrichie du produit associé (écran Entrepôts). */
export interface StockEntrepotAvecProduit extends StockEntrepotRow {
  produit: Pick<ProduitRow, "id" | "code" | "nom" | "unite" | "actif">;
}

/** Ligne de stock_entrepot enrichie de l'entrepôt associé (fiche produit / vue par entrepôt). */
export interface StockEntrepotAvecEntrepot extends StockEntrepotRow {
  entrepot: Pick<EntrepotRow, "id" | "nom" | "actif">;
}

/** Transfert enrichi du produit et des deux entrepôts (écran Transferts de stock). */
export interface TransfertAvecDetails extends TransfertStockRow {
  produit: Pick<ProduitRow, "id" | "code" | "nom" | "unite">;
  entrepot_source: Pick<EntrepotRow, "id" | "nom">;
  entrepot_destination: Pick<EntrepotRow, "id" | "nom">;
  demande_par: Pick<UtilisateurRow, "id" | "nom"> | null;
  receptionne_par: Pick<UtilisateurRow, "id" | "nom"> | null;
}

/** Crédit enrichi du client et de l'agent (écran Crédits & Recouvrement). */
export interface CreditAvecClient extends CreditRow {
  client: Pick<ClientRow, "id" | "nom" | "telephone">;
  agent: Pick<UtilisateurRow, "id" | "nom">;
}

/** Bon de livraison enrichi du client, de l'agent et de l'entrepôt (écran Bons de livraison). */
export interface BonLivraisonAvecDetails extends BonLivraisonRow {
  client: Pick<ClientRow, "id" | "nom" | "telephone">;
  agent: Pick<UtilisateurRow, "id" | "nom">;
  entrepot: Pick<EntrepotRow, "id" | "nom">;
}

/** Ligne de bon de livraison enrichie du produit associé (détail BL). */
export interface LigneBonLivraisonAvecProduit extends LigneBonLivraisonRow {
  produit: Pick<ProduitRow, "id" | "code" | "nom" | "unite">;
}

/**
 * Ajouts dev-frontend-agent (Phase C, Espace Agent) sur ce même bloc avenant.
 */

/** Facture enrichie du client ET de l'entrepôt source (filtre entrepôt, "Mes factures"). */
export interface FactureAvecClientEtEntrepot extends FactureAvecClient {
  entrepot: Pick<EntrepotRow, "id" | "nom"> | null;
}

/**
 * Produit enrichi du stock scopé à UN entrepôt précis, via jointure
 * `stock_entrepot` filtrée côté requête (`.eq("stock_entrepot.entrepot_id",
 * id)`) — remplace la lecture désormais dépréciée de
 * produits.quantite_stock/seuil_alerte (règle 16, migration 0013). Le tableau
 * contient 0 ou 1 ligne (contrainte UNIQUE (produit_id, entrepot_id)) : 0 si
 * ce produit n'a jamais été stocké dans cet entrepôt (stock conventionnellement
 * nul), jamais absent du tout (toujours un tableau, éventuellement vide).
 */
export interface ProduitAvecStockEntrepot extends Omit<ProduitRow, "quantite_stock" | "seuil_alerte"> {
  stock_entrepot: Pick<StockEntrepotRow, "quantite_stock" | "seuil_alerte" | "entrepot_id">[];
}

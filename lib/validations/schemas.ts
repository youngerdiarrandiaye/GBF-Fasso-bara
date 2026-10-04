import { z } from "zod";

/**
 * Schémas Zod — feedback immédiat côté client uniquement. Ils ne remplacent
 * JAMAIS la validation serveur : chaque Server Action (lib/actions/*) revalide
 * ces mêmes règles avant toute écriture réelle, et la base de données
 * (contraintes CHECK, triggers) fait foi en dernier ressort (ex : stock
 * insuffisant, ne peut être garanti que par decrementer_stock() en base).
 */

export const clientRapideSchema = z.object({
  nom: z
    .string()
    .trim()
    .min(2, "Le nom du client doit contenir au moins 2 caractères."),
  type_client: z.enum(["particulier", "entreprise", "cooperative"]),
  telephone: z
    .string()
    .trim()
    .min(6, "Numéro de téléphone trop court.")
    .optional()
    .or(z.literal("")),
  adresse: z.string().trim().optional().or(z.literal("")),
  email: z.string().trim().email("Adresse e-mail invalide.").optional().or(z.literal("")),
});

export type ClientRapideInput = z.infer<typeof clientRapideSchema>;

export const ligneFactureSchema = z.object({
  produit_id: z.string().uuid("Produit invalide."),
  code: z.string(),
  nom: z.string(),
  unite: z.string(),
  quantite: z.coerce
    .number({ message: "Quantité invalide." })
    .positive("La quantité doit être supérieure à 0."),
  prix_unitaire: z.coerce
    .number({ message: "Prix invalide." })
    .nonnegative("Le prix ne peut pas être négatif."),
  stock_disponible: z.coerce.number().default(0),
  type_ligne_produit: z.enum(["vendu_separement", "inclus_dans_kit"]),
});

export type LigneFactureInput = z.infer<typeof ligneFactureSchema>;

export const factureSchema = z.object({
  client_id: z.string().uuid("Sélectionnez un client avant de continuer."),
  // Règle métier 16 (0013_avenant_credit_entrepots.sql) : entrepôt source
  // obligatoire depuis l'avenant, y compris pour un simple brouillon
  // (contrainte NOT NULL en base sur factures.entrepot_id, sans exception de
  // statut) — cf. EntrepotSelector (docs/design-system.md §6.26), jamais de
  // valeur par défaut invisible.
  entrepot_id: z.string().uuid("Sélectionnez un entrepôt avant de continuer."),
  lignes: z
    .array(ligneFactureSchema)
    .min(1, "Ajoutez au moins une ligne produit à la facture."),
  remise: z.coerce
    .number()
    .nonnegative("La remise ne peut pas être négative.")
    .default(0),
  forfait_transport: z.coerce
    .number()
    .nonnegative("Le forfait transport ne peut pas être négatif.")
    .default(0),
  tva_active: z.boolean().default(false),
  tva_taux: z.coerce.number().min(0).max(1).default(0),
  // Échéance de paiement facultative (0020) : vide => date de validation +
  // 10 jours. La base refuse une échéance antérieure à la date de facture.
  date_echeance: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date d'échéance invalide.")
    .optional()
    .or(z.literal("")),
  notes: z.string().trim().optional().or(z.literal("")),
});

export type FactureInput = z.infer<typeof factureSchema>;

export const TVA_TAUX_STANDARD = 0.18;

export const loginSchema = z.object({
  email: z.string().trim().email("Adresse e-mail invalide."),
  password: z.string().min(6, "Le mot de passe doit contenir au moins 6 caractères."),
});

export type LoginInput = z.infer<typeof loginSchema>;

/**
 * Schémas Zod — Espace Admin (dev-frontend-admin, Phase 4b). Même règle que
 * ci-dessus : feedback client uniquement, toujours rejoués dans la Server
 * Action correspondante avant écriture réelle.
 */

// --- Stock / produits -------------------------------------------------------

export const ajustementStockSchema = z.object({
  produit_id: z.string().uuid("Produit invalide."),
  nouvelle_quantite: z.coerce
    .number({ message: "Quantité invalide." })
    .nonnegative("La quantité ne peut pas être négative."),
  motif: z
    .string()
    .trim()
    .min(5, "Le motif de l'ajustement est obligatoire (5 caractères minimum)."),
});

export type AjustementStockInput = z.infer<typeof ajustementStockSchema>;

export const produitSchema = z.object({
  // Généré côté serveur au format GBF-XX (trigger generer_code_produit(),
  // 0012_generation_code_produit.sql) — plus jamais saisi manuellement dans
  // le formulaire. Optionnel ici uniquement pour ne pas casser le typage de
  // ProductForm en mode édition, où le code existant est réaffiché en
  // lecture seule (non modifiable) via `produit.code`.
  code: z.string().trim().optional(),
  nom: z.string().trim().min(2, "Le nom du produit doit contenir au moins 2 caractères."),
  description: z.string().trim().optional().or(z.literal("")),
  categorie_id: z.string().uuid().optional().or(z.literal("")),
  unite: z.enum(["piece", "kit", "metre", "rouleau", "forfait"]),
  type_ligne_produit: z.enum(["vendu_separement", "inclus_dans_kit"]),
  kit_parent_id: z.string().uuid().optional().or(z.literal("")),
  // Pas de .default() ni de z.coerce ici (ni sur les champs numériques
  // ci-dessous) : combinés à react-hook-form + zodResolver (zod v4), ils
  // rendent le type "d'entrée" du schéma incompatible avec le type "de
  // sortie" utilisé par useForm<ProduitInput> (constaté à la compilation :
  // z.coerce.number() infère un type d'entrée `unknown`). Les champs
  // numériques du formulaire utilisent donc `register(nom, { valueAsNumber:
  // true })` côté ProductForm pour convertir la chaîne de l'input HTML en
  // number AVANT validation Zod, et les valeurs par défaut réelles sont
  // fournies explicitement par `defaultValues` dans ProductForm.
  prix_unitaire: z.number().nonnegative().optional(),
  quantite_stock: z.number().nonnegative(),
  seuil_alerte: z.number().nonnegative(),
  photos_urls: z.array(z.string()),
  actif: z.boolean(),
});

export type ProduitInput = z.infer<typeof produitSchema>;

export const categorieProduitSchema = z.object({
  nom: z.string().trim().min(2, "Le nom de la catégorie doit contenir au moins 2 caractères."),
});

export type CategorieProduitInput = z.infer<typeof categorieProduitSchema>;

// --- Clients (écriture Admin) ------------------------------------------------

export const clientAdminSchema = z.object({
  nom: z.string().trim().min(2, "Le nom du client doit contenir au moins 2 caractères."),
  type_client: z.enum(["particulier", "entreprise", "cooperative"]),
  telephone: z.string().trim().optional().or(z.literal("")),
  adresse: z.string().trim().optional().or(z.literal("")),
  email: z.string().trim().email("Adresse e-mail invalide.").optional().or(z.literal("")),
  ninea: z.string().trim().optional().or(z.literal("")),
});

export type ClientAdminInput = z.infer<typeof clientAdminSchema>;

// --- Paiements ---------------------------------------------------------------

export const paiementSchema = z.object({
  facture_id: z.string().uuid("Facture invalide."),
  // Pas de z.coerce ici : utilisé avec react-hook-form + zodResolver
  // (PaymentModal), voir le commentaire détaillé sur produitSchema plus haut
  // pour la raison exacte. Le champ HTML utilise
  // register("montant", { valueAsNumber: true }).
  montant: z.number({ message: "Montant invalide." }).positive("Le montant du paiement doit être supérieur à 0."),
  mode_paiement: z.enum(["especes", "virement", "mobile_money", "cheque"]),
  reference: z.string().trim().optional().or(z.literal("")),
  date_paiement: z.string().trim().min(1, "La date de paiement est obligatoire."),
});

export type PaiementInput = z.infer<typeof paiementSchema>;

// --- Utilisateurs (admin only) ------------------------------------------------

export const nouvelUtilisateurSchema = z.object({
  nom: z.string().trim().min(2, "Le nom doit contenir au moins 2 caractères."),
  email: z.string().trim().email("Adresse e-mail invalide."),
  password: z.string().min(8, "Le mot de passe doit contenir au moins 8 caractères."),
  role: z.enum(["admin", "agent"]),
});

export type NouvelUtilisateurInput = z.infer<typeof nouvelUtilisateurSchema>;

const nouveauMotDePasse = z.string().min(8, "Le mot de passe doit contenir au moins 8 caractères.");

/** Saisie d'un nouveau mot de passe avec confirmation (admin ou utilisateur lui-même). */
export const nouveauMotDePasseSchema = z
  .object({
    password: nouveauMotDePasse,
    confirmation: z.string(),
  })
  .refine((v) => v.password === v.confirmation, {
    message: "Les deux mots de passe ne correspondent pas.",
    path: ["confirmation"],
  });

export type NouveauMotDePasseInput = z.infer<typeof nouveauMotDePasseSchema>;

export const redefinirMotDePasseSchema = z.object({
  id: z.string().uuid(),
  password: nouveauMotDePasse,
});

export const motDePasseOublieSchema = z.object({
  email: z.string().trim().email("Adresse e-mail invalide."),
});

export type MotDePasseOublieInput = z.infer<typeof motDePasseOublieSchema>;

export const modifierUtilisateurSchema = z.object({
  id: z.string().uuid(),
  nom: z.string().trim().min(2, "Le nom doit contenir au moins 2 caractères."),
  role: z.enum(["admin", "agent"]),
  actif: z.boolean(),
});

export type ModifierUtilisateurInput = z.infer<typeof modifierUtilisateurSchema>;

// --- Paramètres entreprise -----------------------------------------------------

export const entrepriseConfigSchema = z.object({
  nom: z.string().trim().min(2, "Le nom de l'entreprise est obligatoire."),
  // Pas de .default()/z.coerce ici, ni sur validite_proforma_jours plus bas :
  // ce schéma est utilisé avec react-hook-form + zodResolver
  // (CompanySettingsForm) — voir le commentaire détaillé sur produitSchema
  // plus haut. Les tableaux (chips adresses/téléphones/activités) sont
  // gérés en state contrôlé côté formulaire, jamais vides par défaut grâce à
  // `defaultValues`.
  activites: z.array(z.string().trim()),
  adresses: z.array(z.string().trim()),
  telephones: z.array(z.string().trim()),
  email: z.string().trim().email("Adresse e-mail invalide.").optional().or(z.literal("")),
  ninea: z.string().trim().optional().or(z.literal("")),
  rc: z.string().trim().optional().or(z.literal("")),
  banque_nom: z.string().trim().optional().or(z.literal("")),
  banque_code: z.string().trim().optional().or(z.literal("")),
  banque_agence: z.string().trim().optional().or(z.literal("")),
  banque_numero_compte: z.string().trim().optional().or(z.literal("")),
  banque_cle_rib: z.string().trim().optional().or(z.literal("")),
  iban: z.string().trim().optional().or(z.literal("")),
  swift: z.string().trim().optional().or(z.literal("")),
  logo_url: z.string().trim().optional().or(z.literal("")),
  tampon_url: z.string().trim().optional().or(z.literal("")),
  modalites_reglement: z.string().trim().min(1, "Les modalités de règlement sont obligatoires."),
  delai_disponibilite: z.string().trim().optional().or(z.literal("")),
  validite_proforma_jours: z
    .number()
    .int()
    .positive("La validité d'une proforma doit être un nombre de jours positif."),
  // Règle métier 12 (0013_avenant_credit_entrepots.sql) : plafond global de
  // l'encours de crédit. Pas de z.coerce (même raison que les champs
  // numériques ci-dessus) — register("seuil_credit_max", { valueAsNumber: true }).
  seuil_credit_max: z.number().nonnegative("Le seuil ne peut pas être négatif."),
});

export type EntrepriseConfigInput = z.infer<typeof entrepriseConfigSchema>;

// --- Avenant Crédit / Bon de Livraison / Multi-entrepôts (0013) — Phase C ----
// Mêmes règles que les schémas ci-dessus : feedback client uniquement, toujours
// revalidées côté Server Action, la base (contraintes CHECK, triggers de
// 0013_avenant_credit_entrepots.sql) faisant foi en dernier ressort (ex :
// plafond de crédit global, stock insuffisant par entrepôt).

export const entrepotSchema = z.object({
  nom: z.string().trim().min(2, "Le nom de l'entrepôt doit contenir au moins 2 caractères."),
  adresse: z.string().trim().optional().or(z.literal("")),
  actif: z.boolean(),
});

export type EntrepotInput = z.infer<typeof entrepotSchema>;

export const ajustementStockEntrepotSchema = z.object({
  produit_id: z.string().uuid("Produit invalide."),
  entrepot_id: z.string().uuid("Entrepôt invalide."),
  nouvelle_quantite: z.coerce
    .number({ message: "Quantité invalide." })
    .nonnegative("La quantité ne peut pas être négative."),
  motif: z
    .string()
    .trim()
    .min(5, "Le motif de l'ajustement est obligatoire (5 caractères minimum)."),
});

export type AjustementStockEntrepotInput = z.infer<typeof ajustementStockEntrepotSchema>;

export const seuilAlerteEntrepotSchema = z.object({
  produit_id: z.string().uuid("Produit invalide."),
  entrepot_id: z.string().uuid("Entrepôt invalide."),
  seuil: z.coerce.number({ message: "Seuil invalide." }).nonnegative("Le seuil ne peut pas être négatif."),
});

export type SeuilAlerteEntrepotInput = z.infer<typeof seuilAlerteEntrepotSchema>;

export const transfertStockSchema = z
  .object({
    produit_id: z.string().uuid("Sélectionnez un produit."),
    entrepot_source_id: z.string().uuid("Sélectionnez l'entrepôt source."),
    entrepot_destination_id: z.string().uuid("Sélectionnez l'entrepôt destination."),
    quantite: z.coerce
      .number({ message: "Quantité invalide." })
      .positive("La quantité doit être supérieure à 0."),
    notes: z.string().trim().optional().or(z.literal("")),
  })
  .refine((v) => v.entrepot_source_id !== v.entrepot_destination_id, {
    message: "L'entrepôt source et l'entrepôt destination doivent être différents.",
    path: ["entrepot_destination_id"],
  });

export type TransfertStockInput = z.infer<typeof transfertStockSchema>;

export const remboursementCreditSchema = z.object({
  credit_id: z.string().uuid("Sélectionnez un crédit en cours."),
  // Pas de z.coerce ici : utilisé avec react-hook-form + zodResolver
  // (RecouvrementForm), voir le commentaire détaillé sur produitSchema plus
  // haut — register("montant", { valueAsNumber: true }).
  montant: z.number({ message: "Montant invalide." }).positive("Le montant du recouvrement doit être supérieur à 0."),
  date_remboursement: z.string().trim().min(1, "La date est obligatoire."),
  notes: z.string().trim().optional().or(z.literal("")),
});

export type RemboursementCreditInput = z.infer<typeof remboursementCreditSchema>;

// --- Ouverture d'un crédit (Espace Agent, "Vendre à crédit" sur Nouvelle
// facture) — distinct de remboursementCreditSchema ci-dessus (recouvrement).
// Même règle absolue rappelée dans le brief dev-frontend-agent : ce schéma
// donne un feedback immédiat, mais ne remplace JAMAIS le trigger serveur
// bloquer_nouveau_credit() (0013_avenant_credit_entrepots.sql section 7),
// seul juge final du plafond global (règle 12) et de l'unicité du crédit
// en_cours par client (règle 13, garantie ultime = index unique partiel, pas
// ce schéma ni le trigger lui-même).
export const ouvrirCreditSchema = z.object({
  client_id: z.string().uuid("Client invalide."),
  facture_id: z.string().uuid("Facture invalide."),
  montant_total: z.coerce
    .number({ message: "Montant invalide." })
    .positive("Le montant du crédit doit être supérieur à 0."),
  frequence_echeance: z.enum(["journalier", "mensuel"]).default("journalier"),
});

export type OuvrirCreditInput = z.infer<typeof ouvrirCreditSchema>;

export const ligneBonLivraisonSchema = z.object({
  produit_id: z.string().uuid("Produit invalide."),
  code: z.string(),
  nom: z.string(),
  unite: z.string(),
  quantite: z.coerce
    .number({ message: "Quantité invalide." })
    .positive("La quantité doit être supérieure à 0."),
  stock_disponible: z.coerce.number().default(0),
});

export type LigneBonLivraisonInput = z.infer<typeof ligneBonLivraisonSchema>;

export const bonLivraisonSchema = z.object({
  client_id: z.string().uuid("Sélectionnez un client avant de continuer."),
  entrepot_id: z.string().uuid("Sélectionnez un entrepôt avant de continuer."),
  facture_id: z.string().uuid().optional().or(z.literal("")),
  date_livraison: z.string().trim().min(1, "La date de livraison est obligatoire."),
  notes: z.string().trim().optional().or(z.literal("")),
  lignes: z.array(ligneBonLivraisonSchema).min(1, "Ajoutez au moins une ligne produit au bon de livraison."),
});

export type BonLivraisonInput = z.infer<typeof bonLivraisonSchema>;

// --- Rapports ------------------------------------------------------------------

export const rapportFiltreSchema = z.object({
  type: z.enum(["ventes", "stock"]),
  format: z.enum(["pdf", "excel"]).default("pdf"),
  date_debut: z.string().trim().optional().or(z.literal("")),
  date_fin: z.string().trim().optional().or(z.literal("")),
  agent_id: z.string().uuid().optional().or(z.literal("")),
});

export type RapportFiltreInput = z.infer<typeof rapportFiltreSchema>;

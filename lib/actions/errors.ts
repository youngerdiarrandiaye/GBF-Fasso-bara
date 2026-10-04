import { formatMontant } from "@/lib/format";

/**
 * Utilitaire de traitement des erreurs Postgres/Supabase dans les Server
 * Actions.
 *
 * Règle : on ne renvoie JAMAIS un message d'erreur Postgres brut au client
 * (fuite potentielle de détails d'implémentation : noms de colonnes, de
 * contraintes, de tables, structure interne). Le message brut est loggué
 * côté serveur pour le debug, et seul un message générique (ou un message
 * explicitement whitelisté, ex. "stock insuffisant") est renvoyé au client.
 *
 * Toute nouvelle règle métier qui doit remonter un message précis à
 * l'utilisateur (ex. stock insuffisant) doit être ajoutée explicitement ici,
 * jamais laissée passer par défaut.
 */

export interface ErreurWhitelistee {
  /** Message final à renvoyer au client. */
  error: string;
  /** Métadonnée optionnelle utile à l'UI (ex : ligne produit en cause). */
  ligneProduitNom?: string;
}

const REGEX_STOCK_INSUFFISANT =
  /Stock insuffisant pour le produit "(.+?)" : disponible ([\d.,]+), demandé ([\d.,]+)/;

// --- Avenant Crédit / Bon de Livraison / Multi-entrepôts (0013_avenant_
// credit_entrepots.sql) — dev-frontend-agent, Phase C. Nouveaux messages de
// trigger whitelistés, même méthode que ci-dessus : jamais de message
// Postgres brut renvoyé tel quel au client.

// decrementer_stock_entrepot() (règle 4/16, section 15.5 de la migration) —
// remplace REGEX_STOCK_INSUFFISANT pour toute facture désormais scopée par
// entrepôt (le message inclut "dans l'entrepôt sélectionné", absent de
// l'ancien message V1 détaché de son trigger, cf. commentaire au-dessus).
const REGEX_STOCK_INSUFFISANT_ENTREPOT =
  /Stock insuffisant pour le produit "(.+?)" dans l'entrepôt sélectionné : disponible ([\d.,]+), demandé ([\d.,]+)/;

// gerer_ligne_bon_livraison() (règle 15/16, section 15.7) — un BL n'a pas de
// cycle brouillon/validation : ce message peut survenir dès l'ajout d'une
// ligne (lib/actions/bons-livraison.ts).
const REGEX_STOCK_INSUFFISANT_BON_LIVRAISON =
  /Stock insuffisant pour "(.+?)" dans l'entrepôt de départ du bon de livraison : disponible ([\d.,]+), demandé ([\d.,]+)/;

// bloquer_nouveau_credit() (règles 12/13, section 7) — deux RAISE EXCEPTION
// distincts. Le message serveur de la règle 13 ("déjà un crédit en cours")
// NE CONTIENT NI le nom du client NI le montant de son crédit en cours (à la
// différence du pré-contrôle client, lib/actions/credits.ts, qui les connaît
// et peut donc produire le message exact demandé par le brief) : whitelisté
// ici en repli générique, atteint seulement si le pré-contrôle client s'est
// appuyé sur un état déjà périmé (course concurrente) — cas rare mais réel,
// cf. règle absolue "la BDD fait foi en dernier ressort".
const REGEX_CREDIT_DEJA_EN_COURS = /Ce client a déjà un crédit en cours/;

// Le message de la règle 12 (seuil global), lui, contient bien les montants
// nécessaires pour reconstruire exactement le libellé demandé par le brief
// ("Crédit refusé — dépasserait le seuil global (X / Y FCFA)") — capturés ici
// puis reformatés par detecterErreurWhitelistee ci-dessous.
const REGEX_CREDIT_SEUIL_DEPASSE =
  /Seuil de crédit global dépassé : encours actuel ([\d.,]+), seuil autorisé ([\d.,]+), ce crédit porterait l'encours total à ([\d.,]+)/;

/**
 * Détecte les cas d'erreur "métier" qu'il est sûr et utile de faire remonter
 * tels quels (ou reformulés) au client. Retourne `undefined` si aucun cas
 * whitelisté ne correspond.
 *
 * `code` est le code d'erreur Postgres (ex: "23505" = unique_violation,
 * cf. https://www.postgresql.org/docs/current/errcodes-appendix.html),
 * disponible sur les erreurs renvoyées par supabase-js (PostgrestError.code).
 * Whitelisté ici uniquement pour la contrainte `produits_code_key`
 * (`produits.code UNIQUE`, supabase/migrations/0001_schema_initial.sql
 * section 5) : le nom de contrainte, présent dans le message Postgres brut,
 * est utilisé pour ne cibler QUE ce cas précis et éviter un faux positif sur
 * une autre violation d'unicité du schéma (ex: categories_produits.nom).
 */
function detecterErreurWhitelistee(messageBrut: string, code?: string): ErreurWhitelistee | undefined {
  const erreursLivraison: Record<string, string> = {
    BL_ACCES_REFUSE: "Votre session ne permet pas de créer un bon de livraison.",
    BL_LIGNES_INVALIDES: "Ajoutez des produits avec des quantités positives, à deux décimales maximum.",
    BL_FACTURE_INDISPONIBLE: "Cette facture n’est pas accessible.",
    BL_FACTURE_NON_VALIDEE: "Validez la facture avant de créer son bon de livraison.",
    BL_FACTURE_DEJA_LIVREE: "Un bon de livraison existe déjà pour cette facture. Consultez la liste des bons.",
    BL_FACTURE_STOCK_HISTORIQUE: "Cette ancienne facture a déjà retiré du stock. Un administrateur doit vérifier et régulariser ses mouvements avant de créer le bon de livraison.",
    BL_FACTURE_DONNEES_MODIFIEES: "Les données ne correspondent plus à la facture. Sélectionnez de nouveau la facture pour actualiser le client et les quantités.",
    BL_ENTREPOT_INDISPONIBLE: "L’entrepôt de départ est indisponible.",
    BL_DOCUMENT_IMMUABLE: "Les produits et le client d’une livraison enregistrée ne peuvent plus être modifiés.",
  };
  if (erreursLivraison[messageBrut]) return { error: erreursLivraison[messageBrut] };

  const matchStock = messageBrut.match(REGEX_STOCK_INSUFFISANT);
  if (matchStock) {
    const [, produitNom, disponible, demande] = matchStock;
    return {
      error: `Stock insuffisant pour "${produitNom}" : ${disponible} disponible(s), ${demande} demandé(s). Ajustez la quantité de cette ligne avant de valider.`,
      ligneProduitNom: produitNom,
    };
  }

  const matchStockEntrepot = messageBrut.match(REGEX_STOCK_INSUFFISANT_ENTREPOT);
  if (matchStockEntrepot) {
    const [, produitNom, disponible, demande] = matchStockEntrepot;
    return {
      error: `Stock insuffisant pour "${produitNom}" dans l'entrepôt sélectionné : ${disponible} disponible(s), ${demande} demandé(s). Changez d'entrepôt ou ajustez la quantité de cette ligne avant de valider.`,
      ligneProduitNom: produitNom,
    };
  }

  const matchStockBL = messageBrut.match(REGEX_STOCK_INSUFFISANT_BON_LIVRAISON);
  if (matchStockBL) {
    const [, produitNom, disponible, demande] = matchStockBL;
    return {
      error: `Stock insuffisant pour "${produitNom}" dans l'entrepôt de départ du bon de livraison : ${disponible} disponible(s), ${demande} demandé(s). Approvisionnez cet entrepôt avant de créer le bon de livraison.`,
      ligneProduitNom: produitNom,
    };
  }

  const matchSeuilCredit = messageBrut.match(REGEX_CREDIT_SEUIL_DEPASSE);
  if (matchSeuilCredit) {
    const [, encoursActuelStr, seuilStr] = matchSeuilCredit;
    const seuil = Number(seuilStr.replace(",", "."));
    // montant_projete reconstruit via une capture séparée ("porterait
    // l'encours total à %") plutôt que directement dans
    // REGEX_CREDIT_SEUIL_DEPASSE, pour rester lisible ; repli sur
    // encoursActuel (rarement atteint : le trigger inclut toujours ce
    // segment dans son message).
    const matchPorterait = messageBrut.match(/porterait l'encours total à ([\d.,]+)/);
    const montantProjete = matchPorterait
      ? Number(matchPorterait[1].replace(",", "."))
      : Number(encoursActuelStr.replace(",", "."));
    return {
      error: `Crédit refusé — dépasserait le seuil global (${formatMontant(montantProjete)} / ${formatMontant(seuil)})`,
    };
  }

  if (REGEX_CREDIT_DEJA_EN_COURS.test(messageBrut)) {
    // Repli générique (cf. commentaire de REGEX_CREDIT_DEJA_EN_COURS
    // ci-dessus) : le pré-contrôle client (lib/actions/credits.ts) produit
    // normalement le message exact avec nom du client + montant AVANT même
    // d'atteindre le serveur ; ce cas n'est whitelisté ici qu'en filet de
    // sécurité pour une course concurrente (état client périmé).
    return {
      error:
        "Crédit refusé — ce client a déjà un crédit en cours (votre affichage était peut-être périmé, rafraîchissez et réessayez).",
    };
  }

  if (code === "23505" && messageBrut.toLowerCase().includes("code")) {
    return { error: "Ce code produit existe déjà — choisissez-en un autre." };
  }

  // Règle métier 13 (0013_avenant_credit_entrepots.sql, section 7) : filet de
  // sécurité ULTIME si bloquer_nouveau_credit() était un jour contourné (ex.
  // trigger désactivé manuellement en session de diagnostic, cf. checklist
  // section 17 de la migration) — l'index unique partiel
  // credits_un_seul_en_cours_par_client reste alors seul rempart, et remonte
  // une violation d'unicité Postgres brute (code 23505) plutôt qu'un message
  // métier lisible.
  // 0020 : échéance de paiement antérieure à la date de la facture.
  if (code === "23514" && messageBrut.includes("factures_date_echeance_apres_date_facture")) {
    return { error: "La date d'échéance ne peut pas précéder la date de la facture." };
  }

  if (code === "23505" && messageBrut.includes("credits_un_seul_en_cours_par_client")) {
    return {
      error: "Crédit refusé — ce client a déjà un crédit en cours (contrainte d'unicité base de données).",
    };
  }

  return undefined;
}

/**
 * Transforme une erreur Postgres/Supabase (ou un message brut) en un
 * résultat sûr à renvoyer au client :
 * - logue toujours le détail brut côté serveur (console.error), avec un
 *   contexte pour faciliter le debug ;
 * - renvoie un message whitelisté si le cas est reconnu (ex : stock
 *   insuffisant) ;
 * - sinon renvoie `messageParDefaut`, générique et sans détail interne.
 */
export function traiterErreurAction(
  contexte: string,
  erreurBrute: unknown,
  messageParDefaut: string
): ErreurWhitelistee {
  const messageBrut =
    erreurBrute instanceof Error
      ? erreurBrute.message
      : typeof erreurBrute === "object" && erreurBrute !== null && "message" in erreurBrute
        ? String((erreurBrute as { message: unknown }).message)
        : String(erreurBrute ?? "");

  const code =
    typeof erreurBrute === "object" && erreurBrute !== null && "code" in erreurBrute
      ? String((erreurBrute as { code: unknown }).code)
      : undefined;

  if (messageBrut) {
    console.error(`[${contexte}]`, messageBrut);
  }

  const whitelistee = detecterErreurWhitelistee(messageBrut, code);
  if (whitelistee) return whitelistee;

  return { error: messageParDefaut };
}

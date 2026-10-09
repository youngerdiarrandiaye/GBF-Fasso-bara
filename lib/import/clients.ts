/**
 * Lecture d'un fichier de clientèle (feuille Excel déjà lue en tableau de
 * lignes). Fonctions pures, sans dépendance : testées dans
 * tests/import-clients.test.mjs.
 *
 * Format pris en charge (fichier « base clients par marché / région ») :
 * - une ligne d'en-têtes (repérée par une colonne « nom ») ;
 * - des lignes de séparation par région (« REGION DE THIES ») ;
 * - des lignes vides ou de total (« TOTAL CLIENTS »), ignorées.
 */

export type TypeClient = "particulier" | "entreprise" | "cooperative";

export interface LigneImport {
  /** Numéro de ligne dans la feuille (1 = première ligne), pour retrouver la ligne source. */
  ligne: number;
  nom: string;
  telephone: string | null;
  adresse: string | null;
  region: string | null;
  email: string | null;
  type_client: TypeClient;
  /** Libellé d'origine du type (« AGENT REVENDEUR »), affiché dans l'aperçu. */
  type_source: string | null;
  avertissements: string[];
  /** Non vide : la ligne ne peut pas être importée. */
  erreurs: string[];
  /** Clé de détection de doublon (téléphone sinon nom). */
  cle: string;
}

export interface AnalyseFichier {
  lignes: LigneImport[];
  /** Colonnes reconnues, pour informer l'Admin (« Téléphone → CONTACT / TEL »). */
  colonnes: Record<string, string | null>;
  /** Lignes sans nom (séparateurs, vides, totaux). */
  ignorees: number;
}

const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normaliser(valeur: unknown): string {
  return String(valeur ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function texte(valeur: unknown): string {
  if (valeur === null || valeur === undefined) return "";
  return String(valeur).replace(/\s+/g, " ").trim();
}

function formaterNeufChiffres(neuf: string): string {
  return `${neuf.slice(0, 2)} ${neuf.slice(2, 5)} ${neuf.slice(5, 7)} ${neuf.slice(7)}`;
}

/**
 * Numéros sénégalais : 9 chiffres (77 123 45 67), éventuellement précédés de
 * 221 / +221 / 00221. Plusieurs numéros dans une cellule sont conservés,
 * séparés par « / ».
 */
export function normaliserTelephone(brut: string): { valeur: string | null; avertissement?: string } {
  const source = brut.trim();
  if (!source) return { valeur: null };
  const morceaux = source.split(/\s*(?:\/|;|,|\bet\b|\bou\b)\s*/i).filter(Boolean);
  const numeros: string[] = [];
  let inhabituel = false;

  for (const morceau of morceaux) {
    let chiffres = morceau.replace(/\D/g, "");
    if (chiffres.startsWith("00221")) chiffres = chiffres.slice(5);
    else if (chiffres.startsWith("221") && chiffres.length === 12) chiffres = chiffres.slice(3);

    if (chiffres.length === 18) {
      // Deux numéros collés dans la même cellule.
      numeros.push(formaterNeufChiffres(chiffres.slice(0, 9)), formaterNeufChiffres(chiffres.slice(9)));
    } else if (chiffres.length === 9) {
      numeros.push(formaterNeufChiffres(chiffres));
    } else if (chiffres.length >= 6) {
      numeros.push(chiffres);
      inhabituel = true;
    } else if (chiffres.length > 0) {
      inhabituel = true;
    }
  }

  if (numeros.length === 0) return { valeur: null, avertissement: `Téléphone illisible : « ${source} ».` };
  return {
    valeur: numeros.join(" / "),
    avertissement: inhabituel ? `Numéro inhabituel : « ${source} » (9 chiffres attendus).` : undefined,
  };
}

const REGEX_COOPERATIVE = /association|cooperative|groupement|union|\bgie\b|federation/;
const REGEX_ENTREPRISE =
  /importateur|distributeur|agrobusiness|agro business|grossiste|commercant de gros|\bgros\b|revendeur|boutique|societe|entreprise|\bsarl\b|centre de groupage|transformateur|exportateur/;

/** Les trois types de la base ; producteur, amateur et le reste deviennent « particulier ». */
export function deduireTypeClient(source: string | null): TypeClient {
  const s = normaliser(source);
  if (!s) return "particulier";
  if (REGEX_COOPERATIVE.test(s)) return "cooperative";
  if (REGEX_ENTREPRISE.test(s)) return "entreprise";
  return "particulier";
}

/** Les 14 régions du Sénégal (écriture correcte) et les graphies fautives courantes du fichier. */
const REGIONS_CONNUES: Record<string, string> = {
  dakar: "Dakar", thies: "Thiès", "saint louis": "Saint-Louis", louga: "Louga", lougua: "Louga",
  kaolack: "Kaolack", diourbel: "Diourbel", fatick: "Fatick", kaffrine: "Kaffrine", kolda: "Kolda",
  ziguinchor: "Ziguinchor", tambacounda: "Tambacounda", matam: "Matam", kedougou: "Kédougou", sedhiou: "Sédhiou",
};

/** « REGION DE SAINT LOUIS » → « Saint-Louis ». Retourne null si ce n'est pas un séparateur de région. */
export function extraireRegion(libelle: string): string | null {
  const m = texte(libelle).match(/^(?:region|zone)\s+(?:de\s+|du\s+|d['’]\s*)?(.+)$/i);
  if (!m) return null;
  const connue = REGIONS_CONNUES[normaliser(m[1])];
  if (connue) return connue;
  return m[1]
    .toLowerCase()
    .split(" ")
    .map((mot) => (mot ? mot[0].toUpperCase() + mot.slice(1) : mot))
    .join(" ")
    .trim();
}

function formaterAdresse(brut: string): string | null {
  const s = texte(brut);
  if (!s) return null;
  return s.replace(/^marche\b/i, "Marché");
}

export function cleDoublon(nom: string, telephone: string | null): string {
  const premier = telephone?.split(" / ")[0].replace(/\D/g, "");
  return premier ? `tel:${premier}` : `nom:${normaliser(nom)}`;
}

type Champ = "nom" | "telephone" | "adresse" | "type" | "region" | "email";

const MOTIFS: { champ: Champ; motif: RegExp }[] = [
  { champ: "nom", motif: /^(nom( du| de)? client|nom et prenom|nom|client|raison sociale)\b/ },
  { champ: "telephone", motif: /tel|contact|mobile|portable|whatsapp/ },
  { champ: "email", motif: /mail/ },
  { champ: "type", motif: /^type|categorie|partenaire/ },
  { champ: "adresse", motif: /adresse|marche|localite|lieu|ville|quartier/ },
  { champ: "region", motif: /^region$/ },
];

function detecterEntete(rows: unknown[][]) {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const colonnes: Partial<Record<Champ, number>> = {};
    const libelles: Partial<Record<Champ, string>> = {};
    (rows[i] ?? []).forEach((cellule, j) => {
      const brut = texte(cellule);
      const n = normaliser(brut);
      if (!n) return;
      for (const { champ, motif } of MOTIFS) {
        if (colonnes[champ] === undefined && motif.test(n)) {
          colonnes[champ] = j;
          libelles[champ] = brut;
          break;
        }
      }
    });
    if (colonnes.nom !== undefined) return { index: i, colonnes, libelles };
  }
  return null;
}

export function analyserLignes(rows: unknown[][]): AnalyseFichier {
  const entete = detecterEntete(rows);
  if (!entete) {
    throw new Error(
      "Colonne « Nom » introuvable. La première ligne du tableau doit contenir un en-tête « Nom client » ou « Nom »."
    );
  }
  const { colonnes } = entete;
  const lecture = (ligne: unknown[], champ: Champ) =>
    colonnes[champ] === undefined ? "" : texte(ligne[colonnes[champ]!]);

  // L'en-tête peut porter la première région (« REGION DE DAKAR »).
  // La région d'un bloc est annoncée dans cette même colonne, sur la ligne du
  // premier client (« REGION DE THIES ») ou sur une ligne de séparation.
  let regionCourante: string | null = null;
  let colonneRegionBloc = -1;
  (rows[entete.index] ?? []).forEach((cellule, j) => {
    const r = extraireRegion(texte(cellule));
    if (r && colonneRegionBloc === -1) {
      regionCourante = r;
      colonneRegionBloc = j;
    }
  });

  const lignes: LigneImport[] = [];
  let ignorees = 0;

  for (let i = entete.index + 1; i < rows.length; i++) {
    const ligne = rows[i] ?? [];
    const cellules = ligne.map(texte).filter(Boolean);
    if (cellules.length === 0) continue;

    if (colonneRegionBloc >= 0) {
      const annonce = extraireRegion(texte(ligne[colonneRegionBloc]));
      if (annonce) regionCourante = annonce;
    }

    const nom = lecture(ligne, "nom");
    if (!nom) {
      const region = cellules.length === 1 ? extraireRegion(cellules[0]) : null;
      if (region) regionCourante = region;
      ignorees++;
      continue;
    }
    if (/^total\b/.test(normaliser(nom))) {
      ignorees++;
      continue;
    }

    const avertissements: string[] = [];
    const erreurs: string[] = [];
    const tel = normaliserTelephone(lecture(ligne, "telephone"));
    if (tel.avertissement) avertissements.push(tel.avertissement);
    const typeSource = lecture(ligne, "type") || null;
    const email = lecture(ligne, "email");
    if (nom.length < 2) erreurs.push("Nom trop court (2 caractères minimum).");
    if (email && !REGEX_EMAIL.test(email)) avertissements.push(`E-mail invalide ignoré : « ${email} ».`);
    const regionColonne = lecture(ligne, "region");

    lignes.push({
      ligne: i + 1,
      nom,
      telephone: tel.valeur,
      adresse: formaterAdresse(lecture(ligne, "adresse")),
      region: regionColonne ? (extraireRegion(`region ${regionColonne}`) ?? regionColonne) : regionCourante,
      email: email && REGEX_EMAIL.test(email) ? email : null,
      type_client: deduireTypeClient(typeSource),
      type_source: typeSource,
      avertissements,
      erreurs,
      cle: cleDoublon(nom, tel.valeur),
    });
  }

  return {
    lignes,
    colonnes: {
      Nom: entete.libelles.nom ?? null,
      Téléphone: entete.libelles.telephone ?? null,
      Adresse: entete.libelles.adresse ?? null,
      Type: entete.libelles.type ?? null,
      Région: entete.libelles.region ?? (lignes.some((l) => l.region) ? "titres de région" : null),
    },
    ignorees,
  };
}

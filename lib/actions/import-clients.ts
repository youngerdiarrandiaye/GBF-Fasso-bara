"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { readSheet } from "read-excel-file/node";
import { createClient } from "@/lib/supabase/server";
import { readAll } from "@/lib/supabase/read-all";
import { traiterErreurAction } from "@/lib/actions/errors";
import { analyserLignes, cleDoublon, type LigneImport } from "@/lib/import/clients";

/**
 * Import de la clientèle depuis un fichier Excel (Espace Admin).
 * Deux étapes : `analyserFichierClients` lit le fichier SANS rien écrire et
 * renvoie un aperçu ; `importerClients` n'écrit que les lignes validées par
 * l'Admin. Réservé aux administrateurs : la policy `clients_creation_agent`
 * autoriserait sinon un agent à insérer en masse.
 */

type ActionResult<T> = { data: T; error?: undefined } | { data?: undefined; error: string };

const TAILLE_MAX_OCTETS = 5 * 1024 * 1024;
const LIGNES_MAX = 2000;

export interface LigneApercu extends LigneImport {
  /** Un client de la base a déjà ce téléphone (ou ce nom, sans téléphone). */
  existant: boolean;
  /** Même téléphone/nom qu'une ligne précédente du fichier. */
  doublon_fichier: boolean;
}

export interface ApercuImport {
  nomFichier: string;
  lignes: LigneApercu[];
  colonnes: Record<string, string | null>;
  ignorees: number;
}

async function verifierAdmin(): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Session expirée, veuillez vous reconnecter." };
  const { data: profil } = await supabase.from("utilisateurs").select("role, actif").eq("id", user.id).single();
  if (!profil || profil.role !== "admin" || !profil.actif) {
    return { ok: false, error: "Action réservée aux administrateurs." };
  }
  return { ok: true };
}

async function clesExistantes(): Promise<Set<string>> {
  const supabase = await createClient();
  const { data } = await readAll<{ nom: string; telephone: string | null }>(
    supabase.from("clients").select("nom, telephone").order("created_at").order("id")
  );
  const cles = new Set<string>();
  for (const c of data) {
    // Un client existant est reconnu par son téléphone ET par son nom : un même
    // numéro ou un même nom sans numéro dans le fichier est un doublon probable.
    cles.add(cleDoublon(c.nom, c.telephone));
    cles.add(cleDoublon(c.nom, null));
  }
  return cles;
}

export async function analyserFichierClients(formData: FormData): Promise<ActionResult<ApercuImport>> {
  const droit = await verifierAdmin();
  if (!droit.ok) return { error: droit.error };

  const fichier = formData.get("fichier");
  if (!(fichier instanceof File) || fichier.size === 0) return { error: "Choisissez un fichier Excel." };
  if (!/\.xlsx$/i.test(fichier.name)) {
    return { error: "Format non pris en charge. Enregistrez le fichier au format Excel (.xlsx) puis réessayez." };
  }
  if (fichier.size > TAILLE_MAX_OCTETS) return { error: "Fichier trop volumineux (5 Mo maximum)." };

  try {
    const feuille = await readSheet(Buffer.from(await fichier.arrayBuffer()));
    const analyse = analyserLignes(feuille as unknown[][]);
    if (analyse.lignes.length === 0) return { error: "Aucun client trouvé dans ce fichier." };
    if (analyse.lignes.length > LIGNES_MAX) {
      return { error: `Trop de lignes (${analyse.lignes.length}). Importez ${LIGNES_MAX} clients maximum à la fois.` };
    }

    const existants = await clesExistantes();
    const vues = new Set<string>();
    const lignes: LigneApercu[] = analyse.lignes.map((ligne) => {
      const doublon_fichier = vues.has(ligne.cle);
      vues.add(ligne.cle);
      return {
        ...ligne,
        doublon_fichier,
        existant: existants.has(ligne.cle) || existants.has(cleDoublon(ligne.nom, null)),
      };
    });

    return { data: { nomFichier: fichier.name, lignes, colonnes: analyse.colonnes, ignorees: analyse.ignorees } };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Colonne « Nom »")) return { error: error.message };
    return traiterErreurAction(
      "import-clients.analyserFichierClients",
      error,
      "Impossible de lire ce fichier. Vérifiez qu'il s'agit bien d'un classeur Excel (.xlsx) non protégé."
    );
  }
}

const ligneAImporterSchema = z.object({
  nom: z.string().trim().min(2, "Nom trop court.").max(200),
  type_client: z.enum(["particulier", "entreprise", "cooperative"]),
  telephone: z.string().trim().max(80).nullable(),
  adresse: z.string().trim().max(300).nullable(),
  region: z.string().trim().max(80).nullable(),
  email: z.string().trim().email().max(200).nullable(),
});
const lignesAImporterSchema = z.array(ligneAImporterSchema).min(1, "Sélectionnez au moins un client.").max(LIGNES_MAX);

export type LigneAImporter = z.infer<typeof ligneAImporterSchema>;

export interface ResultatImport {
  importes: number;
  /** Déjà présents en base au moment de l'écriture (ajoutés entre l'aperçu et la validation). */
  ignores: number;
}

export async function importerClients(lignes: LigneAImporter[]): Promise<ActionResult<ResultatImport>> {
  const droit = await verifierAdmin();
  if (!droit.ok) return { error: droit.error };

  const parsed = lignesAImporterSchema.safeParse(lignes);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Liste de clients invalide." };

  try {
    // Revérification au moment d'écrire : l'aperçu peut dater de plusieurs minutes.
    const existants = await clesExistantes();
    const dejaVus = new Set<string>();
    const aInserer = parsed.data.filter((l) => {
      const cle = cleDoublon(l.nom, l.telephone);
      if (existants.has(cle) || existants.has(cleDoublon(l.nom, null)) || dejaVus.has(cle)) return false;
      dejaVus.add(cle);
      return true;
    });

    const supabase = await createClient();
    for (let i = 0; i < aInserer.length; i += 200) {
      const lot = aInserer.slice(i, i + 200).map((l) => ({
        nom: l.nom,
        type_client: l.type_client,
        telephone: l.telephone || null,
        adresse: l.adresse || null,
        region: l.region || null,
        email: l.email || null,
      }));
      const { error } = await supabase.from("clients").insert(lot);
      if (error) {
        // Les lots déjà écrits restent en base : l'Admin peut relancer sans créer de doublon.
        return traiterErreurAction(
          "import-clients.importerClients",
          error,
          `Import interrompu après ${i} client(s). Relancez l'import : les clients déjà créés seront ignorés.`
        );
      }
    }

    revalidatePath("/admin/clients");
    return { data: { importes: aInserer.length, ignores: parsed.data.length - aInserer.length } };
  } catch (error) {
    return traiterErreurAction("import-clients.importerClients", error, "Impossible d'importer ces clients.");
  }
}

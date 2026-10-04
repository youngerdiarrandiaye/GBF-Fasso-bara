"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  modifierUtilisateurSchema,
  nouvelUtilisateurSchema,
  redefinirMotDePasseSchema,
  type ModifierUtilisateurInput,
  type NouvelUtilisateurInput,
} from "@/lib/validations/schemas";
import { traiterErreurAction } from "@/lib/actions/errors";
import type { UtilisateurRow } from "@/lib/supabase/database.types";

/**
 * Server Actions — Espace Admin / Utilisateurs (admin only, écran sensible).
 *
 * Signalé explicitement à expert-securite pour audit prioritaire : ce
 * fichier est le seul de tout le projet à utiliser le client `service_role`
 * (lib/supabase/admin.ts), pour la seule opération qui l'exige réellement
 * (création d'un compte auth.users — supabase.auth.admin.createUser). Toutes
 * les autres opérations (modification de rôle, désactivation) utilisent le
 * client authentifié standard, filtré par RLS.
 */

type ActionResult<T> = { data: T; error?: undefined } | { data?: undefined; error: string };

async function verifierAppelantEstAdmin(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Session expirée, veuillez vous reconnecter." };

  const { data: profil } = await supabase
    .from("utilisateurs")
    .select("role, actif")
    .eq("id", user.id)
    .single();

  if (!profil || profil.role !== "admin" || !profil.actif) {
    return { ok: false, error: "Action réservée aux administrateurs." };
  }
  return { ok: true, userId: user.id };
}

/**
 * Crée un nouveau compte (auth.users + profil `utilisateurs`, ce dernier
 * provisionné automatiquement par le trigger `gerer_nouvel_utilisateur()`
 * avec role='agent' par défaut — 0001, section 3). Si le rôle demandé est
 * 'admin', une seconde étape met à jour le profil via le client standard
 * (RLS `utilisateurs_admin_all`), sans avoir besoin de service_role pour
 * cette partie.
 */
export async function creerUtilisateur(
  input: NouvelUtilisateurInput
): Promise<ActionResult<UtilisateurRow>> {
  const verif = await verifierAppelantEstAdmin();
  if (!verif.ok) return { error: verif.error };

  const parsed = nouvelUtilisateurSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Compte invalide." };
  }

  const { nom, email, password, role } = parsed.data;

  const adminClient = createAdminClient();
  const { data: created, error: erreurCreation } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nom },
  });

  if (erreurCreation || !created.user) {
    console.error("[utilisateurs.creerUtilisateur]", erreurCreation?.message);
    const dejaUtilise = erreurCreation?.message?.toLowerCase().includes("already");
    return {
      error: dejaUtilise
        ? "Cette adresse e-mail est déjà associée à un compte."
        : "Impossible de créer ce compte utilisateur.",
    };
  }

  // Le trigger gerer_nouvel_utilisateur() vient de créer le profil avec
  // role='agent' par défaut (règle 8 : jamais d'élévation automatique). Si
  // l'admin a demandé 'admin', on complète ici via le client RLS standard.
  const supabase = await createClient();
  const { data: profil, error: erreurProfil } = await supabase
    .from("utilisateurs")
    .update({ nom, role })
    .eq("id", created.user.id)
    .select("*")
    .single();

  if (erreurProfil || !profil) {
    return traiterErreurAction(
      "utilisateurs.creerUtilisateur.profil",
      erreurProfil,
      "Compte créé, mais impossible de finaliser le profil (rôle). Modifiez-le depuis la liste des utilisateurs."
    );
  }

  revalidatePath("/admin/utilisateurs");
  return { data: profil as UtilisateurRow };
}

/**
 * Modifie le nom/rôle/statut actif d'un utilisateur. Le trigger SQL
 * `trg_empecher_auto_promotion` (0001, section 3) bloque explicitement
 * qu'un compte modifie son PROPRE rôle/statut actif, y compris un admin —
 * message d'erreur dédié géré ci-dessous. Le trigger
 * `trg_journaliser_changement_role_actif` (0003, section 21) journalise déjà
 * automatiquement tout changement effectif de role/actif : aucune écriture
 * supplémentaire dans journal_activites n'est faite ici.
 */
export async function modifierUtilisateur(
  input: ModifierUtilisateurInput
): Promise<ActionResult<UtilisateurRow>> {
  const verif = await verifierAppelantEstAdmin();
  if (!verif.ok) return { error: verif.error };

  const parsed = modifierUtilisateurSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }

  const { id, nom, role, actif } = parsed.data;

  if (id === verif.userId) {
    // Évite même l'aller-retour serveur pour le cas trivial "un admin essaie
    // de changer son propre rôle/statut" : message clair immédiat plutôt que
    // de laisser remonter l'exception Postgres brute du trigger.
    const supabase = await createClient();
    const { data: profilActuel } = await supabase
      .from("utilisateurs")
      .select("role, actif")
      .eq("id", id)
      .single();
    if (profilActuel && (profilActuel.role !== role || profilActuel.actif !== actif)) {
      return {
        error:
          "Vous ne pouvez pas modifier votre propre rôle ou votre propre statut actif. Demandez à un autre administrateur.",
      };
    }
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("utilisateurs")
    .update({ nom, role, actif })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    if (error.message?.includes("Seul un administrateur peut modifier")) {
      return {
        error:
          "Un administrateur ne peut pas modifier son propre rôle ou son propre statut actif.",
      };
    }
    return traiterErreurAction(
      "utilisateurs.modifierUtilisateur",
      error,
      "Impossible de modifier cet utilisateur."
    );
  }

  revalidatePath("/admin/utilisateurs");
  return { data: data as UtilisateurRow };
}

export async function desactiverUtilisateur(id: string): Promise<ActionResult<UtilisateurRow>> {
  const verif = await verifierAppelantEstAdmin();
  if (!verif.ok) return { error: verif.error };

  if (id === verif.userId) {
    return { error: "Vous ne pouvez pas désactiver votre propre compte." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("utilisateurs")
    .update({ actif: false })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return traiterErreurAction(
      "utilisateurs.desactiverUtilisateur",
      error,
      "Impossible de désactiver cet utilisateur."
    );
  }

  revalidatePath("/admin/utilisateurs");
  return { data: data as UtilisateurRow };
}

/**
 * Dernière connexion (`auth.users.last_sign_in_at`) pour un lot d'utilisateurs
 * — non exposé par `public.utilisateurs` (colonne gérée par Supabase Auth,
 * hors du schéma `public`), donc inaccessible via le client RLS standard.
 * Deuxième usage de `service_role` dans le projet (le premier étant la
 * création de compte ci-dessus) : lecture seule, `getUserById` par entrée
 * plutôt que `listUsers()` paginé, adapté au volume attendu (liste Admin
 * paginée à 10, ou une seule fiche agent). Retourne une Map vide si
 * l'appelant n'est pas admin (même garde que le reste du fichier).
 */
export async function obtenirDernieresConnexions(ids: string[]): Promise<Map<string, string | null>> {
  const verif = await verifierAppelantEstAdmin();
  if (!verif.ok || ids.length === 0) return new Map();

  const adminClient = createAdminClient();
  const resultats = await Promise.all(
    ids.map(async (id) => {
      const { data, error } = await adminClient.auth.admin.getUserById(id);
      return [id, error || !data.user ? null : (data.user.last_sign_in_at ?? null)] as const;
    })
  );
  return new Map(resultats);
}

export async function reactiverUtilisateur(id: string): Promise<ActionResult<UtilisateurRow>> {
  const verif = await verifierAppelantEstAdmin();
  if (!verif.ok) return { error: verif.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("utilisateurs")
    .update({ actif: true })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return traiterErreurAction(
      "utilisateurs.reactiverUtilisateur",
      error,
      "Impossible de réactiver cet utilisateur."
    );
  }

  revalidatePath("/admin/utilisateurs");
  return { data: data as UtilisateurRow };
}

/**
 * Redéfinit le mot de passe d'un compte (agent oublieux, compte compromis).
 * Troisième usage de `service_role` : seule l'API Admin d'Auth peut modifier
 * le mot de passe d'un AUTRE utilisateur. Garde admin identique au reste du
 * fichier ; l'opération est journalisée (sans le mot de passe).
 */
export async function redefinirMotDePasse(
  id: string,
  password: string
): Promise<ActionResult<{ id: string }>> {
  const verif = await verifierAppelantEstAdmin();
  if (!verif.ok) return { error: verif.error };

  const parsed = redefinirMotDePasseSchema.safeParse({ id, password });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Mot de passe invalide." };
  }

  const adminClient = createAdminClient();
  const { error } = await adminClient.auth.admin.updateUserById(parsed.data.id, {
    password: parsed.data.password,
  });

  if (error) {
    console.error("[utilisateurs.redefinirMotDePasse]", error.message);
    return { error: "Impossible de redéfinir le mot de passe de ce compte." };
  }

  const supabase = await createClient();
  await supabase.from("journal_activites").insert({
    utilisateur_id: verif.userId,
    action: "redefinition_mot_de_passe",
    table_cible: "utilisateurs",
    avant: null,
    apres: { utilisateur_id: parsed.data.id },
  });

  return { data: { id: parsed.data.id } };
}

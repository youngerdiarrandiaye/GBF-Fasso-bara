"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { entrepriseConfigSchema, type EntrepriseConfigInput } from "@/lib/validations/schemas";
import { traiterErreurAction } from "@/lib/actions/errors";
import type { EntrepriseConfigRow } from "@/lib/supabase/database.types";

/**
 * Server Action — Espace Admin / Paramètres entreprise.
 *
 * Écran signalé explicitement à expert-securite : `entreprise_config`
 * contient les coordonnées bancaires (banque_nom, iban, swift...), dont la
 * lecture est réservée à l'admin depuis le correctif 0003 (policy
 * `entreprise_config_lecture_admin`). Cette Server Action réutilise le
 * client authentifié standard (jamais service_role) : l'écriture reste
 * filtrée par la policy `entreprise_config_ecriture_admin` (0001, section 3)
 * — un appel par un compte non-admin serait refusé par RLS avant même
 * d'atteindre cette logique.
 */

type ActionResult<T> = { data: T; error?: undefined } | { data?: undefined; error: string };

export async function mettreAJourEntrepriseConfig(
  input: EntrepriseConfigInput
): Promise<ActionResult<EntrepriseConfigRow>> {
  const parsed = entrepriseConfigSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données entreprise invalides." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée, veuillez vous reconnecter." };

  const v = parsed.data;
  const { data, error } = await supabase
    .from("entreprise_config")
    .update({
      nom: v.nom,
      activites: v.activites,
      adresses: v.adresses,
      telephones: v.telephones,
      email: v.email || null,
      ninea: v.ninea || null,
      rc: v.rc || null,
      banque_nom: v.banque_nom || null,
      banque_code: v.banque_code || null,
      banque_agence: v.banque_agence || null,
      banque_numero_compte: v.banque_numero_compte || null,
      banque_cle_rib: v.banque_cle_rib || null,
      iban: v.iban || null,
      swift: v.swift || null,
      logo_url: v.logo_url || null,
      tampon_url: v.tampon_url || null,
      modalites_reglement: v.modalites_reglement,
      delai_disponibilite: v.delai_disponibilite || null,
      validite_proforma_jours: v.validite_proforma_jours,
      // Règle métier 12 (0013_avenant_credit_entrepots.sql) : plafond global
      // de l'encours de crédit ('en_cours', tous clients confondus). Signalé
      // à expert-securite au même titre que le reste de cet écran (données de
      // politique commerciale, pas bancaires, mais réservées admin par RLS
      // entreprise_config_ecriture_admin, 0001 section 3).
      seuil_credit_max: v.seuil_credit_max,
    })
    .eq("id", true)
    .select("*")
    .single();

  if (error) {
    return traiterErreurAction(
      "entreprise-config.mettreAJourEntrepriseConfig",
      error,
      "Impossible d'enregistrer les paramètres de l'entreprise."
    );
  }

  revalidatePath("/admin/parametres");
  revalidatePath("/admin");
  return { data: data as EntrepriseConfigRow };
}

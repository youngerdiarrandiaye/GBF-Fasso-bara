"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { clientAdminSchema, type ClientAdminInput } from "@/lib/validations/schemas";
import { traiterErreurAction } from "@/lib/actions/errors";
import type { ClientRow } from "@/lib/supabase/database.types";

/**
 * Server Action — Espace Admin / Fiche client (écriture). Séparé de
 * lib/actions/factures.ts (creerClientRapide, propriété de
 * dev-frontend-agent) pour éviter tout conflit d'édition simultané. Un agent
 * ne peut que créer un client (policy `clients_creation_agent`) ; seule cette
 * action-ci, réservée à l'Espace Admin, peut le modifier (policy
 * `clients_admin_all`).
 */

type ActionResult<T> = { data: T; error?: undefined } | { data?: undefined; error: string };

export async function creerClientAdmin(input: ClientAdminInput): Promise<ActionResult<ClientRow>> {
  const parsed = clientAdminSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Client invalide." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée, veuillez vous reconnecter." };

  const { nom, type_client, telephone, adresse, email, ninea } = parsed.data;

  const { data, error } = await supabase
    .from("clients")
    .insert({
      nom,
      type_client,
      telephone: telephone || null,
      adresse: adresse || null,
      email: email || null,
      ninea: ninea || null,
    })
    .select("*")
    .single();

  if (error) {
    return traiterErreurAction(
      "clients-admin.creerClientAdmin",
      error,
      "Impossible de créer ce client."
    );
  }

  revalidatePath("/admin/clients");
  return { data: data as ClientRow };
}

export async function modifierClient(
  id: string,
  input: ClientAdminInput
): Promise<ActionResult<ClientRow>> {
  const parsed = clientAdminSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Client invalide." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée, veuillez vous reconnecter." };

  const { nom, type_client, telephone, adresse, email, ninea } = parsed.data;

  const { data, error } = await supabase
    .from("clients")
    .update({
      nom,
      type_client,
      telephone: telephone || null,
      adresse: adresse || null,
      email: email || null,
      ninea: ninea || null,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return traiterErreurAction(
      "clients-admin.modifierClient",
      error,
      "Impossible de modifier ce client."
    );
  }

  revalidatePath("/admin/clients");
  revalidatePath(`/admin/clients/${id}`);
  return { data: data as ClientRow };
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { entrepriseConfigSchema, type EntrepriseConfigInput } from "@/lib/validations/schemas";
import { mettreAJourEntrepriseConfig } from "@/lib/actions/entreprise-config";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { useToast } from "@/components/ui/Toast";
import { ChipsInput } from "@/components/admin/ChipsInput";
import { LogoUploader } from "@/components/admin/LogoUploader";
import { TamponUploader } from "@/components/admin/TamponUploader";
import type { EntrepriseConfigRow } from "@/lib/supabase/database.types";

/**
 * Formulaire Paramètres entreprise — SIGNALÉ EXPLICITEMENT à expert-securite :
 * ce formulaire lit et écrit les coordonnées bancaires complètes de
 * l'entreprise (banque_nom, iban, swift, numéro de compte...), réservées à
 * l'admin depuis le correctif 0003_correctifs_securite.sql (policy
 * `entreprise_config_lecture_admin`). Cet écran n'est accessible qu'aux
 * comptes role='admin' (layout Admin, défense en profondeur + RLS).
 */
export function CompanySettingsForm({ config }: { config: EntrepriseConfigRow }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [erreurServeur, setErreurServeur] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<EntrepriseConfigInput>({
    resolver: zodResolver(entrepriseConfigSchema),
    defaultValues: {
      nom: config.nom,
      activites: config.activites,
      adresses: config.adresses,
      telephones: config.telephones,
      email: config.email ?? "",
      ninea: config.ninea ?? "",
      rc: config.rc ?? "",
      banque_nom: config.banque_nom ?? "",
      banque_code: config.banque_code ?? "",
      banque_agence: config.banque_agence ?? "",
      banque_numero_compte: config.banque_numero_compte ?? "",
      banque_cle_rib: config.banque_cle_rib ?? "",
      iban: config.iban ?? "",
      swift: config.swift ?? "",
      logo_url: config.logo_url ?? "",
      tampon_url: config.tampon_url ?? "",
      modalites_reglement: config.modalites_reglement,
      delai_disponibilite: config.delai_disponibilite ?? "",
      validite_proforma_jours: config.validite_proforma_jours,
      seuil_credit_max: config.seuil_credit_max,
    },
  });

  async function onSubmit(values: EntrepriseConfigInput) {
    setErreurServeur(null);
    const resultat = await mettreAJourEntrepriseConfig(values);

    if (resultat.error || !resultat.data) {
      setErreurServeur(resultat.error ?? "Erreur inconnue.");
      return;
    }

    showToast("Paramètres entreprise enregistrés.", "success");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-8" noValidate>
      {erreurServeur && <InlineAlert tone="red">{erreurServeur}</InlineAlert>}

      <section className="flex flex-col gap-4">
        <h2 className="text-h2 text-text">Identité</h2>
        <Controller
          control={control}
          name="logo_url"
          render={({ field }) => <LogoUploader logoUrl={field.value ?? ""} onChange={field.onChange} />}
        />
        <div className="flex flex-col gap-1.5">
          <p className="text-body font-medium text-text">Tampon / signature</p>
          <p className="text-body-sm text-muted">
            Cette image apparaît dans la zone « Cachet et signature » du PDF de facture.
          </p>
          <Controller
            control={control}
            name="tampon_url"
            render={({ field }) => <TamponUploader tamponUrl={field.value ?? ""} onChange={field.onChange} />}
          />
        </div>
        <Input label="Nom de l'entreprise" error={errors.nom?.message} {...register("nom")} />
        <Controller
          control={control}
          name="activites"
          render={({ field }) => (
            <ChipsInput
              label="Activités"
              values={field.value}
              onChange={field.onChange}
              placeholder="Ex : irrigation, forage..."
            />
          )}
        />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-h2 text-text">Coordonnées</h2>
        <Controller
          control={control}
          name="adresses"
          render={({ field }) => (
            <ChipsInput
              label="Adresses (multi-sites)"
              values={field.value}
              onChange={field.onChange}
              placeholder="Ex : Mboro, Darou Salam..."
            />
          )}
        />
        <Controller
          control={control}
          name="telephones"
          render={({ field }) => (
            <ChipsInput
              label="Téléphones"
              values={field.value}
              onChange={field.onChange}
              placeholder="Ex : 77 000 00 00"
            />
          )}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="E-mail" type="email" error={errors.email?.message} {...register("email")} />
          <Input label="NINEA" error={errors.ninea?.message} {...register("ninea")} />
        </div>
        <Input label="RC (Registre de commerce)" error={errors.rc?.message} {...register("rc")} />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-h2 text-text">Coordonnées bancaires</h2>
        <p className="text-body-sm text-muted">
          Ces informations apparaissent en pied de facture. Réservées à l&apos;administration
          (jamais exposées à l&apos;Espace Agent).
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Nom de la banque" error={errors.banque_nom?.message} {...register("banque_nom")} />
          <Input label="Code banque" error={errors.banque_code?.message} {...register("banque_code")} />
          <Input label="Agence" error={errors.banque_agence?.message} {...register("banque_agence")} />
          <Input
            label="Numéro de compte"
            error={errors.banque_numero_compte?.message}
            {...register("banque_numero_compte")}
          />
          <Input label="Clé RIB" error={errors.banque_cle_rib?.message} {...register("banque_cle_rib")} />
          <Input label="IBAN" error={errors.iban?.message} {...register("iban")} />
          <Input label="SWIFT / BIC" error={errors.swift?.message} {...register("swift")} />
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-h2 text-text">Mentions légales de facture</h2>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="modalites_reglement" className="text-body font-medium text-text">
            Modalités de règlement
          </label>
          <textarea
            id="modalites_reglement"
            rows={2}
            className="focus-ring w-full rounded-input border border-border bg-surface px-3 py-2 text-body text-text"
            {...register("modalites_reglement")}
          />
          {errors.modalites_reglement && (
            <p className="text-body-sm text-red-text">{errors.modalites_reglement.message}</p>
          )}
        </div>
        <Input
          label="Délai de disponibilité"
          error={errors.delai_disponibilite?.message}
          {...register("delai_disponibilite")}
        />
        <Input
          label="Validité d'une proforma (jours)"
          type="number"
          error={errors.validite_proforma_jours?.message}
          {...register("validite_proforma_jours", { valueAsNumber: true })}
        />
      </section>

      {/* Avenant Crédit / BL / Multi-entrepôts (0013) — règle métier 12 :
          plafond global de l'encours de crédit. Section dédiée (pas mêlée aux
          mentions légales ci-dessus) pour rester repérable comme un réglage
          de politique commerciale à part entière, cf. docs/design-system.md
          §5.9 (jauge Crédit non recouvré, dashboard) qui dépend directement
          de cette valeur. */}
      <section className="flex flex-col gap-4">
        <h2 className="text-h2 text-text">Crédit client</h2>
        <p className="text-body-sm text-muted">
          Plafond global de l&apos;encours de crédit autorisé (tous clients confondus). Valeur par
          défaut 0 = crédit désactivé tant qu&apos;aucun montant n&apos;est configuré ici.
        </p>
        <Input
          label="Seuil de crédit global (FCFA)"
          type="number"
          min={0}
          step="0.01"
          error={errors.seuil_credit_max?.message}
          {...register("seuil_credit_max", { valueAsNumber: true })}
        />
      </section>

      <div className="flex justify-end">
        <Button type="submit" loading={isSubmitting}>
          Enregistrer les paramètres
        </Button>
      </div>
    </form>
  );
}

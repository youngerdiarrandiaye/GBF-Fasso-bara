import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatMontant, formatDate, formatDateTime, formatQuantite, libelleUnite, echeanceParDefaut } from "@/lib/format";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { Breadcrumbs } from "@/components/admin/Breadcrumbs";
import { RegisterPaymentButton } from "@/components/admin/RegisterPaymentButton";
import { CancelInvoiceButton } from "@/components/admin/CancelInvoiceButton";
import { FactureActions } from "@/components/facture/FactureActions";
import { OverdueBadge } from "@/components/facture/OverdueBadge";
import { CompanyBrandMark } from "@/components/facture/CompanyBrandMark";
import { RealtimeRevalidate } from "@/components/admin/RealtimeRevalidate";
import type {
  EntrepriseConfigRow,
  LigneFactureAvecProduit,
  PaiementRow,
  RemboursementCreditRow,
} from "@/lib/supabase/database.types";
import { EmptyState } from "@/components/ui/EmptyState";
import { faMoneyBillWave } from "@fortawesome/free-solid-svg-icons";

export const dynamic = "force-dynamic";

const MODES_PAIEMENT_LABEL: Record<string, string> = {
  especes: "Espèces",
  virement: "Virement",
  mobile_money: "Mobile Money",
  cheque: "Chèque",
};

export default async function FactureDetailAdminPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: facture } = await supabase
    .from("factures")
    .select(
      "*, client:clients(id, nom, telephone, adresse, email, type_client, ninea), agent:utilisateurs!factures_agent_id_fkey(id, nom)"
    )
    .eq("id", id)
    .single();

  if (!facture) {
    notFound();
  }

  const [{ data: lignesData }, { data: paiementsData }, { data: creditData }, { data: entreprise }, { data: retardData }] =
    await Promise.all([
      supabase
        .from("lignes_facture")
        .select("*, produit:produits(id, code, nom, unite, type_ligne_produit, quantite_stock, photos_urls)")
        .eq("facture_id", id)
        .order("created_at"),
      supabase.from("paiements").select("*").eq("facture_id", id).order("date_paiement", { ascending: false }),
      supabase
        .from("credits")
        .select("id, montant_rembourse, remboursements:remboursements_credit(*)")
        .eq("facture_id", id)
        .maybeSingle(),
      supabase.from("entreprise_config").select("*").eq("id", true).single(),
      supabase.from("v_factures_retard_paiement").select("jours_de_retard").eq("facture_id", id).maybeSingle(),
    ]);

  const lignes = (lignesData as unknown as LigneFactureAvecProduit[]) ?? [];
  const paiements = (paiementsData as PaiementRow[]) ?? [];
  const credit = creditData as unknown as
    | { id: string; montant_rembourse: number; remboursements: RemboursementCreditRow[] | null }
    | null;
  const remboursementsCredit = credit?.remboursements ?? [];
  const config = entreprise as EntrepriseConfigRow | null;
  const joursDeRetard = (retardData as { jours_de_retard: number } | null)?.jours_de_retard ?? null;

  const totalPaiementsDirects = paiements.reduce((sum, p) => sum + p.montant, 0);
  const totalRecouvreCredit = credit?.montant_rembourse ?? 0;
  const totalPaye = totalPaiementsDirects + totalRecouvreCredit;
  const resteAPayer = Math.max(0, facture.total_general - totalPaye);
  const peutPayer = facture.statut === "validee" || facture.statut === "payee_partielle";
  const client = facture.client as unknown as {
    id: string;
    nom: string;
    telephone: string | null;
    adresse: string | null;
    email: string | null;
    type_client: string;
    ninea: string | null;
  };
  const agent = facture.agent as unknown as { id: string; nom: string };

  return (
    <div className="flex flex-col gap-4 pb-8">
      <RealtimeRevalidate tables={["factures", "paiements", "credits", "remboursements_credit"]} />

      <Breadcrumbs items={[{ label: "Factures", href: "/admin/factures" }, { label: facture.numero }]} />

      <section className="flex flex-col gap-4 rounded-card border border-border bg-surface p-4 shadow-card sm:p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-start gap-3">
          <CompanyBrandMark nom={config?.nom ?? "GIE FASSO BARA"} logoUrl={config?.logo_url ?? null} />
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="rounded-input bg-surface-2 px-3 py-1 font-mono text-h2 text-text">
                {facture.numero}
              </h1>
              <StatusBadge statut={facture.statut} />
              {joursDeRetard !== null && <OverdueBadge joursDeRetard={joursDeRetard} />}
            </div>
            <p className="mt-1 text-body-sm text-muted">
              Agent : {agent?.nom} · Créée le {formatDateTime(facture.created_at)}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <FactureActions
            factureId={facture.id}
            factureNumero={facture.numero}
            statut={facture.statut}
            clientTelephone={client?.telephone ?? null}
            clientEmail={client?.email ?? null}
            totalGeneral={facture.total_general}
          />
          <CancelInvoiceButton factureId={facture.id} statut={facture.statut} numero={facture.numero} />
          {["brouillon", "proforma"].includes(facture.statut) && (
            <Link href={`/admin/nouvelle-facture?id=${facture.id}`}>
              <Button>{facture.statut === "brouillon" ? "Continuer" : "Modifier"}</Button>
            </Link>
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 overflow-hidden rounded-card border border-border bg-surface shadow-card sm:grid-cols-3">
        <div className="border-b border-border px-4 py-3 sm:border-b-0 sm:border-r">
          <p className="text-caption uppercase tracking-wide text-muted">Total</p>
          <p className="mt-1 font-mono text-h2 text-text">{formatMontant(facture.total_general)}</p>
        </div>
        <div className="border-b border-border px-4 py-3 sm:border-b-0 sm:border-r">
          <p className="text-caption uppercase tracking-wide text-muted">Payé</p>
          <p className="mt-1 font-mono text-h2 text-green-text">{formatMontant(totalPaye)}</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-caption uppercase tracking-wide text-muted">À encaisser</p>
          <p className={`mt-1 font-mono text-h2 ${resteAPayer > 0 ? "text-red-text" : "text-green-text"}`}>
            {formatMontant(resteAPayer)}
          </p>
        </div>
      </section>

      {facture.statut === "proforma" && config && (
        <InlineAlert tone="amber">
          Proforma valable {config.validite_proforma_jours} jours à compter du{" "}
          {formatDate(facture.date_facture)}.
        </InlineAlert>
      )}

      {/* Aperçu facture, fidèle au modèle PDF — docs/design-system.md §6.16.
          rounded-card-lg (D-11) : carte "vedette" de l'écran, seule mise en
          avant avec un rayon élargi. */}
      <Card className="overflow-hidden rounded-card-lg !p-0 shadow-card">
        <div className="grid grid-cols-1 gap-0 lg:grid-cols-2">
          <div className="flex flex-col gap-2 border-b border-border p-4 sm:p-5 lg:border-b-0 lg:border-r">
            <div className="flex items-center gap-3">
              <CompanyBrandMark nom={config?.nom ?? "GIE FASSO BARA"} logoUrl={config?.logo_url ?? null} />
              <div>
                <p className="text-h3 text-text">{config?.nom ?? "GIE FASSO BARA"}</p>
                {config?.ninea && <p className="text-body-sm text-muted">NINEA {config.ninea}</p>}
                {config?.rc && <p className="text-body-sm text-muted">RC {config.rc}</p>}
              </div>
            </div>
            {config?.adresses && config.adresses.length > 0 && (
              <p className="text-body-sm text-muted">{config.adresses.join(" · ")}</p>
            )}
            {config?.telephones && config.telephones.length > 0 && (
              <p className="text-body-sm text-muted">Tél : {config.telephones.join(" / ")}</p>
            )}
            {config?.email && <p className="text-body-sm text-muted">{config.email}</p>}
          </div>

          <div className="flex flex-col gap-1 p-4 sm:p-5">
            <p className="text-caption uppercase tracking-wide text-muted">Facturé à</p>
            <p className="text-h3 text-text">{client?.nom}</p>
            {client?.adresse && <p className="text-body-sm text-muted">{client.adresse}</p>}
            {client?.telephone && <p className="text-body-sm text-muted">{client.telephone}</p>}
            {client?.email && <p className="text-body-sm text-muted">{client.email}</p>}
            {client?.ninea && <p className="text-body-sm text-muted">NINEA {client.ninea}</p>}
            <p className="mt-2 text-body-sm text-muted">
              Date de facture : <span className="text-text">{formatDate(facture.date_facture)}</span>
            </p>
            {(facture.date_echeance || facture.date_validation) && (
              <p className="text-body-sm text-muted">
                Échéance de paiement :{" "}
                <span className="text-text">
                  {facture.date_echeance
                    ? formatDate(facture.date_echeance)
                    : `${formatDate(echeanceParDefaut(facture.date_validation!))} (10 jours après validation)`}
                </span>
              </p>
            )}
          </div>
        </div>

        <div className="overflow-x-auto border-t border-border">
          <table className="w-full border-collapse">
            <thead>
              <tr className="hidden bg-surface-2 text-left text-caption uppercase tracking-[0.1em] text-muted sm:table-row">
                <th className="px-4 py-2.5 font-medium">Produit</th>
                <th className="px-4 py-2.5 text-right font-medium">Quantité</th>
                <th className="px-4 py-2.5 text-right font-medium">Prix unitaire</th>
                <th className="px-4 py-2.5 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((ligne) => (
                <tr key={ligne.id} className="grid grid-cols-2 gap-x-3 border-t border-border px-4 py-3 sm:table-row sm:px-0 sm:py-0">
                  <td className="col-span-2 pb-2 sm:px-4 sm:py-3">
                    <div className="flex items-center gap-3">
                      {ligne.produit?.photos_urls?.[0] ? (
                        <Image
                          src={ligne.produit.photos_urls[0]}
                          alt={ligne.produit.nom}
                          width={32}
                          height={32}
                          className="rounded-input object-cover"
                        />
                      ) : (
                        <span className="h-8 w-8 shrink-0 rounded-input bg-surface-2" aria-hidden="true" />
                      )}
                      <div>
                        <p className="text-body text-text">{ligne.produit?.nom}</p>
                        <p className="font-mono text-body-sm text-muted">{ligne.produit?.code}</p>
                      </div>
                    </div>
                  </td>
                  <td className="text-left font-mono text-body text-muted before:mr-1 before:content-['Qté'] sm:px-4 sm:py-3 sm:text-right sm:text-body sm:text-text sm:before:content-none">
                    {formatQuantite(ligne.quantite, libelleUnite(ligne.produit?.unite ?? "piece", ligne.quantite))}
                  </td>
                  <td className="hidden px-4 py-3 text-right font-mono text-body text-text sm:table-cell">
                    {ligne.produit?.type_ligne_produit === "inclus_dans_kit" ? (
                      <span className="badge-pastel-neutral rounded-badge px-2 py-1 text-caption">Inclus</span>
                    ) : (
                      formatMontant(ligne.prix_unitaire)
                    )}
                  </td>
                  <td className="text-right font-mono text-body font-semibold text-text sm:px-4 sm:py-3 sm:font-normal">
                    {ligne.produit?.type_ligne_produit === "inclus_dans_kit" ? (
                      <span className="badge-pastel-neutral rounded-badge px-2 py-1 text-caption">Inclus</span>
                    ) : (
                      formatMontant(ligne.total_ligne)
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-4 border-t border-border p-4 sm:p-5 lg:flex-row lg:justify-between">
          <div className="flex flex-col gap-2">
            <p className="text-caption uppercase tracking-wide text-muted">Tampon &amp; signature</p>
            <div className="flex h-24 w-48 items-center justify-center rounded-input border border-dashed border-border text-body-sm text-muted">
              Espace réservé
            </div>
          </div>

          <div className="flex w-full flex-col gap-1.5 rounded-input bg-surface-2 p-4 lg:w-80">
            <div className="flex justify-between text-body text-muted">
              <span>Total HT</span>
              <span className="font-mono text-text">{formatMontant(facture.total_ht)}</span>
            </div>
            {facture.remise_montant > 0 && (
              <div className="flex justify-between text-body text-muted">
                <span>Remise</span>
                <span className="font-mono text-text">-{formatMontant(facture.remise_montant)}</span>
              </div>
            )}
            <div className="flex justify-between text-body text-muted">
              <span>Forfait transport</span>
              <span className="font-mono text-text">{formatMontant(facture.forfait_transport)}</span>
            </div>
            {facture.tva_taux > 0 && (
              <div className="flex justify-between text-body text-muted">
                <span>TVA ({(facture.tva_taux * 100).toFixed(0)}%)</span>
                <span className="font-mono text-text">
                  {formatMontant(facture.total_ht * facture.tva_taux)}
                </span>
              </div>
            )}
            <div className="mt-2 flex justify-between border-t border-border pt-2 text-h2 font-semibold text-text">
              <span>Total général</span>
              <span className="font-mono">{formatMontant(facture.total_general)}</span>
            </div>
            {totalPaye > 0 && (
              <>
                <div className="flex justify-between text-body text-green-text">
                  <span>Déjà payé</span>
                  <span className="font-mono">{formatMontant(totalPaye)}</span>
                </div>
                <div className="flex justify-between text-body font-medium text-red-text">
                  <span>Reste à payer</span>
                  <span className="font-mono">{formatMontant(resteAPayer)}</span>
                </div>
              </>
            )}
          </div>
        </div>

        {config && (config.modalites_reglement || config.banque_nom || config.iban) && (
          <div className="border-t border-border bg-surface-2 p-4 text-body-sm text-muted sm:p-5">
            <p>{config.modalites_reglement}</p>
            {config.delai_disponibilite && <p>Délai de disponibilité : {config.delai_disponibilite}</p>}
            {(config.banque_nom || config.iban) && (
              <p className="mt-2 font-mono text-caption">
                {config.banque_nom && `${config.banque_nom} `}
                {config.banque_code && `Code ${config.banque_code} `}
                {config.banque_agence && `Agence ${config.banque_agence} `}
                {config.banque_numero_compte && `Compte ${config.banque_numero_compte} `}
                {config.banque_cle_rib && `Clé ${config.banque_cle_rib}`}
                {config.iban && ` · IBAN ${config.iban}`}
                {config.swift && ` · SWIFT ${config.swift}`}
              </p>
            )}
          </div>
        )}
      </Card>

      {/* Bouton sticky — docs/design-system.md §6.16 : position fixe si la
          facture est validee ou payee_partielle. */}
      {peutPayer && (
        <RegisterPaymentButton
          factureId={facture.id}
          factureNumero={facture.numero}
          resteAPayer={resteAPayer}
          sticky
        />
      )}

      <Card className="overflow-hidden !p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-h3 text-text">Paiements</h2>
          <span className="text-body-sm text-muted">{paiements.length + remboursementsCredit.length}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[560px] w-full border-collapse">
            <thead>
              <tr className="text-left text-body-sm uppercase tracking-wide text-muted">
                <th className="px-4 py-2.5 font-medium">Date</th>
                <th className="px-4 py-2.5 font-medium">Mode</th>
                <th className="px-4 py-2.5 font-medium">Référence</th>
                <th className="px-4 py-2.5 text-right font-medium">Montant</th>
              </tr>
            </thead>
            <tbody>
              {paiements.length === 0 && remboursementsCredit.length === 0 ? (
                <tr>
                  <td colSpan={4}><EmptyState icone={faMoneyBillWave} titre="Aucun paiement enregistré pour cette facture." /></td>
                </tr>
              ) : (
                paiements.map((p) => (
                  <tr key={p.id} className="border-t border-border hover:bg-surface-2">
                    <td className="px-4 py-3 text-body-sm text-muted">{formatDate(p.date_paiement)}</td>
                    <td className="px-4 py-3 text-body text-text">{MODES_PAIEMENT_LABEL[p.mode_paiement]}</td>
                    <td className="px-4 py-3 text-body-sm text-muted">{p.reference ?? "—"}</td>
                    <td className="px-4 py-3 text-right font-mono text-body text-text">
                      {formatMontant(p.montant)}
                    </td>
                  </tr>
                ))
              )}
              {remboursementsCredit.map((r) => (
                <tr key={r.id} className="border-t border-border hover:bg-surface-2">
                  <td className="px-4 py-3 text-body-sm text-muted">{formatDate(r.date_remboursement)}</td>
                  <td className="px-4 py-3 text-body text-text">Recouvrement crédit</td>
                  <td className="px-4 py-3 text-body-sm text-muted">{r.notes ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-mono text-body text-text">
                    {formatMontant(r.montant)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {facture.notes && (
        <Card>
          <p className="text-body-sm text-muted">Notes</p>
          <p className="mt-1 text-body text-text">{facture.notes}</p>
        </Card>
      )}
    </div>
  );
}

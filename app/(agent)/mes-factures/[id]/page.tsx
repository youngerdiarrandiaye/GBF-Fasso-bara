import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatMontant, formatDate, formatDateTime, formatQuantite, libelleUnite, echeanceParDefaut } from "@/lib/format";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { FactureActions } from "@/components/facture/FactureActions";
import { OverdueBadge } from "@/components/facture/OverdueBadge";
import { CompanyBrandMark } from "@/components/facture/CompanyBrandMark";
import type {
  EntrepriseConfigPublicRow,
  LigneFactureAvecProduit,
  PaiementRow,
  RemboursementCreditRow,
} from "@/lib/supabase/database.types";

export const dynamic = "force-dynamic";

const MODES_PAIEMENT_LABEL: Record<string, string> = {
  especes: "Espèces",
  virement: "Virement",
  mobile_money: "Mobile Money",
  cheque: "Chèque",
};

/**
 * Détail d'une facture côté Espace Agent — lecture seule sur les paiements,
 * pas d'action d'enregistrement de paiement ni d'annulation de facture
 * validée (réservées à l'Admin, cf. app/(admin)/admin/factures/[id]/page.tsx
 * pour la structure de référence). L'annulation d'un brouillon reste gérée
 * depuis la liste (MesFacturesList.tsx via annulerBrouillon), pas ici.
 *
 * Les policies RLS `factures_lecture_agent_propre` et équivalentes sur
 * `lignes_facture` / `paiements` garantissent déjà qu'un agent ne peut lire
 * que ses propres factures — aucune vérification supplémentaire côté client
 * n'est nécessaire ni ne doit contourner ces policies.
 */
export default async function FactureDetailAgentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: facture } = await supabase
    .from("factures")
    .select("*, client:clients(id, nom, telephone, adresse, email)")
    .eq("id", id)
    .single();

  if (!facture) {
    notFound();
  }

  const [{ data: lignesData }, { data: paiementsData }, { data: creditData }, { data: retardData }, { data: entrepriseData }] =
    await Promise.all([
      supabase
        .from("lignes_facture")
        // `quantite_stock` volontairement absente de cette sélection (règle
        // métier 16, migration 0013) : colonne dépréciée, gelée, jamais
        // affichée par cet écran (lecture seule, aucun rendu de stock ici) —
        // aucune raison de continuer à la lire.
        .select("*, produit:produits(id, code, nom, unite, type_ligne_produit, photos_urls)")
        .eq("facture_id", id)
        .order("created_at"),
      supabase.from("paiements").select("*").eq("facture_id", id).order("date_paiement", { ascending: false }),
      supabase
        .from("credits")
        .select("id, montant_rembourse, remboursements:remboursements_credit(*)")
        .eq("facture_id", id)
        .maybeSingle(),
      supabase.from("v_factures_retard_paiement").select("jours_de_retard").eq("facture_id", id).maybeSingle(),
      supabase
        .from("entreprise_config_public")
        .select("nom, ninea, rc, adresses, telephones, email, logo_url")
        .eq("id", true)
        .single(),
    ]);

  const lignes = (lignesData as unknown as LigneFactureAvecProduit[]) ?? [];
  const paiements = (paiementsData as PaiementRow[]) ?? [];
  const credit = creditData as unknown as
    | { id: string; montant_rembourse: number; remboursements: RemboursementCreditRow[] | null }
    | null;
  const remboursementsCredit = credit?.remboursements ?? [];
  const joursDeRetard = (retardData as { jours_de_retard: number } | null)?.jours_de_retard ?? null;
  const entreprise = entrepriseData as Pick<
    EntrepriseConfigPublicRow,
    "nom" | "ninea" | "rc" | "adresses" | "telephones" | "email" | "logo_url"
  > | null;

  const totalPaiementsDirects = paiements.reduce((sum, p) => sum + p.montant, 0);
  const totalRecouvreCredit = credit?.montant_rembourse ?? 0;
  const totalPaye = totalPaiementsDirects + totalRecouvreCredit;
  const resteAPayer = Math.max(0, facture.total_general - totalPaye);
  const client = facture.client as unknown as {
    id: string;
    nom: string;
    telephone: string | null;
    adresse: string | null;
    email: string | null;
  };

  return (
    <div className="flex flex-col gap-4 pb-8">
      <Link href="/mes-factures" className="focus-ring w-fit rounded-input text-body text-muted hover:text-text">
        ← Mes factures
      </Link>

      <section className="flex flex-col gap-4 rounded-card border border-border bg-surface p-4 shadow-card sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="rounded-input bg-surface-2 px-3 py-1 font-mono text-h2 text-text">
              {facture.numero}
            </h1>
            <StatusBadge statut={facture.statut} />
            {joursDeRetard !== null && <OverdueBadge joursDeRetard={joursDeRetard} />}
          </div>
          <p className="mt-1 text-body text-muted">Créée le {formatDateTime(facture.created_at)}</p>
        </div>
        <FactureActions
          factureId={facture.id}
          factureNumero={facture.numero}
          statut={facture.statut}
          clientTelephone={client?.telephone ?? null}
          clientEmail={client?.email ?? null}
          totalGeneral={facture.total_general}
        />
      </section>

      <section className="grid grid-cols-1 overflow-hidden rounded-card border border-border bg-surface shadow-card min-[380px]:grid-cols-3">
        <div className="border-b border-border px-3 py-3 min-[380px]:border-b-0 min-[380px]:border-r sm:px-4">
          <p className="text-caption uppercase tracking-wide text-muted">Total</p>
          <p className="mt-1 font-mono text-body font-semibold text-text sm:text-h2">{formatMontant(facture.total_general)}</p>
        </div>
        <div className="border-b border-border px-3 py-3 min-[380px]:border-b-0 min-[380px]:border-r sm:px-4">
          <p className="text-caption uppercase tracking-wide text-muted">Payé</p>
          <p className="mt-1 font-mono text-body font-semibold text-green-text sm:text-h2">{formatMontant(totalPaye)}</p>
        </div>
        <div className="px-3 py-3 sm:px-4">
          <p className="text-caption uppercase tracking-wide text-muted">Reste</p>
          <p className={`mt-1 font-mono text-body font-semibold sm:text-h2 ${resteAPayer > 0 ? "text-red-text" : "text-green-text"}`}>
            {formatMontant(resteAPayer)}
          </p>
        </div>
      </section>

      {/* Bloc entreprise + client — même traitement que l'aperçu facture Admin
          (app/(admin)/admin/factures/[id]/page.tsx), sans les champs bancaires
          (entreprise_config_public ne les expose pas à l'agent). */}
      <Card className="overflow-hidden !p-0 shadow-card">
        <div className="grid grid-cols-1 gap-0 lg:grid-cols-2">
          <div className="flex flex-col gap-2 border-b border-border p-4 sm:p-5 lg:border-b-0 lg:border-r">
            <div className="flex items-center gap-3">
              <CompanyBrandMark
                nom={entreprise?.nom ?? "GIE FASSO BARA"}
                logoUrl={entreprise?.logo_url ?? null}
              />
              <div>
                <p className="text-h3 text-text">{entreprise?.nom ?? "GIE FASSO BARA"}</p>
                {entreprise?.ninea && <p className="text-body text-muted">NINEA {entreprise.ninea}</p>}
                {entreprise?.rc && <p className="text-body text-muted">RC {entreprise.rc}</p>}
              </div>
            </div>
            {entreprise?.adresses && entreprise.adresses.length > 0 && (
              <p className="text-body text-muted">{entreprise.adresses.join(" · ")}</p>
            )}
            {entreprise?.telephones && entreprise.telephones.length > 0 && (
              <p className="text-body text-muted">Tél : {entreprise.telephones.join(" / ")}</p>
            )}
            {entreprise?.email && <p className="text-body text-muted">{entreprise.email}</p>}
          </div>

          <div className="flex flex-col gap-1 p-4 sm:p-5">
            <p className="text-caption uppercase tracking-wide text-muted">Facturé à</p>
            <p className="text-h3 text-text">{client?.nom}</p>
            {client?.adresse && <p className="text-body text-muted">{client.adresse}</p>}
            {client?.telephone && <p className="text-body text-muted">{client.telephone}</p>}
            {client?.email && <p className="text-body text-muted">{client.email}</p>}
            <p className="mt-2 text-body text-muted">
              Date de facture : <span className="text-text">{formatDate(facture.date_facture)}</span>
            </p>
            {(facture.date_echeance || facture.date_validation) && (
              <p className="text-body text-muted">
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
      </Card>

      <Card className="overflow-hidden !p-0 shadow-card">
        {/* < md (Agent = mobile-first, docs/design-system.md §9) : cartes
            empilées, une par ligne — le tableau ci-dessous devenait illisible
            sous ~420px (colonnes tronquées, scroll horizontal peu
            découvrable sur un document déjà dense). À partir de md, tableau
            classique conservé (même densité qu'Admin, écran plus large). */}
        <div className="flex flex-col divide-y divide-border md:hidden">
          {lignes.map((ligne) => (
            <div key={ligne.id} className="flex flex-col gap-1.5 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-body text-text">{ligne.produit?.nom}</p>
                  <p className="font-mono text-body text-muted">{ligne.produit?.code}</p>
                </div>
                <p className="shrink-0 font-mono text-body font-medium text-text">
                  {ligne.produit?.type_ligne_produit === "inclus_dans_kit" ? (
                    <span className="badge-pastel-neutral rounded-badge px-2 py-1 text-caption">Inclus</span>
                  ) : (
                    formatMontant(ligne.total_ligne)
                  )}
                </p>
              </div>
              <p className="text-body text-muted">
                {formatQuantite(ligne.quantite, libelleUnite(ligne.produit?.unite ?? "piece", ligne.quantite))}
                {ligne.produit?.type_ligne_produit !== "inclus_dans_kit" &&
                  ` · ${formatMontant(ligne.prix_unitaire)} / unité`}
              </p>
            </div>
          ))}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border text-left text-caption uppercase tracking-[0.06em] text-muted">
                <th className="px-4 py-2.5 font-medium">Produit</th>
                <th className="px-4 py-2.5 text-right font-medium">Quantité</th>
                <th className="px-4 py-2.5 text-right font-medium">Prix unitaire</th>
                <th className="px-4 py-2.5 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((ligne) => (
                <tr key={ligne.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <p className="text-body text-text">{ligne.produit?.nom}</p>
                    <p className="font-mono text-body text-muted">{ligne.produit?.code}</p>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-body text-text">
                    {formatQuantite(ligne.quantite, libelleUnite(ligne.produit?.unite ?? "piece", ligne.quantite))}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-body text-text">
                    {ligne.produit?.type_ligne_produit === "inclus_dans_kit" ? (
                      <span className="badge-pastel-neutral rounded-badge px-2 py-1 text-caption">Inclus</span>
                    ) : (
                      formatMontant(ligne.prix_unitaire)
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-body text-text">
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

        <div className="flex flex-col gap-1.5 border-t border-border bg-surface-2 p-4 sm:p-5 lg:ml-auto lg:w-80">
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
              <span className="font-mono text-text">{formatMontant(facture.total_ht * facture.tva_taux)}</span>
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
      </Card>

      <Card className="!p-0">
        <h2 className="p-4 text-h2 text-text">Historique des paiements</h2>

        {paiements.length === 0 && remboursementsCredit.length === 0 ? (
          <p className="px-4 pb-4 text-center text-body text-muted">
            Aucun paiement enregistré pour cette facture.
          </p>
        ) : (
          <>
            <div className="flex flex-col divide-y divide-border border-t border-border md:hidden">
              {paiements.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 p-4">
                  <div>
                    <p className="text-body text-text">{MODES_PAIEMENT_LABEL[p.mode_paiement]}</p>
                    <p className="text-body text-muted">
                      {formatDate(p.date_paiement)}
                      {p.reference && ` · ${p.reference}`}
                    </p>
                  </div>
                  <p className="shrink-0 font-mono text-body text-text">{formatMontant(p.montant)}</p>
                </div>
              ))}
              {remboursementsCredit.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 p-4">
                  <div>
                    <p className="text-body text-text">Recouvrement crédit</p>
                    <p className="text-body text-muted">
                      {formatDate(r.date_remboursement)}
                      {r.notes && ` · ${r.notes}`}
                    </p>
                  </div>
                  <p className="shrink-0 font-mono text-body text-text">{formatMontant(r.montant)}</p>
                </div>
              ))}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-border text-left text-caption uppercase tracking-[0.06em] text-muted">
                    <th className="px-4 py-2.5 font-medium">Date</th>
                    <th className="px-4 py-2.5 font-medium">Mode</th>
                    <th className="px-4 py-2.5 font-medium">Référence</th>
                    <th className="px-4 py-2.5 text-right font-medium">Montant</th>
                  </tr>
                </thead>
                <tbody>
                  {paiements.map((p) => (
                    <tr key={p.id} className="border-t border-border">
                      <td className="px-4 py-3 text-body text-muted">{formatDate(p.date_paiement)}</td>
                      <td className="px-4 py-3 text-body text-text">{MODES_PAIEMENT_LABEL[p.mode_paiement]}</td>
                      <td className="px-4 py-3 text-body text-muted">{p.reference ?? "—"}</td>
                      <td className="px-4 py-3 text-right font-mono text-body text-text">
                        {formatMontant(p.montant)}
                      </td>
                    </tr>
                  ))}
                  {remboursementsCredit.map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="px-4 py-3 text-body text-muted">{formatDate(r.date_remboursement)}</td>
                      <td className="px-4 py-3 text-body text-text">Recouvrement crédit</td>
                      <td className="px-4 py-3 text-body text-muted">{r.notes ?? "—"}</td>
                      <td className="px-4 py-3 text-right font-mono text-body text-text">
                        {formatMontant(r.montant)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      {facture.notes && (
        <Card>
          <p className="text-body text-muted">Notes</p>
          <p className="mt-1 text-body text-text">{facture.notes}</p>
        </Card>
      )}
    </div>
  );
}

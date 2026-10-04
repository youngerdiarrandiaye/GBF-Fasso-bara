import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatQuantite, libelleUnite } from "@/lib/format";
import { Card } from "@/components/ui/Card";
import { BonLivraisonStatusBadge } from "@/components/ui/BonLivraisonStatusBadge";
import { Breadcrumbs } from "@/components/admin/Breadcrumbs";
import { RealtimeRevalidate } from "@/components/admin/RealtimeRevalidate";
import { BonLivraisonStatusToggle } from "@/components/admin/BonLivraisonStatusToggle";
import type { BonLivraisonAvecDetails, LigneBonLivraisonAvecProduit } from "@/lib/supabase/database.types";
import { EmptyState } from "@/components/ui/EmptyState";
import { faBoxOpen } from "@fortawesome/free-solid-svg-icons";

export const dynamic = "force-dynamic";

export default async function BonLivraisonDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: bonLivraison } = await supabase
    .from("bons_livraison")
    .select(
      "*, client:clients(id, nom, telephone), agent:utilisateurs!bons_livraison_agent_id_fkey(id, nom), entrepot:entrepots(id, nom)"
    )
    .eq("id", id)
    .single();

  if (!bonLivraison) {
    notFound();
  }
  const blTyped = bonLivraison as unknown as BonLivraisonAvecDetails;

  const [{ data: lignesData }, { data: facture }] = await Promise.all([
    supabase
      .from("lignes_bon_livraison")
      .select("*, produit:produits(id, code, nom, unite)")
      .eq("bon_livraison_id", id),
    blTyped.facture_id
      ? supabase.from("factures").select("id, numero").eq("id", blTyped.facture_id).single()
      : Promise.resolve({ data: null as { id: string; numero: string } | null }),
  ]);

  const lignes = (lignesData as unknown as LigneBonLivraisonAvecProduit[]) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <RealtimeRevalidate tables={["bons_livraison", "lignes_bon_livraison"]} />

      <Breadcrumbs items={[{ label: "Bons de livraison", href: "/admin/bons-livraison" }, { label: blTyped.numero }]} />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-h1 text-text">
              <span className="rounded-input bg-surface-2 px-2 py-1 font-mono">{blTyped.numero}</span>
            </h1>
            <BonLivraisonStatusBadge statut={blTyped.statut} />
          </div>
          <p className="mt-1 text-body text-muted">Client : {blTyped.client?.nom}</p>
        </div>
        <BonLivraisonStatusToggle bonLivraisonId={blTyped.id} numero={blTyped.numero} statut={blTyped.statut} />
      </div>

      <Card className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <p className="text-body-sm text-muted">Entrepôt de départ</p>
          <Link
            href={`/admin/entrepots/${blTyped.entrepot?.id}`}
            className="focus-ring rounded-input text-body text-text hover:underline"
          >
            {blTyped.entrepot?.nom}
          </Link>
        </div>
        <div>
          <p className="text-body-sm text-muted">Date de livraison</p>
          <p className="text-body text-text">{formatDate(blTyped.date_livraison)}</p>
        </div>
        <div>
          <p className="text-body-sm text-muted">Agent</p>
          <p className="text-body text-text">{blTyped.agent?.nom}</p>
        </div>
        {facture && (
          <div>
            <p className="text-body-sm text-muted">Facture liée</p>
            <Link
              href={`/admin/factures/${facture.id}`}
              className="focus-ring rounded-input bg-surface-2 px-2 py-1 font-mono text-body-sm text-text hover:underline"
            >
              {facture.numero}
            </Link>
          </div>
        )}
      </Card>

      {blTyped.notes && (
        <Card>
          <p className="text-body-sm text-muted">Notes</p>
          <p className="mt-1 text-body text-text">{blTyped.notes}</p>
        </Card>
      )}

      <Card className="!p-0">
        <div className="p-4">
          <h2 className="text-h2 text-text">Lignes livrées</h2>
          <p className="text-body-sm text-muted">
            Document logistique, sans prix — le stock de l&apos;entrepôt de départ a été décrémenté dès la
            saisie de chaque ligne.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[460px] w-full border-collapse">
            <thead>
              <tr className="text-left text-body-sm uppercase tracking-wide text-muted">
                <th className="px-4 py-2.5 font-medium">Produit</th>
                <th className="px-4 py-2.5 text-right font-medium">Quantité livrée</th>
              </tr>
            </thead>
            <tbody>
              {lignes.length === 0 ? (
                <tr>
                  <td colSpan={2}><EmptyState icone={faBoxOpen} titre="Aucune ligne enregistrée." /></td>
                </tr>
              ) : (
                lignes.map((l) => (
                  <tr key={l.id} className="border-t border-border hover:bg-surface-2">
                    <td className="px-4 py-3">
                      <span className="text-body text-text">{l.produit.nom}</span>
                      <span className="ml-2 font-mono text-body-sm text-muted">{l.produit.code}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-body text-text">
                      {formatQuantite(l.quantite, libelleUnite(l.produit.unite, l.quantite))}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

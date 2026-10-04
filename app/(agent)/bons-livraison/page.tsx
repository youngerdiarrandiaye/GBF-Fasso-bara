import Link from "next/link";
import { faClockRotateLeft, faFileInvoice, faPlus, faTruck, faTruckFast } from "@fortawesome/free-solid-svg-icons";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { QuickActionGrid } from "@/components/ui/QuickActionGrid";
import { BonLivraisonStatusBadge } from "@/components/ui/BonLivraisonStatusBadge";
import type { BonLivraisonAvecDetails } from "@/lib/supabase/database.types";
import { EmptyState } from "@/components/ui/EmptyState";

export const dynamic = "force-dynamic";

/**
 * Mes bons de livraison — liste des BL créés par l'agent connecté (règle
 * métier 15, migration 0013). Pendant de "Mes factures" pour ce nouveau
 * document : la policy RLS `bons_livraison_lecture_agent_propre` garantit
 * déjà qu'aucun BL d'un autre agent ne peut apparaître ici. Pas d'action
 * d'édition/annulation ici (RLS : l'agent n'a aucune policy UPDATE/DELETE
 * sur bons_livraison ni lignes_bon_livraison une fois créés, cf. migration
 * 0013 sections 5-6) — un BL déjà créé est définitif côté Agent, toute
 * correction reste une intervention Admin.
 */
export default async function BonsLivraisonPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("bons_livraison")
    .select(
      "id, numero, client_id, facture_id, entrepot_id, agent_id, statut, date_livraison, notes, created_at, updated_at, client:clients(id, nom, telephone), entrepot:entrepots(id, nom)"
    )
    .order("created_at", { ascending: false })
    .limit(200);

  const bonsLivraison = (data as unknown as BonLivraisonAvecDetails[]) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-h1 text-text">Mes bons de livraison</h1>
        <Link href="/bons-livraison/nouveau">
          <Button>+ Nouveau bon de livraison</Button>
        </Link>
      </div>
      <QuickActionGrid
        actions={[
          { href: "/bons-livraison/nouveau", label: "Créer BL", description: "Livraison rapide", icon: faPlus, tone: "green" },
          { href: "/nouvelle-facture", label: "Facturer", description: "Nouvelle vente", icon: faFileInvoice, tone: "blue" },
          { href: "/bons-livraison", label: "Livrés", description: "Historique", icon: faTruckFast, tone: "amber" },
          { href: "/mes-factures", label: "Factures", description: "Voir les ventes", icon: faClockRotateLeft, tone: "purple" },
        ]}
        columns={4}
      />

      {bonsLivraison.length === 0 ? (
        <EmptyState icone={faTruck} titre="Aucun bon de livraison créé pour le moment." action={{ href: "/bons-livraison/nouveau", label: "Créer un bon de livraison" }} className="rounded-card border border-dashed border-border bg-surface-2" />
      ) : (
        <div className="flex flex-col gap-3">
          {bonsLivraison.map((bl) => (
            <Card key={bl.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-body font-medium text-text">{bl.client?.nom}</p>
                  <p className="font-mono text-body text-muted">
                    {bl.numero} · {formatDate(bl.date_livraison)}
                    {bl.entrepot?.nom ? ` · ${bl.entrepot.nom}` : ""}
                  </p>
                </div>
                <BonLivraisonStatusBadge statut={bl.statut} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

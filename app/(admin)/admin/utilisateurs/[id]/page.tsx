import { notFound } from "next/navigation";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFileInvoice, faUser, faUserShield } from "@fortawesome/free-solid-svg-icons";
import { createClient } from "@/lib/supabase/server";
import { formatMontant, formatDate, formatDateTime } from "@/lib/format";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { OverdueBadge } from "@/components/facture/OverdueBadge";
import { Breadcrumbs } from "@/components/admin/Breadcrumbs";
import { UserRowActions } from "@/components/admin/UserRowActions";
import { obtenirDernieresConnexions } from "@/lib/actions/utilisateurs";
import type {
  ClientRow,
  FactureRetardPaiementRow,
  FactureRow,
  StatutFacture,
  UtilisateurRow,
} from "@/lib/supabase/database.types";
import { EmptyState } from "@/components/ui/EmptyState";

type FactureAvecClient = FactureRow & { client: Pick<ClientRow, "id" | "nom" | "telephone" | "type_client"> };

export const dynamic = "force-dynamic";

const STATUTS_CA: StatutFacture[] = ["validee", "payee_partielle", "payee"];

/**
 * Fiche détail utilisateur (admin only) — "vue pour chaque agent" : en plus
 * des infos de compte (rôle, statut, dernière connexion), affiche pour un
 * agent ses factures et un résumé de son activité commerciale. Pour un
 * compte admin, seules les infos de compte sont pertinentes (pas de
 * statistiques de vente inventées pour un rôle qui ne facture pas).
 */
export default async function UtilisateurDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user: appelant },
  } = await supabase.auth.getUser();

  const { data: utilisateurData } = await supabase.from("utilisateurs").select("*").eq("id", id).single();
  if (!utilisateurData) {
    notFound();
  }
  const utilisateur = utilisateurData as UtilisateurRow;

  const dernieresConnexions = await obtenirDernieresConnexions([id]);
  const derniereConnexion = dernieresConnexions.get(id) ?? null;

  const estAgent = utilisateur.role === "agent";

  let factures: FactureAvecClient[] = [];
  let joursDeRetardParFacture = new Map<string, number>();
  let caTotal = 0;
  let caMois = 0;

  if (estAgent) {
    const { data: facturesData } = await supabase
      .from("factures")
      .select(
        "id, numero, statut, total_general, date_facture, client:clients(id, nom, telephone, type_client)"
      )
      .eq("agent_id", id)
      .order("date_facture", { ascending: false })
      .limit(50);
    factures = (facturesData as unknown as FactureAvecClient[]) ?? [];

    caTotal = factures
      .filter((f) => STATUTS_CA.includes(f.statut))
      .reduce((sum, f) => sum + f.total_general, 0);

    const debutMois = new Date();
    debutMois.setDate(1);
    debutMois.setHours(0, 0, 0, 0);
    caMois = factures
      .filter((f) => STATUTS_CA.includes(f.statut) && new Date(f.date_facture) >= debutMois)
      .reduce((sum, f) => sum + f.total_general, 0);

    const { data: retardsData } = await supabase
      .from("v_factures_retard_paiement")
      .select("facture_id, jours_de_retard")
      .eq("agent_id", id);
    joursDeRetardParFacture = new Map<string, number>(
      ((retardsData as Pick<FactureRetardPaiementRow, "facture_id" | "jours_de_retard">[]) ?? []).map((r) => [
        r.facture_id,
        r.jours_de_retard,
      ])
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs items={[{ label: "Utilisateurs", href: "/admin/utilisateurs" }, { label: utilisateur.nom }]} />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-h1 text-text">
            {utilisateur.nom} {utilisateur.id === appelant?.id && <span className="text-body-sm text-muted">(vous)</span>}
          </h1>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge tone={utilisateur.role === "admin" ? "green" : "blue"}>
              <FontAwesomeIcon
                icon={utilisateur.role === "admin" ? faUserShield : faUser}
                aria-hidden="true"
                className="mr-1 h-3 w-3"
              />
              {utilisateur.role === "admin" ? "Administrateur" : "Agent"}
            </Badge>
            <Badge tone={utilisateur.actif ? "green" : "red"}>
              {utilisateur.actif ? "Actif" : "Désactivé"}
            </Badge>
          </div>
        </div>
        <UserRowActions utilisateur={utilisateur} estSoiMeme={utilisateur.id === appelant?.id} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-body-sm text-muted">Créé le</p>
          <p className="mt-1 text-body text-text">{formatDate(utilisateur.created_at)}</p>
        </Card>
        <Card>
          <p className="text-body-sm text-muted">Dernière connexion</p>
          <p className="mt-1 text-body text-text">
            {derniereConnexion ? formatDateTime(derniereConnexion) : "Jamais connecté"}
          </p>
        </Card>
        {estAgent ? (
          <Card>
            <p className="text-body-sm text-muted">Chiffre d&apos;affaires du mois</p>
            <p className="mt-1 font-mono text-display text-text">{formatMontant(caMois)}</p>
          </Card>
        ) : (
          <Card>
            <p className="text-body-sm text-muted">Rôle</p>
            <p className="mt-1 text-body text-text">Administrateur — accès complet à l&apos;Espace Admin.</p>
          </Card>
        )}
      </div>

      {estAgent && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Card>
              <p className="text-body-sm text-muted">Chiffre d&apos;affaires total (factures conclues)</p>
              <p className="mt-1 font-mono text-display text-text">{formatMontant(caTotal)}</p>
            </Card>
            <Card>
              <p className="text-body-sm text-muted">Nombre de factures</p>
              <p className="mt-1 font-mono text-display text-text">{factures.length}</p>
            </Card>
          </div>

          <Card className="!p-0">
            <h2 className="p-4 text-h2 text-text">Factures de cet agent</h2>
            <div className="overflow-x-auto">
              <table className="min-w-[680px] w-full border-collapse">
                <thead>
                  <tr className="text-left text-body-sm uppercase tracking-wide text-muted">
                    <th className="px-4 py-2.5 font-medium">Numéro</th>
                    <th className="px-4 py-2.5 font-medium">Client</th>
                    <th className="px-4 py-2.5 font-medium">Date</th>
                    <th className="px-4 py-2.5 font-medium">Statut</th>
                    <th className="px-4 py-2.5 text-right font-medium">Montant</th>
                  </tr>
                </thead>
                <tbody>
                  {factures.length === 0 ? (
                    <tr>
                      <td colSpan={5}><EmptyState icone={faFileInvoice} titre="Aucune facture créée par cet agent." /></td>
                    </tr>
                  ) : (
                    factures.map((facture) => (
                      <tr key={facture.id} className="border-t border-border hover:bg-surface-2">
                        <td className="px-4 py-3">
                          <Link
                            href={`/admin/factures/${facture.id}`}
                            className="focus-ring rounded-input bg-surface-2 px-2 py-1 font-mono text-body-sm text-text hover:underline"
                          >
                            {facture.numero}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-body text-text">{facture.client?.nom}</td>
                        <td className="px-4 py-3 text-body-sm text-muted">{formatDate(facture.date_facture)}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <StatusBadge statut={facture.statut} />
                            {joursDeRetardParFacture.has(facture.id) && (
                              <OverdueBadge joursDeRetard={joursDeRetardParFacture.get(facture.id)!} />
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-body text-text">
                          {formatMontant(facture.total_general)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

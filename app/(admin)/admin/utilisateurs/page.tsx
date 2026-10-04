import { Suspense } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUserShield, faUser } from "@fortawesome/free-solid-svg-icons";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime } from "@/lib/format";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { QuickActionGrid } from "@/components/ui/QuickActionGrid";
import { NewUserButton } from "@/components/admin/NewUserButton";
import { UserRowActions } from "@/components/admin/UserRowActions";
import { SearchInput } from "@/components/admin/SearchInput";
import { BrandedListPanel } from "@/components/admin/BrandedListPanel";
import { ClickableTableRow } from "@/components/admin/ClickableTableRow";
import { StopClickPropagation } from "@/components/admin/StopClickPropagation";
import { Pagination } from "@/components/admin/Pagination";
import { obtenirDernieresConnexions } from "@/lib/actions/utilisateurs";
import type { EntrepriseConfigRow, UtilisateurRow } from "@/lib/supabase/database.types";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 10;

/**
 * Écran Utilisateurs (admin only) — SIGNALÉ EXPLICITEMENT à expert-securite
 * pour audit prioritaire : gestion des comptes/rôles, écran le plus sensible
 * de l'Espace Admin avec Paramètres (coordonnées bancaires). Toute écriture
 * passe par lib/actions/utilisateurs.ts (voir son en-tête pour le détail du
 * seul usage de service_role du projet).
 */
export default async function UtilisateursAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q, page } = await searchParams;
  const pageActuelle = Math.max(1, parseInt(page ?? "1", 10) || 1);
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: entreprise } = await supabase
    .from("entreprise_config")
    .select("nom, logo_url")
    .eq("id", true)
    .single();
  const config = entreprise as Pick<EntrepriseConfigRow, "nom" | "logo_url"> | null;

  let requete = supabase
    .from("utilisateurs")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false });
  if (q) requete = requete.ilike("nom", `%${q}%`);

  const offset = (pageActuelle - 1) * PAGE_SIZE;
  const { data, count } = await requete.range(offset, offset + PAGE_SIZE - 1);
  const utilisateurs = (data as UtilisateurRow[]) ?? [];
  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const dernieresConnexions = await obtenirDernieresConnexions(utilisateurs.map((u) => u.id));

  function buildHref(cible: number) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (cible > 1) params.set("page", String(cible));
    const qs = params.toString();
    return qs ? `/admin/utilisateurs?${qs}` : "/admin/utilisateurs";
  }

  return (
    <div className="flex flex-col gap-6">
      <BrandedListPanel
        nom={config?.nom ?? "GIE FASSO BARA"}
        logoUrl={config?.logo_url ?? null}
        title="Utilisateurs"
        subtitle="Comptes, rôles et statut d'activité."
        actions={<NewUserButton />}
      >
        <QuickActionGrid
          actions={[
            { href: "/admin/utilisateurs", label: "Comptes", description: "Agents et admins", icon: faUser, tone: "blue" },
            { href: "/admin/utilisateurs", label: "Nouvel accès", description: "Créer un compte", icon: faUserShield, tone: "green" },
            { href: "/admin/parametres", label: "Paramètres", description: "Entreprise", icon: faUserShield, tone: "purple" },
          ]}
          columns={3}
        />

        <Card>
          <Suspense>
            <SearchInput label="Rechercher" placeholder="Nom..." />
          </Suspense>
        </Card>

        <Card className="!p-0">
          <div className="divide-y divide-border md:hidden">
            {utilisateurs.length === 0 ? (
              <p className="p-6 text-center text-body text-muted">Aucun utilisateur trouvé.</p>
            ) : utilisateurs.map((u) => {
              const derniereConnexion = dernieresConnexions.get(u.id) ?? null;
              return (
                <div key={u.id} className="p-4">
                  <div className="flex items-start justify-between gap-3"><Link href={`/admin/utilisateurs/${u.id}`} className="focus-ring text-body font-semibold text-text hover:underline">{u.nom} {u.id === user?.id && <span className="text-body-sm font-normal text-muted">(vous)</span>}</Link><Badge tone={u.actif ? "green" : "red"}>{u.actif ? "Actif" : "Désactivé"}</Badge></div>
                  <div className="mt-3 flex items-center justify-between gap-3"><Badge tone={u.role === "admin" ? "green" : "blue"}>{u.role === "admin" ? "Administrateur" : "Agent"}</Badge><UserRowActions utilisateur={u} estSoiMeme={u.id === user?.id} /></div>
                  <p className="mt-3 text-caption text-muted">Dernière connexion : {derniereConnexion ? formatDateTime(derniereConnexion) : "Jamais connecté"}</p>
                </div>
              );
            })}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-surface-2 text-left text-caption uppercase tracking-[0.1em] text-muted">
                  <th className="px-4 py-2.5 font-medium">Nom</th>
                  <th className="px-4 py-2.5 font-medium">Rôle</th>
                  <th className="px-4 py-2.5 font-medium">Statut</th>
                  <th className="px-4 py-2.5 font-medium">Créé le</th>
                  <th className="px-4 py-2.5 font-medium">Dernière connexion</th>
                  <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {utilisateurs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-body text-muted">
                      Aucun utilisateur trouvé.
                    </td>
                  </tr>
                ) : (
                  utilisateurs.map((u) => {
                    const derniereConnexion = dernieresConnexions.get(u.id) ?? null;
                    return (
                      <ClickableTableRow
                        key={u.id}
                        href={`/admin/utilisateurs/${u.id}`}
                        className="border-t border-border hover:bg-surface-2"
                      >
                        <td className="px-4 py-3 text-body text-text">
                          {u.nom} {u.id === user?.id && <span className="text-body-sm text-muted">(vous)</span>}
                        </td>
                        <td className="px-4 py-3">
                          <Badge tone={u.role === "admin" ? "green" : "blue"}>
                            <FontAwesomeIcon
                              icon={u.role === "admin" ? faUserShield : faUser}
                              aria-hidden="true"
                              className="mr-1 h-3 w-3"
                            />
                            {u.role === "admin" ? "Administrateur" : "Agent"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge tone={u.actif ? "green" : "red"}>{u.actif ? "Actif" : "Désactivé"}</Badge>
                        </td>
                        <td className="px-4 py-3 text-body-sm text-muted">{formatDate(u.created_at)}</td>
                        <td className="px-4 py-3 text-body-sm text-muted">
                          {derniereConnexion ? formatDateTime(derniereConnexion) : "Jamais connecté"}
                        </td>
                        <td className="px-4 py-3">
                          <StopClickPropagation>
                            <UserRowActions utilisateur={u} estSoiMeme={u.id === user?.id} />
                          </StopClickPropagation>
                        </td>
                      </ClickableTableRow>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <Pagination
            page={pageActuelle}
            totalPages={totalPages}
            totalCount={totalCount}
            pageSize={PAGE_SIZE}
            buildHref={buildHref}
            itemLabel="utilisateur"
          />
        </Card>
      </BrandedListPanel>
    </div>
  );
}

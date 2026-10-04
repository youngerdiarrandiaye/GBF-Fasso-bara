import type { ReactNode } from "react";
import { CompanyBrandMark } from "@/components/facture/CompanyBrandMark";

/**
 * Enveloppe "feuille brandée" partagée par les écrans-listes de l'Espace
 * Admin (Factures, Stock, Clients, Paiements, Utilisateurs, Rapports) :
 * logo/nom entreprise en en-tête, carte blanche très arrondie à ombre douce.
 *
 * Historique : ce composant imposait auparavant un `data-theme="agent"`
 * imbriqué + une bordure verte lumineuse, pour simuler une "feuille claire"
 * sur un Admin alors sombre. Le thème Admin étant désormais clair par
 * défaut (refonte "Ultraleads", `[data-theme="admin"]` dans
 * `app/globals.css`), ce patch est devenu redondant — la carte utilise
 * simplement `bg-surface`/`border-border`, cohérents avec le reste de
 * l'Admin, sans plus rien forcer.
 */
export function BrandedListPanel({
  nom,
  logoUrl,
  title,
  subtitle,
  actions,
  children,
}: {
  nom: string;
  logoUrl: string | null;
  title: string;
  subtitle: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-card-lg border border-border bg-surface shadow-sm">
      <header className="flex flex-col gap-4 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex items-center gap-3">
          <CompanyBrandMark nom={nom} logoUrl={logoUrl} size="lg" />
          <div className="min-w-0">
            <h1 className="text-h1 font-semibold tracking-tight text-text">{title}</h1>
            <p className="mt-1 text-body-sm text-muted">{subtitle}</p>
          </div>
        </div>
        {actions}
      </header>
      <div className="flex flex-col gap-4 p-4 sm:p-5">{children}</div>
    </section>
  );
}

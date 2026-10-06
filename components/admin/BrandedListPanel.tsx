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
 * l'Admin, sans plus rien forcer. Depuis D-28, plus de carte du tout.
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
  // D-28 : plus de carte englobante (les filtres et le tableau sont déjà
  // des cartes — l'enveloppe créait des cartes dans une carte). L'en-tête
  // reprend celui du tableau de bord.
  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <CompanyBrandMark nom={nom} logoUrl={logoUrl} size="md" />
        <div className="mr-auto min-w-0">
          <h1 className="text-h1 font-semibold tracking-tight text-text">{title}</h1>
          <p className="text-body-sm text-muted">{subtitle}</p>
        </div>
        {actions}
      </header>
      {children}
    </section>
  );
}

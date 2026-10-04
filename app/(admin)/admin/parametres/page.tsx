import { faBuilding, faImage, faLayerGroup, faShieldHalved } from "@fortawesome/free-solid-svg-icons";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { QuickActionGrid } from "@/components/ui/QuickActionGrid";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { CompanySettingsForm } from "@/components/admin/CompanySettingsForm";
import { CategoriesManager } from "@/components/admin/CategoriesManager";
import type { CategorieProduitRow, EntrepriseConfigRow } from "@/lib/supabase/database.types";

export const dynamic = "force-dynamic";

/**
 * Écran Paramètres — SIGNALÉ EXPLICITEMENT à expert-securite : lit la table
 * `entreprise_config` COMPLÈTE (coordonnées bancaires incluses), dont la
 * lecture est réservée à l'admin depuis le correctif
 * 0003_correctifs_securite.sql (policy `entreprise_config_lecture_admin`).
 * Ne jamais réutiliser cette requête côté Espace Agent — l'équivalent non
 * sensible y est la vue `entreprise_config_public`.
 */
export default async function ParametresAdminPage() {
  const supabase = await createClient();

  const [{ data: config }, { data: categories }] = await Promise.all([
    supabase.from("entreprise_config").select("*").eq("id", true).single(),
    supabase.from("categories_produits").select("*").order("nom"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-h1 font-semibold tracking-tight text-text">Paramètres</h1>
        <p className="text-body text-muted">
          Informations entreprise, mentions légales de facture et catégories de produits.
        </p>
      </div>

      <QuickActionGrid
        actions={[
          { href: "/admin/parametres", label: "Entreprise", description: "Nom, contacts, banque", icon: faBuilding, tone: "green" },
          { href: "/admin/parametres", label: "Logo", description: "Factures et en-tête", icon: faImage, tone: "blue" },
          { href: "/admin/parametres", label: "Catégories", description: "Produits", icon: faLayerGroup, tone: "amber" },
          { href: "/admin/utilisateurs", label: "Accès", description: "Admins et agents", icon: faShieldHalved, tone: "purple" },
        ]}
        columns={4}
      />

      {!config ? (
        <InlineAlert tone="red">
          Configuration entreprise introuvable (ligne singleton `entreprise_config` manquante).
          Contactez l&apos;équipe technique — voir supabase/seed.sql.
        </InlineAlert>
      ) : (
        <Card className="max-w-3xl">
          <CompanySettingsForm config={config as EntrepriseConfigRow} />
        </Card>
      )}

      <Card className="max-w-3xl">
        <h2 className="mb-4 text-h2 text-text">Catégories de produits</h2>
        <CategoriesManager categories={(categories as CategorieProduitRow[]) ?? []} />
      </Card>
    </div>
  );
}

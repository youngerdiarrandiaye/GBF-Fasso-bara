import { Breadcrumbs } from "@/components/admin/Breadcrumbs";
import { ImportClientsWizard } from "@/components/admin/ImportClientsWizard";

export const dynamic = "force-dynamic";

export default function ImporterClientsPage() {
  return (
    <div className="flex flex-col gap-5">
      <Breadcrumbs items={[{ label: "Clients", href: "/admin/clients" }, { label: "Importer" }]} />
      <header>
        <h1 className="text-h1 font-semibold tracking-tight text-text">Importer des clients</h1>
        <p className="text-body-sm text-muted">
          Chargez votre fichier Excel, vérifiez l&apos;aperçu, puis validez. Les clients déjà présents sont écartés.
        </p>
      </header>
      <ImportClientsWizard />
    </div>
  );
}

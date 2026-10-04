import { Breadcrumbs } from "@/components/admin/Breadcrumbs";
import { BonLivraisonForm } from "@/components/admin/BonLivraisonForm";

export default function NouveauBonLivraisonPage() {
  return (
    <div className="flex flex-col gap-6 pb-8">
      <Breadcrumbs items={[{ label: "Bons de livraison", href: "/admin/bons-livraison" }, { label: "Nouveau" }]} />
      <BonLivraisonForm />
    </div>
  );
}

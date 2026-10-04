"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { RecouvrementForm, type CreditEligibleRecouvrement } from "@/components/admin/RecouvrementForm";

export function NewRecouvrementButton({
  credits,
  creditPreselectionne,
  label = "+ Enregistrer un recouvrement",
}: {
  credits: CreditEligibleRecouvrement[];
  creditPreselectionne?: string;
  label?: string;
}) {
  const [ouvert, setOuvert] = useState(false);

  return (
    <>
      <Button onClick={() => setOuvert(true)}>{label}</Button>
      <Modal open={ouvert} onClose={() => setOuvert(false)} title="Recouvrement — caisse du soir">
        <RecouvrementForm
          credits={credits}
          creditPreselectionne={creditPreselectionne}
          onSuccess={() => setOuvert(false)}
        />
      </Modal>
    </>
  );
}

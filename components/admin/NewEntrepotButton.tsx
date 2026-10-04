"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { EntrepotForm } from "@/components/admin/EntrepotForm";

export function NewEntrepotButton() {
  const [ouvert, setOuvert] = useState(false);

  return (
    <>
      <Button onClick={() => setOuvert(true)}>+ Nouvel entrepôt</Button>
      <Modal open={ouvert} onClose={() => setOuvert(false)} title="Nouvel entrepôt">
        <EntrepotForm onSuccess={() => setOuvert(false)} />
      </Modal>
    </>
  );
}

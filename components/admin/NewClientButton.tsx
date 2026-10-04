"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ClientForm } from "@/components/admin/ClientForm";

export function NewClientButton() {
  const [ouvert, setOuvert] = useState(false);
  const router = useRouter();

  return (
    <>
      <Button onClick={() => setOuvert(true)}>+ Nouveau client</Button>
      <Modal open={ouvert} onClose={() => setOuvert(false)} title="Nouveau client">
        <ClientForm
          onSuccess={(client) => {
            setOuvert(false);
            router.push(`/admin/clients/${client.id}`);
          }}
        />
      </Modal>
    </>
  );
}

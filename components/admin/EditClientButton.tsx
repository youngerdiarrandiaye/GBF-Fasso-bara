"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ClientForm } from "@/components/admin/ClientForm";
import type { ClientRow } from "@/lib/supabase/database.types";

export function EditClientButton({ client }: { client: ClientRow }) {
  const [ouvert, setOuvert] = useState(false);

  return (
    <>
      <Button variant="outline" onClick={() => setOuvert(true)}>
        Modifier la fiche
      </Button>
      <Modal open={ouvert} onClose={() => setOuvert(false)} title="Modifier le client">
        <ClientForm client={client} onSuccess={() => setOuvert(false)} />
      </Modal>
    </>
  );
}

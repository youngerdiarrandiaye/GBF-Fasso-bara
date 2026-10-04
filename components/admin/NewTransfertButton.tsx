"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { TransfertForm } from "@/components/admin/TransfertForm";
import type { EntrepotRow } from "@/lib/supabase/database.types";
import type { ProduitSimpleOption } from "@/components/admin/ProduitSimpleSelect";

export function NewTransfertButton({
  entrepots,
  produits,
  stockParProduit,
}: {
  entrepots: EntrepotRow[];
  produits: ProduitSimpleOption[];
  stockParProduit: Record<string, Record<string, number>>;
}) {
  const [ouvert, setOuvert] = useState(false);

  return (
    <>
      <Button onClick={() => setOuvert(true)}>+ Nouvelle demande de transfert</Button>
      <Modal open={ouvert} onClose={() => setOuvert(false)} title="Nouvelle demande de transfert">
        <TransfertForm
          entrepots={entrepots}
          produits={produits}
          stockParProduit={stockParProduit}
          onSuccess={() => setOuvert(false)}
        />
      </Modal>
    </>
  );
}

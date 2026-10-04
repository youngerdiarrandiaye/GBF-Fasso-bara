"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { PaymentModal } from "@/components/admin/PaymentModal";

export function RegisterPaymentButton({
  factureId,
  factureNumero,
  resteAPayer,
  sticky = false,
}: {
  factureId: string;
  factureNumero: string;
  resteAPayer: number;
  sticky?: boolean;
}) {
  const [ouvert, setOuvert] = useState(false);

  return (
    <>
      <Button
        onClick={() => setOuvert(true)}
        size={sticky ? "lg" : "md"}
        className={sticky ? "fixed bottom-6 right-6 z-sticky shadow-lg" : undefined}
      >
        Enregistrer un paiement
      </Button>
      <PaymentModal
        factureId={factureId}
        factureNumero={factureNumero}
        resteAPayer={resteAPayer}
        open={ouvert}
        onClose={() => setOuvert(false)}
      />
    </>
  );
}

"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

export interface OptionsConfirmation {
  titre: string;
  /** La conséquence de l'action, en une phrase. */
  message: string;
  /** Libellé du bouton de validation (« Annuler la facture », « Envoyer »…). */
  libelleConfirmer: string;
  libelleAnnuler?: string;
  /** Action à conséquence difficile à défaire : bouton rouge. */
  destructif?: boolean;
}

type Confirmer = (options: OptionsConfirmation) => Promise<boolean>;

const ConfirmContext = createContext<Confirmer | null>(null);

/**
 * Service de confirmation unique : `const confirmer = useConfirm()` puis
 * `if (!(await confirmer({ titre, message, libelleConfirmer }))) return;`.
 * Remplace `window.confirm` (non stylé, non thématisé, illisible sur mobile) ;
 * une seule fenêtre à la fois, fermée par Échap, le fond ou « Annuler ».
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<OptionsConfirmation | null>(null);
  const resolveRef = useRef<((ok: boolean) => void) | null>(null);

  const confirmer = useCallback<Confirmer>((opts) => {
    // Une demande déjà ouverte est considérée comme refusée.
    resolveRef.current?.(false);
    setOptions(opts);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  const repondre = useCallback((ok: boolean) => {
    resolveRef.current?.(ok);
    resolveRef.current = null;
    setOptions(null);
  }, []);

  return (
    <ConfirmContext.Provider value={confirmer}>
      {children}
      <Modal open={options !== null} onClose={() => repondre(false)} title={options?.titre ?? ""}>
        <p className="text-body text-muted">{options?.message}</p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => repondre(false)}>{options?.libelleAnnuler ?? "Annuler"}</Button>
          <Button variant={options?.destructif ? "destructive" : "primary"} onClick={() => repondre(true)}>
            {options?.libelleConfirmer}
          </Button>
        </div>
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): Confirmer {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm doit être utilisé dans un ConfirmProvider");
  return ctx;
}

"use client";

import type { ReactNode } from "react";

/**
 * Enveloppe une cellule contenant un bouton d'action (ex. "Enregistrer un
 * paiement") pour empêcher le clic dessus de déclencher aussi la navigation
 * de la `ClickableTableRow` parente. Doit être un Client Component distinct
 * (et non un simple `<div onClick={...}>` inline dans une page Server
 * Component) : les gestionnaires d'événements DOM ne peuvent être créés que
 * dans un composant client.
 */
export function StopClickPropagation({ children }: { children: ReactNode }) {
  return <div onClick={(e) => e.stopPropagation()}>{children}</div>;
}

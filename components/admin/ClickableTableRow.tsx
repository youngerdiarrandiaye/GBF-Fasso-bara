"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Ligne de tableau cliquable (navigation vers la fiche détail au clic sur la
 * ligne entière). Ne casse pas les éléments interactifs déjà présents à
 * l'intérieur (boutons d'action, liens) : pour toute cellule contenant un
 * bouton d'action (ex. "Enregistrer un paiement", menu d'actions), enveloppez
 * SEULEMENT cette cellule dans `<StopClickPropagation>` (voir
 * `components/admin/StopClickPropagation.tsx`) pour empêcher la navigation
 * de ligne de se déclencher au clic dessus.
 */
export function ClickableTableRow({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  const router = useRouter();

  return (
    <tr onClick={() => router.push(href)} className={cn("cursor-pointer", className)}>
      {children}
    </tr>
  );
}

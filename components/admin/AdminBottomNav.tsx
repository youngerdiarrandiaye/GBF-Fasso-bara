"use client";

import { MobileBottomNav } from "@/components/ui/MobileBottomNav";
import { ThemePicker } from "@/components/admin/ThemePicker";
import { ACTION_PRINCIPALE, GROUPES, ONGLETS_BAS } from "@/components/admin/adminNav";

/**
 * Navigation Admin < lg : barre basse (3 onglets, « + » central, « Plus »)
 * et feuille « Plus » — voir MobileBottomNav. ≥ lg, la Sidebar prend le
 * relais. Masquée pendant la saisie d'une facture, dont le formulaire a sa
 * propre barre de pied.
 */
export function AdminBottomNav() {
  return (
    <MobileBottomNav
      onglets={ONGLETS_BAS}
      action={ACTION_PRINCIPALE}
      libelleAction="Créer une facture"
      groupes={GROUPES}
      libelleRubriques="Rubriques Admin"
      masquerSur="/admin/nouvelle-facture"
      pied={<ThemePicker />}
    />
  );
}

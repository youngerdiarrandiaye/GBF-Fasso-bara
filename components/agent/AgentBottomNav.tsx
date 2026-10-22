"use client";

import {
  faHouse,
  faFileLines,
  faFileCirclePlus,
  faUsers,
  faTruck,
  faTruckRampBox,
} from "@fortawesome/free-solid-svg-icons";
import { MobileBottomNav, type GroupeNav, type LienNav } from "@/components/ui/MobileBottomNav";
import { ThemePicker } from "@/components/admin/ThemePicker";
import { SignOutButton } from "@/components/agent/SignOutButton";

const ACCUEIL: LienNav = { href: "/", label: "Accueil", icon: faHouse, exact: true };
const FACTURES: LienNav = { href: "/mes-factures", label: "Factures", icon: faFileLines };
const CLIENTS: LienNav = { href: "/clients", label: "Clients", icon: faUsers };
const NOUVELLE_FACTURE: LienNav = { href: "/nouvelle-facture", label: "Créer", icon: faFileCirclePlus };

const GROUPES: GroupeNav[] = [
  {
    label: "MENU",
    liens: [
      ACCUEIL,
      { href: "/mes-factures", label: "Mes factures", icon: faFileLines },
      CLIENTS,
      { href: "/bons-livraison", label: "Bons de livraison", icon: faTruck },
    ],
  },
  {
    label: "ACTIONS",
    liens: [
      { href: "/nouvelle-facture", label: "Nouvelle facture", icon: faFileCirclePlus },
      { href: "/bons-livraison/nouveau", label: "Nouvelle livraison", icon: faTruckRampBox },
    ],
  },
];

/**
 * Navigation Agent < lg : barre basse (Accueil, Factures, « + » Créer,
 * Clients, « Plus ») et feuille « Plus » (livraisons, thème, déconnexion) —
 * voir MobileBottomNav. Masquée pendant la saisie d'une facture, dont le
 * formulaire a sa propre barre de pied.
 */
export function AgentBottomNav({ nom }: { nom: string }) {
  return (
    <MobileBottomNav
      onglets={[ACCUEIL, FACTURES, CLIENTS]}
      action={NOUVELLE_FACTURE}
      libelleAction="Créer une facture"
      groupes={GROUPES}
      libelleRubriques="Rubriques Agent"
      masquerSur="/nouvelle-facture"
      pied={
        <div className="flex flex-col gap-2">
          <p className="truncate px-1 text-body-sm text-muted">Connecté : <span className="font-medium text-text">{nom}</span></p>
          <ThemePicker />
          <SignOutButton className="w-full justify-start" />
        </div>
      }
    />
  );
}

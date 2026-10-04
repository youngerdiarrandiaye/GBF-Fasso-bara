/**
 * Écrans d'authentification (connexion, mot de passe oublié, nouveau mot de
 * passe) — direction « Comptoir » (D-25) : carte blanche centrée sur le fond
 * clair, mêmes tokens que l'Espace Agent.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-theme="agent"
      className="flex min-h-screen flex-col items-center justify-center bg-bg px-4 py-12"
    >
      <div className="w-full max-w-sm rounded-modal border border-border bg-surface p-6 shadow-sm sm:p-8">
        {children}
      </div>
    </div>
  );
}

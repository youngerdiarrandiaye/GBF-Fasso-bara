/**
 * Écrans d'authentification (connexion, mot de passe oublié, nouveau mot de
 * passe) — direction « Comptoir » (D-25) : carte blanche centrée sur le fond
 * clair, mêmes tokens que l'Espace Agent.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-theme="agent"
      className="min-h-screen bg-bg px-4 py-6 sm:px-8 sm:py-10 lg:flex lg:items-center lg:justify-center"
    >
      <div className="mx-auto grid w-full max-w-6xl overflow-hidden rounded-modal border border-border bg-surface shadow-sm lg:min-h-[680px] lg:grid-cols-2">
        <aside className="relative flex flex-col justify-between overflow-hidden bg-green-dk p-6 text-white sm:p-10 lg:p-12">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-card border border-white/30 text-body font-bold">GFB</span>
            <div>
              <p className="font-semibold tracking-wide">GIE FASSO BARA</p>
              <p className="text-body-sm text-white/80">Votre espace de gestion</p>
            </div>
          </div>
          <div className="my-8 hidden max-w-md sm:block lg:my-16">
            <p className="mb-4 text-body-sm font-medium uppercase tracking-widest text-white/80">Au service de votre activité</p>
            <h2 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl lg:text-5xl">Votre entreprise.<br />Tout simplement.</h2>
            <p className="mt-5 hidden text-body leading-relaxed text-white/80 sm:block">Retrouvez vos produits, suivez vos stocks et gérez vos factures dans un même espace.</p>
          </div>
          <div className="hidden grid-cols-3 gap-4 border-t border-white/20 pt-6 text-body-sm sm:grid">
            <span>Produits</span><span>Stocks</span><span>Facturation</span>
          </div>
        </aside>
        <main className="flex items-center justify-center px-6 py-9 sm:px-10 sm:py-12 lg:px-12">
          <div className="w-full max-w-sm">{children}</div>
        </main>
      </div>
    </div>
  );
}

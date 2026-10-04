import Image from "next/image";

const TAILLES = {
  sm: "h-9 w-9",
  md: "h-12 w-12",
  lg: "h-[72px] w-[72px]",
} as const;

const TAILLES_PX: Record<keyof typeof TAILLES, number> = { sm: 36, md: 48, lg: 72 };

/**
 * Marque entreprise réutilisable (logo réel si `entreprise_config.logo_url`
 * est renseigné, sinon initiales dérivées de `nom` — jamais de texte codé en
 * dur type "GFB", qui masquait la véritable identité configurée par
 * l'admin). Même traitement visuel que celui déjà utilisé dans le bloc
 * en-tête entreprise de la facture Admin (rounded-input, object-contain).
 */
export function CompanyBrandMark({
  nom,
  logoUrl,
  size = "md",
}: {
  nom: string;
  logoUrl: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const classeTaille = TAILLES[size];

  if (logoUrl) {
    // L'optimiseur d'images Next.js refuse de traiter une URL dont l'hôte se
    // résout vers une IP privée/loopback (protection anti-SSRF), ce qui
    // bloque systématiquement le logo servi par le Supabase local
    // (127.0.0.1:54321) — sans effet en production, où logo_url pointe vers
    // le domaine *.supabase.co réel. `unoptimized` contourne uniquement ce
    // cas précis (petite image déjà compressée, aucun bénéfice à optimiser).
    const estHoteLocal = /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(logoUrl);
    return (
      <Image
        src={logoUrl}
        alt={nom}
        width={TAILLES_PX[size]}
        height={TAILLES_PX[size]}
        unoptimized={estHoteLocal}
        className={`${classeTaille} rounded-input object-contain`}
      />
    );
  }

  const initiales = nom
    .split(" ")
    .map((mot) => mot[0])
    .filter(Boolean)
    .slice(0, 3)
    .join("")
    .toUpperCase();

  return (
    <span
      className={`flex ${classeTaille} shrink-0 items-center justify-center rounded-input bg-green-dk text-body-sm font-bold text-white`}
      aria-hidden="true"
    >
      {initiales || "?"}
    </span>
  );
}

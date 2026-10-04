import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { NouveauMotDePasseForm } from "./NouveauMotDePasseForm";

export const dynamic = "force-dynamic";

export default async function ReinitialiserMotDePassePage({
  searchParams,
}: {
  searchParams: Promise<{ lien?: string }>;
}) {
  const { lien } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-h1 text-text">Nouveau mot de passe</h1>
        {user && <p className="text-body text-muted">{user.email}</p>}
      </div>
      {user && lien !== "invalide" ? (
        <NouveauMotDePasseForm />
      ) : (
        <>
          <InlineAlert tone="red">
            Ce lien de réinitialisation est invalide ou a expiré. Demandez-en un nouveau.
          </InlineAlert>
          <Link href="/mot-de-passe-oublie" className="text-center text-body text-muted underline">
            Demander un nouveau lien
          </Link>
        </>
      )}
    </div>
  );
}

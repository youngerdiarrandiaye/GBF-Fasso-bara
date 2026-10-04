"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { redimensionnerImage } from "@/lib/redimensionnerImage";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

/**
 * Upload du logo entreprise — docs/design-system.md §6.14 (adapté à un
 * fichier unique). Écrit directement dans le bucket public `logo`
 * (supabase/migrations/0001_schema_initial.sql section 15), dont l'écriture
 * est réservée à l'admin par policy RLS Storage (`logo_ecriture_admin`) — un
 * agent qui appellerait ce composant se ferait refuser l'upload par
 * Storage/RLS, pas seulement par l'absence de ce composant côté UI.
 */
export function LogoUploader({
  logoUrl,
  onChange,
}: {
  logoUrl: string;
  onChange: (url: string) => void;
}) {
  const { showToast } = useToast();
  const [enCours, setEnCours] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(fichier: File) {
    setEnCours(true);
    const supabase = createClient();
    const chemin = `entreprise/logo-${Date.now()}.png`;
    const image = await redimensionnerImage(fichier, 400);

    const { error } = await supabase.storage.from("logo").upload(chemin, image, {
      upsert: true,
      contentType: "image/png",
    });

    if (error) {
      setEnCours(false);
      showToast("Impossible d'importer ce logo.", "error");
      return;
    }

    const { data } = supabase.storage.from("logo").getPublicUrl(chemin);
    setEnCours(false);
    onChange(data.publicUrl);
    showToast("Logo mis à jour.", "success");
  }

  return (
    <div className="flex items-center gap-4">
      {logoUrl ? (
        <Image
          src={logoUrl}
          alt="Logo entreprise"
          width={64}
          height={64}
          className="rounded-input border border-border object-contain"
        />
      ) : (
        <div className="flex h-16 w-16 items-center justify-center rounded-input border border-dashed border-border text-caption text-muted">
          Logo
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const fichier = e.target.files?.[0];
          if (fichier) handleFile(fichier);
        }}
      />
      <Button type="button" variant="outline" size="sm" loading={enCours} onClick={() => inputRef.current?.click()}>
        Importer un logo
      </Button>
    </div>
  );
}

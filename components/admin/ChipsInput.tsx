"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Champ "chips" — docs/design-system.md §6.2 : tags rounded-input
 * supprimables (icône ×) + input d'ajout en fin de liste, Enter ou virgule
 * pour valider un tag. Utilisé pour adresses/téléphones/activités multiples
 * (entreprise_config), champs tableau (text[]) côté base.
 */
export function ChipsInput({
  label,
  values,
  onChange,
  placeholder,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
}) {
  const [saisie, setSaisie] = useState("");

  function ajouter() {
    const valeur = saisie.trim();
    if (!valeur) return;
    if (!values.includes(valeur)) {
      onChange([...values, valeur]);
    }
    setSaisie("");
  }

  function supprimer(index: number) {
    onChange(values.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-body font-medium text-text">{label}</label>
      <div
        className={cn(
          "focus-within:ring-2 flex min-h-tap w-full flex-wrap items-center gap-2 rounded-input border border-border bg-surface px-2 py-1.5"
        )}
      >
        {values.map((valeur, index) => (
          <span
            key={`${valeur}-${index}`}
            className="badge-pastel-neutral inline-flex items-center gap-1.5 rounded-input px-2 py-1 text-body-sm"
          >
            {valeur}
            <button
              type="button"
              onClick={() => supprimer(index)}
              className="focus-ring text-muted hover:text-red-text"
              aria-label={`Supprimer ${valeur}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          type="text"
          value={saisie}
          onChange={(e) => setSaisie(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              ajouter();
            }
          }}
          onBlur={ajouter}
          placeholder={values.length === 0 ? placeholder : "Ajouter..."}
          className="min-w-[140px] flex-1 border-0 bg-transparent px-1 py-1 text-body text-text outline-none placeholder:text-muted"
        />
      </div>
    </div>
  );
}

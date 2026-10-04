"use client";

import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

/**
 * Input texte — docs/design-system.md §6.2. Label toujours au-dessus (jamais
 * en placeholder seul), bordure rouge + message sous le champ en cas
 * d'erreur, anneau vert au focus.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, label, error, hint, id, ...props },
  ref
) {
  const inputId = id ?? props.name;
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-body font-medium text-text">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        className={cn(
          "focus-ring h-11 w-full rounded-input border bg-surface px-3 text-body text-text transition-colors",
          "placeholder:text-muted",
          error ? "border-red" : "border-border hover:border-muted",
          "disabled:bg-surface-2 disabled:text-muted",
          className
        )}
        aria-invalid={!!error}
        aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
        {...props}
      />
      {error && (
        <p id={`${inputId}-error`} className="text-body-sm text-red-text">
          {error}
        </p>
      )}
      {!error && hint && (
        <p id={`${inputId}-hint`} className="text-body-sm text-muted">
          {hint}
        </p>
      )}
    </div>
  );
});

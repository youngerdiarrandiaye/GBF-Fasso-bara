"use client";

import { forwardRef, useId } from "react";
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
  { className, label, error, hint, id, "aria-describedby": describedBy, "aria-invalid": ariaInvalid, ...props },
  ref
) {
  const generatedId = useId();
  const inputId = id ?? props.name ?? generatedId;
  const description = [describedBy, error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined].filter(Boolean).join(" ") || undefined;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-body font-medium text-text">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        className={cn(
          "focus-ring h-11 min-w-0 w-full rounded-input border bg-surface px-3 text-body text-text transition-colors",
          "placeholder:text-muted",
          error ? "border-red" : "border-border hover:border-muted",
          "disabled:bg-surface-2 disabled:text-muted",
          className
        )}
        aria-invalid={error ? true : ariaInvalid}
        aria-describedby={description}
        {...props}
      />
      {error && (
        <p id={`${inputId}-error`} className="break-words text-body-sm text-red-text">
          {error}
        </p>
      )}
      {!error && hint && (
        <p id={`${inputId}-hint`} className="break-words text-body-sm text-muted">
          {hint}
        </p>
      )}
    </div>
  );
});

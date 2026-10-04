"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Modal — docs/design-system.md §6.6 : rounded-2xl, overlay rgba(0,0,0,0.5),
 * fermeture Esc / clic overlay / bouton ×, entrée fade+scale 200ms.
 */
export function Modal({ open, onClose, title, children, className }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const elementActif = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflowInitial = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const dialog = dialogRef.current;
    const focusables = dialog?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    (focusables?.[0] ?? dialog)?.focus();

    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key !== "Tab" || !dialogRef.current) return;

      const elements = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      if (elements.length === 0) {
        e.preventDefault();
        dialogRef.current.focus();
        return;
      }

      const premier = elements[0];
      const dernier = elements[elements.length - 1];
      if (e.shiftKey && document.activeElement === premier) {
        e.preventDefault();
        dernier.focus();
      } else if (!e.shiftKey && document.activeElement === dernier) {
        e.preventDefault();
        premier.focus();
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = overflowInitial;
      elementActif?.focus();
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-modal-overlay flex items-end justify-center sm:items-center sm:p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          "relative z-modal max-h-[92dvh] w-full max-w-lg overflow-y-auto animate-[modal-in_200ms_var(--ease-standard)] rounded-t-modal border border-border bg-surface p-4 shadow-lg sm:rounded-modal sm:p-6",
          className
        )}
      >
        <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
          <h2 id={titleId} className="text-h2 text-text">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="focus-ring tap-target flex items-center justify-center rounded-input text-h3 text-muted hover:bg-surface-2"
            aria-label="Fermer"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

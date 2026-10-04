"use client";

import Link, { useLinkStatus } from "next/link";
import type { ComponentProps } from "react";

function PendingIndicator() {
  const { pending } = useLinkStatus();
  return pending ? <span role="status" className="ml-1 inline-flex"><span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none" /><span className="sr-only">Chargement de la page…</span></span> : null;
}

export function NavigationLink({ children, ...props }: ComponentProps<typeof Link>) {
  return <Link {...props}>{children}<PendingIndicator /></Link>;
}

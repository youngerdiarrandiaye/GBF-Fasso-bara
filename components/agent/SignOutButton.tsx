"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/cn";

export function SignOutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleSignOut() {
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={loading}
      className={cn(
        "focus-ring tap-target flex items-center gap-2 rounded-input px-3 text-body text-red-text hover:bg-red/10 disabled:opacity-40",
        className
      )}
    >
      {loading ? "Déconnexion..." : "Se déconnecter"}
    </button>
  );
}

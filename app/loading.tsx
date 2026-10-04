import { LoadingStatus } from "@/components/ui/LoadingStatus";

export default function Loading() {
  return <div className="flex min-h-screen items-center justify-center bg-bg"><LoadingStatus label="Ouverture de votre espace…" /></div>;
}

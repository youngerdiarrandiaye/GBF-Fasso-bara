import { LoadingStatus } from "@/components/ui/LoadingStatus";
import { Skeleton } from "@/components/ui/Skeleton";

export default function AgentLoading() {
  return (
    <div className="flex flex-col gap-4" role="status" aria-label="Chargement de la page">
      <Skeleton className="h-7 w-48" />
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-24 rounded-card" />
        <Skeleton className="h-24 rounded-card" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-20 rounded-card" />
        ))}
      </div>
      <LoadingStatus label="Chargement de vos données…" />
    </div>
  );
}

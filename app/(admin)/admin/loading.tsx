import { LoadingStatus } from "@/components/ui/LoadingStatus";
import { Skeleton } from "@/components/ui/Skeleton";

export default function AdminLoading() {
  return (
    <div className="flex flex-col gap-4" role="status" aria-label="Chargement de la page">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-52" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="h-11 w-36" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-28 rounded-card" />
        ))}
      </div>
      <Skeleton className="h-80 rounded-card" />
      <LoadingStatus label="Chargement de vos données…" />
    </div>
  );
}

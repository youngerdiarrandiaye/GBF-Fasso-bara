export function LoadingStatus({ label = "Chargement en cours…" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-2 text-body-sm text-muted">
      <span aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none" />
      <span>{label}</span>
    </div>
  );
}

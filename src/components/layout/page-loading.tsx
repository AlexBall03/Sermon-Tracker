/** Placeholder for an application page while its data loads. */
export function PageLoading() {
  return (
    <div className="container-page py-12" role="status" aria-live="polite">
      <span className="sr-only">Loading</span>
      <div className="h-9 w-56 animate-pulse rounded-lg bg-muted" />
      <div className="mt-4 h-5 w-80 max-w-full animate-pulse rounded-md bg-muted" />
      <div className="mt-10 h-40 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}

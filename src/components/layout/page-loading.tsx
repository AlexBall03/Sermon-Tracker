/** Placeholder for an application page while its data loads. */
export function PageLoading() {
  return (
    <div className="container-page py-10 lg:py-12" role="status" aria-live="polite">
      <span className="sr-only">Loading</span>
      <div className="border-b pb-6">
        <div className="h-10 w-64 max-w-full animate-pulse rounded-lg bg-secondary" />
        <div className="mt-3 h-5 w-80 max-w-full animate-pulse rounded-md bg-secondary" />
      </div>
      <div className="mt-8 h-40 animate-pulse rounded-xl bg-secondary" />
    </div>
  );
}

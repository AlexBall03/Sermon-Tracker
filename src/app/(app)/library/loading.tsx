/** The library's outline while the ideas are read. */
export default function LibraryLoading() {
  return (
    <div className="container-page py-10 lg:py-12" role="status" aria-live="polite">
      <span className="sr-only">Loading your library</span>
      <div className="border-b pb-6">
        <div className="h-10 w-36 animate-pulse rounded-lg bg-secondary" />
        <div className="mt-3 h-5 w-96 max-w-full animate-pulse rounded-md bg-secondary" />
      </div>
      <div className="mt-6 h-5 w-56 max-w-full animate-pulse rounded-md bg-secondary" />
      <div className="mt-4 grid gap-3">
        {[0, 1, 2].map((row) => (
          <div key={row} className="h-28 animate-pulse rounded-xl bg-secondary" />
        ))}
      </div>
    </div>
  );
}

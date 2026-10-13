/**
 * The library's outline while it is read: the header, then a few blocks. It
 * stands for the overview and for an idea's page; each section has its own.
 */
export default function LibraryLoading() {
  return (
    <div className="container-page py-10 lg:py-12" role="status" aria-live="polite">
      <span className="sr-only">Loading your library</span>
      <div className="border-b pb-6">
        <div className="h-10 w-36 animate-pulse rounded-lg bg-secondary" />
        <div className="mt-3 h-5 w-96 max-w-full animate-pulse rounded-md bg-secondary" />
      </div>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((card) => (
          <div key={card} className="h-24 animate-pulse rounded-xl bg-secondary md:h-40" />
        ))}
      </div>
    </div>
  );
}

/** The library's outline while the ideas are read: header, search and toolbar, then results. */
export default function LibraryLoading() {
  return (
    <div className="container-page py-10 lg:py-12" role="status" aria-live="polite">
      <span className="sr-only">Loading your library</span>
      <div className="border-b pb-6">
        <div className="h-10 w-36 animate-pulse rounded-lg bg-secondary" />
        <div className="mt-3 h-5 w-96 max-w-full animate-pulse rounded-md bg-secondary" />
      </div>
      <div className="mt-6 flex flex-col gap-3 lg:flex-row">
        <div className="h-11 animate-pulse rounded-lg bg-secondary lg:flex-1" />
        <div className="h-10 animate-pulse rounded-lg bg-secondary lg:w-[30rem]" />
      </div>
      <div className="mt-5 h-5 w-40 max-w-full animate-pulse rounded-md bg-secondary" />
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((card) => (
          <div key={card} className="h-40 animate-pulse rounded-xl bg-secondary" />
        ))}
      </div>
    </div>
  );
}

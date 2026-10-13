/** An outline while it is read: the header, then a few rows. */
export default function OutlineLoading() {
  return (
    <div className="container-page py-10 lg:py-12" role="status" aria-live="polite">
      <span className="sr-only">Loading the outline</span>
      <div className="border-b pb-6">
        <div className="h-10 w-40 animate-pulse rounded-lg bg-secondary" />
        <div className="mt-3 h-5 w-72 max-w-full animate-pulse rounded-md bg-secondary" />
      </div>
      <div className="mt-6 max-w-4xl space-y-3">
        {[0, 1, 2, 3].map((row) => (
          <div key={row} className="h-9 animate-pulse rounded-lg bg-secondary" />
        ))}
      </div>
    </div>
  );
}

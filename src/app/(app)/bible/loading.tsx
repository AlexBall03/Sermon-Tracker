/** The reader's outline while the page is prepared: the chapter bar, then lines of text. */
export default function BibleLoading() {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Opening the Bible</span>
      <div className="border-b">
        <div className="mx-auto flex h-14 max-w-[46rem] items-center justify-center px-5">
          <div className="h-6 w-40 animate-pulse rounded-md bg-secondary" />
        </div>
      </div>
      <div className="mx-auto max-w-[46rem] space-y-3 px-5 py-8">
        {[100, 94, 88, 100, 72, 96, 90, 64, 100, 84].map((width, line) => (
          <div
            key={line}
            className="h-4 animate-pulse rounded-md bg-secondary"
            style={{ width: `${width}%` }}
          />
        ))}
      </div>
    </div>
  );
}

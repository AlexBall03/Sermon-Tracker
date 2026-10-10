/** The administration page's outline while accounts and invitations are read. */
export default function AdminLoading() {
  return (
    <div className="container-page py-10 lg:py-12" role="status" aria-live="polite">
      <span className="sr-only">Loading people and access</span>
      <div className="border-b pb-6">
        <div className="h-10 w-72 max-w-full animate-pulse rounded-lg bg-secondary" />
        <div className="mt-3 h-5 w-96 max-w-full animate-pulse rounded-md bg-secondary" />
      </div>
      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((cell) => (
          <div key={cell} className="h-22 animate-pulse rounded-xl bg-secondary" />
        ))}
      </div>
      <div className="mt-10 h-64 animate-pulse rounded-xl bg-secondary" />
      <div className="mt-10 h-40 animate-pulse rounded-xl bg-secondary" />
    </div>
  );
}

/** The dashboard's outline while the account and name are read. */
export default function DashboardLoading() {
  return (
    <div className="container-page py-10 lg:py-12" role="status" aria-live="polite">
      <span className="sr-only">Loading your dashboard</span>
      <div className="border-b pb-6">
        <div className="h-10 w-72 max-w-full animate-pulse rounded-lg bg-secondary" />
        <div className="mt-3 h-5 w-96 max-w-full animate-pulse rounded-md bg-secondary" />
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="h-48 animate-pulse rounded-xl bg-secondary lg:col-span-2" />
        <div className="grid content-start gap-4">
          <div className="h-22 animate-pulse rounded-xl bg-secondary" />
        </div>
      </div>
      <div className="mt-12 h-40 animate-pulse rounded-xl bg-secondary lg:mt-14" />
    </div>
  );
}

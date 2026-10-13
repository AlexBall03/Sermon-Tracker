/** The dashboard's outline while the account and name are read. */
export default function DashboardLoading() {
  return (
    <div className="container-page py-10 lg:py-12" role="status" aria-live="polite">
      <span className="sr-only">Loading your dashboard</span>
      <div className="border-b pb-6">
        <div className="h-10 w-72 max-w-full animate-pulse rounded-lg bg-secondary" />
        <div className="mt-3 h-5 w-96 max-w-full animate-pulse rounded-md bg-secondary" />
      </div>
      <div className="mt-8 grid gap-x-6 gap-y-10 lg:grid-cols-3">
        <div className="h-64 animate-pulse rounded-xl bg-secondary lg:col-span-2" />
        <div className="h-64 animate-pulse rounded-xl bg-secondary" />
      </div>
    </div>
  );
}

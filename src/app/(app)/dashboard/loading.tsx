/** The dashboard's outline while the account, its work, and its name are read: the header, two rows of two, the figures. */
export default function DashboardLoading() {
  return (
    <div className="container-page py-10 lg:py-12" role="status" aria-live="polite">
      <span className="sr-only">Loading your dashboard</span>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 border-b pb-6">
        <div className="min-w-0 flex-1 basis-80">
          <div className="h-10 w-72 max-w-full animate-pulse rounded-lg bg-secondary" />
          <div className="mt-3 h-5 w-96 max-w-full animate-pulse rounded-md bg-secondary" />
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="h-10 w-44 animate-pulse rounded-lg bg-secondary" />
          <div className="h-10 w-40 animate-pulse rounded-lg bg-secondary" />
          <div className="h-10 w-40 animate-pulse rounded-lg bg-secondary max-md:hidden" />
        </div>
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="h-64 animate-pulse rounded-xl bg-secondary lg:col-span-2" />
        <div className="h-64 animate-pulse rounded-xl bg-secondary" />
        <div className="h-72 animate-pulse rounded-xl bg-secondary lg:col-span-2" />
        <div className="h-72 animate-pulse rounded-xl bg-secondary" />
      </div>
      <div className="mt-10 h-6 w-32 animate-pulse rounded-md bg-secondary" />
      <div className="mt-4 h-20 animate-pulse rounded-xl bg-secondary" />
    </div>
  );
}

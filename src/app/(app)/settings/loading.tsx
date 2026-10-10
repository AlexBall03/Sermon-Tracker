/** The settings outline while the account is checked. */
export default function SettingsLoading() {
  return (
    <div className="container-page py-10 lg:py-12" role="status" aria-live="polite">
      <span className="sr-only">Loading your settings</span>
      <div className="border-b pb-6">
        <div className="h-10 w-44 animate-pulse rounded-lg bg-secondary" />
        <div className="mt-3 h-5 w-96 max-w-full animate-pulse rounded-md bg-secondary" />
      </div>
      {[0, 1].map((row) => (
        <div
          key={row}
          className="grid gap-x-12 gap-y-6 border-b py-9 lg:grid-cols-[15rem_minmax(0,1fr)] lg:py-10"
        >
          <div className="h-6 w-28 animate-pulse rounded-md bg-secondary" />
          <div className="h-40 max-w-2xl animate-pulse rounded-xl bg-secondary" />
        </div>
      ))}
    </div>
  );
}

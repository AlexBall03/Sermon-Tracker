/** A settings page's outline while the account is checked; the sidebar beside it stays. */
export default function SettingsLoading() {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Loading your settings</span>
      <div className="mb-8">
        <div className="h-9 w-48 animate-pulse rounded-lg bg-secondary" />
        <div className="mt-3 h-5 w-96 max-w-full animate-pulse rounded-md bg-secondary" />
      </div>
      <div className="max-w-2xl space-y-5">
        {[0, 1].map((row) => (
          <div key={row} className="h-44 animate-pulse rounded-xl bg-secondary" />
        ))}
      </div>
    </div>
  );
}

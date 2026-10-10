export type Stat = {
  label: string;
  /** The figure. Null means it could not be loaded; it is never shown as zero. */
  value?: number | null;
  /** Shown instead of a figure when the measure does not exist yet. */
  pending?: string;
};

/**
 * Summary figures as one divided strip rather than separate cards: two
 * columns, four from `lg`. A stat without data says so in words.
 */
export function StatStrip({ stats, className }: { stats: Stat[]; className?: string }) {
  return (
    <dl
      className={`grid grid-cols-2 rounded-xl border bg-surface shadow-card lg:grid-cols-4 ${className ?? ""}`}
    >
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="px-5 py-4 even:border-l nth-[n+3]:border-t lg:not-first:border-l lg:nth-[n+3]:border-t-0"
        >
          <dt className="text-[0.8125rem] font-medium text-muted-foreground">{stat.label}</dt>
          {stat.pending ? (
            <dd className="mt-1.5 text-sm leading-relaxed">{stat.pending}</dd>
          ) : (
            <dd className="mt-1.5 text-[1.75rem] leading-none font-semibold tracking-[-0.02em] tabular-nums">
              {stat.value ?? (
                <span className="text-sm font-medium tracking-normal text-muted-foreground">
                  Unavailable
                </span>
              )}
            </dd>
          )}
        </div>
      ))}
    </dl>
  );
}

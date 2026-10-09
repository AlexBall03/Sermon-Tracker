import { sampleIdeas } from "./sample-ideas";

const filters = ["All ideas", "Sermons", "Points", "Undecided"];

/** Static illustration of the planned library. Nothing here is interactive. */
export function AppPreview() {
  return (
    <section
      id="preview"
      aria-labelledby="preview-heading"
      className="mx-auto grid max-w-6xl scroll-mt-24 items-start gap-10 px-5 py-20 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-14"
    >
      <div className="lg:sticky lg:top-28">
        <p className="text-xs font-semibold tracking-[0.24em] text-primary uppercase">
          In development
        </p>
        <h2
          id="preview-heading"
          className="mt-4 font-display text-3xl leading-tight font-semibold tracking-tight sm:text-4xl"
        >
          One library for every idea
        </h2>
        <p className="mt-5 leading-relaxed text-muted-foreground">
          Sermon ideas, reusable points, and thoughts you have not classified yet will live
          together, so nothing is lost between separate lists. This is an idea tracker, not a
          manuscript editor.
        </p>
      </div>

      <figure>
        <div className="overflow-hidden rounded-2xl border bg-card shadow-xl shadow-black/5">
          <div className="flex items-center gap-2 border-b px-4 py-3">
            <span className="size-2.5 rounded-full bg-border" />
            <span className="size-2.5 rounded-full bg-border" />
            <span className="size-2.5 rounded-full bg-border" />
            <span className="ml-3 text-xs font-medium text-muted-foreground">Library</span>
          </div>
          <div className="flex gap-1.5 overflow-hidden border-b px-4 py-3">
            {filters.map((filter, index) => (
              <span
                key={filter}
                className={
                  index === 0
                    ? "rounded-full bg-primary px-3 py-1 text-xs font-semibold whitespace-nowrap text-primary-foreground"
                    : "rounded-full bg-muted px-3 py-1 text-xs font-medium whitespace-nowrap text-muted-foreground"
                }
              >
                {filter}
              </span>
            ))}
          </div>
          <ul className="divide-y">
            {sampleIdeas.map((idea) => (
              <li key={idea.title} className="flex items-center gap-4 px-4 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-[1.05rem] font-semibold">{idea.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {idea.kind} · {idea.scripture}
                  </p>
                </div>
                <span className="hidden shrink-0 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground sm:inline">
                  {idea.note}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <figcaption className="mt-4 text-sm text-muted-foreground">
          Illustrative preview of a planned feature. The finished library may look different.
        </figcaption>
      </figure>
    </section>
  );
}

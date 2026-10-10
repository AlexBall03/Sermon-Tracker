import { cn } from "@/lib/utils";
import { sampleLibrary, type SampleIdea } from "./sample-ideas";

const { points, sermons, undecided } = sampleLibrary;

// Card height and gap, in pixels. The connector lines are drawn from these.
const CARD = 92;
const GAP = 14;
const rowCentre = (row: number) => row * (CARD + GAP) + CARD / 2;
const diagramHeight = sermons.length * CARD + (sermons.length - 1) * GAP;

/** Static illustration of the planned library. Nothing here is interactive. */
export function AppPreview() {
  return (
    <section
      id="preview"
      aria-labelledby="preview-heading"
      className="container-page grid items-center gap-10 py-14 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20 lg:py-20"
    >
      <div>
        <h2
          id="preview-heading"
          className="font-display text-[2rem] leading-[1.12] font-medium tracking-[-0.015em] text-balance sm:text-[2.625rem]"
        >
          One library for every idea
        </h2>
        <p className="mt-4 max-w-xl text-[1.0625rem] leading-relaxed text-muted-foreground">
          Sermon ideas, reusable points, and thoughts you have not classified yet will live
          together, so nothing is lost between separate lists. This is an idea tracker, not a
          manuscript editor.
        </p>
        <p className="mt-4 max-w-xl text-[1.0625rem] leading-relaxed text-muted-foreground">
          A point is its own record. Write it once, and link it to every sermon it serves.
        </p>
      </div>

      <figure>
        {/*
         * Points on the left, sermons on the right, joined by lines: the
         * first point serves two sermons. Below `sm` the lines are dropped
         * and the columns stack; each point still says how many sermons use it.
         */}
        <div
          aria-hidden
          className="grid gap-x-0 gap-y-8 select-none sm:grid-cols-[minmax(0,1fr)_4.5rem_minmax(0,1fr)]"
        >
          <div>
            <p className="mb-3 text-xs font-semibold text-muted-foreground">Point ideas</p>
            <div className="flex flex-col" style={{ gap: GAP }}>
              {points.map(({ idea }, index) => (
                <IdeaCard key={idea.title} idea={idea} featured={index === 0} />
              ))}
              <IdeaCard idea={undecided} dashed />
            </div>
          </div>

          <svg
            viewBox={`0 0 72 ${diagramHeight}`}
            preserveAspectRatio="none"
            fill="none"
            className="mt-7 hidden w-full sm:block"
            style={{ height: diagramHeight }}
          >
            {points.flatMap(({ idea, sermons: linked }, row) =>
              linked.map((sermon) => (
                <path
                  key={`${idea.title}-${sermon}`}
                  d={`M0 ${rowCentre(row)} C36 ${rowCentre(row)} 36 ${rowCentre(sermon)} 72 ${rowCentre(sermon)}`}
                  vectorEffect="non-scaling-stroke"
                  strokeWidth={1.5}
                  className={row === 0 ? "stroke-primary" : "stroke-input"}
                />
              )),
            )}
          </svg>

          <div>
            <p className="mb-3 text-xs font-semibold text-muted-foreground">Sermon ideas</p>
            <div className="flex flex-col" style={{ gap: GAP }}>
              {sermons.map((idea) => (
                <IdeaCard key={idea.title} idea={idea} />
              ))}
            </div>
          </div>
        </div>
        <figcaption className="mt-6 text-sm text-muted-foreground">
          Illustrative preview of a planned feature. The finished library may look different.
        </figcaption>
      </figure>
    </section>
  );
}

function IdeaCard({
  idea,
  featured = false,
  dashed = false,
}: {
  idea: SampleIdea;
  featured?: boolean;
  dashed?: boolean;
}) {
  return (
    <div
      style={{ height: CARD }}
      className={cn(
        "flex flex-col justify-center rounded-xl px-4",
        dashed ? "border border-dashed border-input" : "border bg-surface shadow-card",
        featured && "border-primary/45",
      )}
    >
      <p className="line-clamp-2 font-serif text-base leading-[1.25] font-medium">{idea.title}</p>
      <p className="mt-1.5 flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
        <span className="truncate font-serif text-[0.8125rem] italic">{idea.scripture}</span>
        <span className={cn("shrink-0 font-medium", featured && "text-primary")}>
          {dashed ? "Undecided" : idea.note}
        </span>
      </p>
    </div>
  );
}

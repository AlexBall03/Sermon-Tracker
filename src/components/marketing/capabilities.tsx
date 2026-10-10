import { CalendarCheck, Link2, MapPin } from "lucide-react";

import { sampleJourney as journey } from "./sample-ideas";

/**
 * The three stages, told by following one idea through them: the passing
 * thought, the sermon it became, and the Sunday it was preached. Each stage
 * ends in that idea as it would look at that point.
 */
const stages = [
  {
    stage: "Capture",
    title: "Save the idea in seconds",
    body: "Note a sermon idea or a single point the moment it comes. Decide later whether it is a sermon, a point, or something still undecided.",
    example: (
      <div className="flex h-30 flex-col justify-center rounded-xl border border-dashed border-input px-4 py-3.5">
        <p className="font-serif text-[1.0625rem] leading-snug">{journey.thought}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          Undecided, captured {journey.capturedAt}
        </p>
      </div>
    ),
  },
  {
    stage: "Develop",
    title: "Organise and build over time",
    body: "Keep every idea in one library. Add Scripture references and notes, and connect a point to as many sermons as it serves.",
    example: (
      <div className="flex h-30 flex-col justify-center rounded-xl border bg-surface px-4 py-3.5 shadow-card">
        <p className="font-serif text-[1.0625rem] leading-snug font-medium">{journey.sermon}</p>
        <p className="mt-0.5 font-serif text-sm text-muted-foreground italic">
          {journey.scripture}
        </p>
        <p className="mt-3 flex items-center gap-2 border-t pt-3 text-xs leading-5 text-muted-foreground">
          <Link2 className="size-3.5 shrink-0 text-primary" />
          <span className="truncate font-serif text-sm leading-5 text-foreground">
            {journey.point}
          </span>
        </p>
      </div>
    ),
  },
  {
    stage: "Preach",
    title: "Preserve your preaching history",
    body: "Record when and where each sermon was preached, so the history stays alongside the ideas that produced it.",
    example: (
      <div className="flex h-30 flex-col justify-center rounded-xl border bg-surface px-4 py-3.5 shadow-card">
        <p className="font-serif text-[1.0625rem] leading-snug font-medium">{journey.sermon}</p>
        <p className="mt-0.5 font-serif text-sm text-muted-foreground italic">
          {journey.scripture}
        </p>
        <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3 text-xs leading-5 text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <CalendarCheck className="size-3.5 shrink-0 text-primary" />
            {journey.preachedOn}
          </span>
          <span className="flex items-center gap-1.5">
            <MapPin className="size-3.5 shrink-0 text-primary" />
            {journey.preachedAt}
          </span>
        </p>
      </div>
    ),
  },
];

export function Capabilities() {
  return (
    <section
      id="capabilities"
      aria-labelledby="capabilities-heading"
      className="container-page py-14 lg:py-20"
    >
      <div className="max-w-2xl">
        <h2
          id="capabilities-heading"
          className="font-display text-[2rem] leading-[1.12] font-medium tracking-[-0.015em] text-balance sm:text-[2.625rem]"
        >
          Built around how sermons actually take shape
        </h2>
        <p className="mt-4 max-w-xl text-[1.0625rem] leading-relaxed text-muted-foreground">
          Three stages, one continuous record: from the first passing thought to the Sunday it was
          preached.
        </p>
      </div>

      {/*
       * Not cards: three columns hung from one thread. The rule after each
       * numeral runs on to the next column, so the stages read as a single line.
       */}
      <ol className="mt-10 grid gap-x-10 gap-y-10 lg:mt-14 lg:grid-cols-3">
        {stages.map(({ stage, title, body, example }, index) => (
          <li key={stage} className="group/stage flex min-w-0 flex-col">
            <p className="flex items-center gap-3">
              <span aria-hidden className="font-serif text-xl leading-none text-gold-ink italic">
                {index + 1}
              </span>
              <span className="font-serif text-xl leading-none font-medium">{stage}</span>
              <span
                aria-hidden
                className="h-px flex-1 bg-border lg:-mr-10 lg:group-last/stage:mr-0"
              />
            </p>
            <h3 className="mt-6 text-[1.0625rem] font-semibold tracking-[-0.015em]">{title}</h3>
            <p className="mt-2 mb-7 text-[0.9375rem] leading-relaxed text-muted-foreground">
              {body}
            </p>
            <div aria-hidden className="mt-auto select-none">
              {example}
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-8 text-sm text-muted-foreground">
        The examples follow one idea and are illustrative; these features are still being built.
      </p>
    </section>
  );
}

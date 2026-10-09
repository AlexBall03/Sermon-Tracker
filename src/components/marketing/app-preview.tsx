import { Link2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { sampleIdeas, type SampleIdea } from "./sample-ideas";

const [sermon, point, undecided] = sampleIdeas;

/** Static illustration of the planned library. Nothing here is interactive. */
export function AppPreview() {
  return (
    <section
      id="preview"
      aria-labelledby="preview-heading"
      className="container-page grid scroll-mt-16 items-center gap-12 py-20 lg:grid-cols-[0.85fr_1.15fr] lg:gap-20 lg:py-28"
    >
      <div>
        <p className="text-xs font-semibold tracking-[0.24em] text-primary uppercase">
          In development
        </p>
        <h2
          id="preview-heading"
          className="mt-4 font-display text-4xl leading-[1.1] font-semibold tracking-tight text-balance sm:text-5xl"
        >
          One library for every idea
        </h2>
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
          Sermon ideas, reusable points, and thoughts you have not classified yet will live
          together, so nothing is lost between separate lists. This is an idea tracker, not a
          manuscript editor.
        </p>
      </div>

      <figure>
        <div aria-hidden className="grid gap-4 sm:grid-cols-2">
          <IdeaCard idea={sermon} className="sm:row-span-2">
            <div className="mt-8 border-t pt-5">
              <p className="flex items-center gap-2 text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                <Link2 className="size-3.5" />
                Linked point
              </p>
              <p className="mt-3 flex gap-3 text-sm leading-relaxed">
                <span className="font-display text-gold-ink italic">01</span>
                {point.title}
              </p>
            </div>
          </IdeaCard>
          <IdeaCard idea={point} />
          <IdeaCard idea={undecided} className="border-dashed bg-transparent shadow-none" />
        </div>
        <figcaption className="mt-5 text-sm text-muted-foreground">
          Illustrative preview of a planned feature. The finished library may look different.
        </figcaption>
      </figure>
    </section>
  );
}

function IdeaCard({
  idea,
  className,
  children,
}: {
  idea: SampleIdea;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("rounded-xl border bg-surface p-6 shadow-card", className)}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">
          {idea.kind}
        </span>
        <span className="rounded-md border px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {idea.note}
        </span>
      </div>
      <p className="mt-5 font-display text-2xl leading-snug font-semibold">{idea.title}</p>
      <p className="mt-2 text-sm text-muted-foreground">{idea.scripture}</p>
      {children}
    </div>
  );
}

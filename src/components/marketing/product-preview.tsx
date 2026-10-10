import { Link2, Plus } from "lucide-react";

import { LogoMark } from "@/components/brand/logo-mark";
import { cn } from "@/lib/utils";
import { sampleIdeas, samplePoint, type SampleIdea } from "./sample-ideas";

// The thought that gets typed into the capture field and then filed at the top of the list.
const captured = sampleIdeas[2];
const filed = sampleIdeas.filter((idea) => idea !== captured);

const views = [
  { label: "All ideas", count: 6, current: true },
  { label: "Sermons", count: 3 },
  { label: "Points", count: 2 },
  { label: "Undecided", count: 1 },
];

/**
 * Hero illustration: a miniature of the planned application. A thought is
 * typed into the capture field and files itself into the library, once (see
 * the `type`, `clear`, `settle`, and `file` keyframes); with reduced motion it
 * is static, with the thought already filed. The selected point shows the
 * sermons it serves. Purely illustrative: hidden from assistive technology
 * and built without any interactive elements.
 */
export function ProductPreview() {
  return (
    <figure className="mt-10 animate-rise [animation-delay:200ms] lg:mt-14">
      <div aria-hidden className="hero-glow select-none">
        <div className="lit-edge rounded-2xl shadow-raised">
          <div className="overflow-hidden rounded-2xl border bg-surface">
            {/* The application bar, with quick capture in it. */}
            <div className="flex h-13 items-center gap-3 border-b px-3 sm:gap-5 sm:px-4">
              <LogoMark className="size-6 shrink-0" />
              <div className="hidden items-center gap-4 text-[0.8125rem] font-medium text-muted-foreground md:flex">
                <span>Dashboard</span>
                <span className="text-foreground">Library</span>
                <span>History</span>
              </div>
              <div className="flex h-8.5 min-w-0 flex-1 items-center gap-2.5 rounded-lg border border-ring/60 bg-background pr-3 pl-1.5 shadow-focus md:ml-auto md:max-w-88">
                <span className="grid size-5.5 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground">
                  <Plus className="size-3.5" />
                </span>
                <span className="relative min-w-0 flex-1 overflow-hidden">
                  <span className="block animate-settle truncate text-[0.8125rem] text-muted-foreground motion-reduce:animate-none">
                    Capture a thought…
                  </span>
                  <span className="absolute inset-y-0 left-0 flex animate-clear items-center motion-reduce:hidden">
                    <span className="relative font-serif text-[0.9375rem] whitespace-nowrap">
                      <span className="block animate-type">{captured.title}</span>
                      <span className="absolute inset-y-0.5 w-px animate-caret bg-primary" />
                    </span>
                  </span>
                </span>
              </div>
              <span className="hidden size-7 shrink-0 place-items-center rounded-full border bg-muted text-[0.625rem] font-semibold text-muted-foreground sm:grid">
                JM
              </span>
            </div>

            <div className="grid md:grid-cols-[11.5rem_minmax(0,1fr)] lg:grid-cols-[12.5rem_minmax(0,1fr)_20rem]">
              {/* Views */}
              <div className="hidden border-r bg-background/60 p-3 md:block">
                <ul className="space-y-0.5 text-[0.8125rem] font-medium">
                  {views.map((view) => (
                    <li
                      key={view.label}
                      className={cn(
                        "flex items-center justify-between rounded-md px-2.5 py-1.5",
                        view.current ? "bg-primary-soft text-primary" : "text-muted-foreground",
                      )}
                    >
                      {view.label}
                      <span className="text-xs tabular-nums opacity-80">{view.count}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* The list */}
              <div className="min-w-0">
                <div className="flex items-baseline justify-between px-4 pt-4 pb-3 sm:px-5">
                  <p className="text-sm font-semibold">All ideas</p>
                  <p className="text-xs text-muted-foreground">Recently captured</p>
                </div>
                {/*
                 * Fixed to five rows. When the new row opens at the top, the
                 * last one slides out of view, so nothing around the list moves.
                 */}
                <ul className="h-[calc(20rem+4px)] overflow-hidden border-t">
                  <li className="grid animate-file motion-reduce:animate-none">
                    <div className="min-h-0 overflow-hidden">
                      <IdeaRow idea={captured} fresh />
                    </div>
                  </li>
                  {filed.map((idea) => (
                    <li key={idea.title} className="border-t">
                      <IdeaRow idea={idea} selected={idea === samplePoint.idea} />
                    </li>
                  ))}
                </ul>
              </div>

              {/* The selected point, and the sermons it serves. */}
              <div className="hidden border-l p-5 lg:block">
                <p className="flex items-center gap-2 text-xs font-semibold text-primary">
                  <span className={cn("size-2 rounded-full", kindMark["Point idea"])} />
                  Point idea
                </p>
                <p className="mt-3 font-serif text-[1.3125rem] leading-snug font-medium">
                  {samplePoint.idea.title}
                </p>
                <p className="mt-1 font-serif text-sm text-muted-foreground italic">
                  {samplePoint.idea.scripture}
                </p>
                <p className="mt-3 text-[0.8125rem] leading-relaxed text-muted-foreground">
                  {samplePoint.body}
                </p>
                <p className="mt-5 flex items-center gap-2 border-t pt-4 text-xs font-semibold">
                  <Link2 className="size-3.5 text-primary" />
                  Used in {samplePoint.sermons.length} sermons
                </p>
                <ul className="mt-2.5 space-y-1.5">
                  {samplePoint.sermons.map((sermon) => (
                    <li key={sermon.title} className="rounded-lg border bg-background/60 px-3 py-2">
                      <p className="truncate font-serif text-[0.9375rem] leading-snug">
                        {sermon.title}
                      </p>
                      <p className="font-serif text-xs text-muted-foreground italic">
                        {sermon.scripture}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
      <figcaption className="mt-5 text-center text-sm text-muted-foreground">
        An illustration of the library and quick capture, which are still being built.
      </figcaption>
    </figure>
  );
}

const kindMark: Record<SampleIdea["kind"], string> = {
  "Sermon idea": "bg-primary",
  "Point idea": "border-2 border-primary",
  Undecided: "border border-dashed border-muted-foreground",
};

function IdeaRow({
  idea,
  fresh = false,
  selected = false,
}: {
  idea: SampleIdea;
  fresh?: boolean;
  selected?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative flex h-16 items-center gap-3 px-4 sm:gap-3.5 sm:px-5",
        selected &&
          "lg:bg-muted lg:before:absolute lg:before:inset-y-0 lg:before:left-0 lg:before:w-0.5 lg:before:bg-primary",
      )}
    >
      <span className={cn("size-2.5 shrink-0 rounded-full", kindMark[idea.kind])} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-serif text-[1.0625rem] leading-snug font-medium">
          {idea.title}
        </p>
        <p className="mt-0.5 flex items-baseline gap-2 truncate text-xs text-muted-foreground">
          {idea.kind}
          <span className="font-serif text-[0.8125rem] italic">{idea.scripture}</span>
        </p>
      </div>
      <span
        className={cn(
          "hidden shrink-0 rounded-md px-2 py-1 text-xs font-medium sm:inline",
          fresh ? "bg-primary-soft text-primary" : "bg-muted text-muted-foreground",
        )}
      >
        {fresh ? "Just now" : idea.note}
      </span>
    </div>
  );
}

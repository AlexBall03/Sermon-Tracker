import { BookOpen, CircleDashed, History, Library, ListChecks, Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import { sampleIdeas, type SampleIdea } from "./sample-ideas";

const sections = [
  { label: "Library", icon: Library, current: true },
  { label: "Sermons", icon: BookOpen },
  { label: "Points", icon: ListChecks },
  { label: "Undecided", icon: CircleDashed },
  { label: "History", icon: History },
];

/**
 * Miniature application window for the hero. Purely illustrative: hidden
 * from assistive technology and built without any interactive elements.
 */
export function ProductPreview() {
  return (
    <div
      aria-hidden
      className="overflow-hidden rounded-xl border bg-surface text-left shadow-raised select-none"
    >
      <div className="flex items-center gap-2 border-b bg-muted/50 px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-input" />
        <span className="size-2.5 rounded-full bg-input" />
        <span className="size-2.5 rounded-full bg-input" />
        <span className="ml-auto rounded-md border bg-surface px-2 py-0.5 text-[0.68rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          Illustrative preview
        </span>
      </div>

      <div className="grid sm:grid-cols-[11.5rem_1fr]">
        <div className="hidden border-r bg-muted/30 p-3 sm:block">
          <p className="px-2.5 pt-1 pb-2 text-[0.68rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            Ideas
          </p>
          <ul className="space-y-0.5">
            {sections.map(({ label, icon: Icon, current }) => (
              <li
                key={label}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium",
                  current ? "bg-primary/10 text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className="size-4" />
                {label}
              </li>
            ))}
          </ul>
        </div>

        <div className="p-4 sm:p-6">
          <div className="flex h-12 items-center gap-3 rounded-lg border border-primary/40 bg-background pr-4 pl-2 shadow-glow">
            <span className="grid size-8 place-items-center rounded-md bg-primary text-primary-foreground">
              <Plus className="size-4" />
            </span>
            <span className="text-sm text-muted-foreground">Capture a thought…</span>
          </div>

          <div className="mt-6 flex items-baseline justify-between">
            <p className="font-display text-xl font-semibold">Library</p>
            <p className="text-xs text-muted-foreground">Recently captured</p>
          </div>

          <ul className="mt-3 divide-y rounded-lg border">
            {sampleIdeas.map((idea) => (
              <IdeaRow key={idea.title} idea={idea} />
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

const kindDot: Record<SampleIdea["kind"], string> = {
  "Sermon idea": "bg-primary",
  "Point idea": "bg-gold",
  Undecided: "bg-input",
};

function IdeaRow({ idea }: { idea: SampleIdea }) {
  return (
    <li className="flex items-center gap-3 px-3.5 py-3 sm:gap-4 sm:px-4">
      <span className={cn("size-2 shrink-0 rounded-full", kindDot[idea.kind])} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-base font-semibold sm:text-[1.05rem]">
          {idea.title}
        </p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {idea.kind} · {idea.scripture}
        </p>
      </div>
      <span className="hidden shrink-0 rounded-md border px-2 py-1 text-xs font-medium text-muted-foreground md:inline">
        {idea.note}
      </span>
    </li>
  );
}

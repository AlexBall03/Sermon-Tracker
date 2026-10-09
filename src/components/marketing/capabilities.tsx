import { CalendarCheck, Layers, PenLine } from "lucide-react";

const capabilities = [
  {
    step: "Capture",
    icon: PenLine,
    title: "Save the idea in seconds",
    body: "Note a sermon idea or a single point the moment it comes. Decide later whether it is a sermon, a point, or something still undecided.",
  },
  {
    step: "Develop",
    icon: Layers,
    title: "Organise and build over time",
    body: "Keep every idea in one library. Add Scripture references and notes, and connect a point to as many sermons as it serves.",
  },
  {
    step: "Preach",
    icon: CalendarCheck,
    title: "Preserve your preaching history",
    body: "Record when and where each sermon was preached, so the history stays alongside the ideas that produced it.",
  },
];

export function Capabilities() {
  return (
    <section
      id="capabilities"
      aria-labelledby="capabilities-heading"
      className="scroll-mt-16 border-y bg-surface"
    >
      <div className="container-page py-20 lg:py-28">
        <div className="grid gap-6 lg:grid-cols-2 lg:items-end lg:gap-16">
          <div>
            <p className="text-xs font-semibold tracking-[0.24em] text-primary uppercase">
              How it works
            </p>
            <h2
              id="capabilities-heading"
              className="mt-4 font-display text-4xl leading-[1.1] font-semibold tracking-tight text-balance sm:text-5xl"
            >
              Built around how sermons actually take shape
            </h2>
          </div>
          <p className="max-w-xl text-lg leading-relaxed text-muted-foreground lg:justify-self-end">
            Three stages, one continuous record: from the first passing thought to the Sunday it was
            preached.
          </p>
        </div>

        <ol className="mt-14 grid lg:mt-20 lg:grid-cols-3">
          {capabilities.map(({ step, icon: Icon, title, body }, index) => (
            <li
              key={step}
              className="group relative border-t py-10 lg:px-10 lg:not-first:border-l lg:first:pl-0 lg:last:pr-0"
            >
              {/* emerald rule draws across on hover */}
              <span
                aria-hidden
                className="absolute -top-px left-0 h-px w-12 bg-primary transition-[width] duration-500 ease-out group-hover:w-full lg:left-10 lg:group-first:left-0"
              />
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="grid size-9 place-items-center rounded-lg border bg-background text-primary transition-shadow duration-300 group-hover:shadow-glow">
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <span className="text-xs font-semibold tracking-[0.24em] uppercase">{step}</span>
                </div>
                <span
                  aria-hidden
                  className="font-display text-5xl leading-none text-gold-ink/70 italic transition-colors duration-300 group-hover:text-gold-ink"
                >
                  {String(index + 1).padStart(2, "0")}
                </span>
              </div>
              <h3 className="mt-10 font-display text-2xl leading-snug font-semibold">{title}</h3>
              <p className="mt-3 leading-relaxed text-muted-foreground">{body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

const capabilities = [
  {
    step: "Capture",
    title: "Save the idea in seconds",
    body: "Note a sermon idea or a single point the moment it comes. Decide later whether it is a sermon, a point, or something still undecided.",
  },
  {
    step: "Develop",
    title: "Organise and build over time",
    body: "Keep every idea in one library. Add Scripture references and notes, and connect a point to as many sermons as it serves.",
  },
  {
    step: "Preach",
    title: "Preserve your preaching history",
    body: "Record when and where each sermon was preached, so the history stays alongside the ideas that produced it.",
  },
];

export function Capabilities() {
  return (
    <section aria-labelledby="capabilities-heading" className="border-y">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
        <h2
          id="capabilities-heading"
          className="max-w-2xl font-display text-3xl leading-tight font-semibold tracking-tight sm:text-4xl"
        >
          Built around how sermons actually take shape
        </h2>
        <ol className="mt-12 grid gap-5 md:grid-cols-3">
          {capabilities.map((item, index) => (
            <li
              key={item.step}
              className="group rounded-2xl border bg-card p-6 transition-shadow duration-300 hover:shadow-lg hover:shadow-black/5"
            >
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-semibold tracking-[0.24em] text-primary uppercase">
                  {item.step}
                </span>
                <span
                  aria-hidden
                  className="font-display text-2xl leading-none text-gold-ink italic"
                >
                  {String(index + 1).padStart(2, "0")}
                </span>
              </div>
              <h3 className="mt-6 font-display text-xl leading-snug font-semibold">{item.title}</h3>
              <p className="mt-3 text-[0.95rem] leading-relaxed text-muted-foreground">
                {item.body}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

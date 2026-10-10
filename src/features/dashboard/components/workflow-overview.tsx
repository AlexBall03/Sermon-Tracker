const stages = [
  {
    stage: "Capture",
    title: "Save the thought first",
    body: "A line is enough. You will not have to decide whether it is a sermon or a point before it is saved.",
  },
  {
    stage: "Develop",
    title: "Build it over time",
    body: "Add Scripture and notes as they come, and attach a point to every sermon it serves.",
  },
  {
    stage: "Preach",
    title: "Keep the record",
    body: "Note when and where a sermon was preached, beside the ideas that produced it.",
  },
];

const kinds = [
  {
    name: "Sermon idea",
    body: "A message in the making: a title, a text, and the direction it is heading.",
  },
  {
    name: "Point idea",
    body: "One thought that stands on its own, and can be used in more than one sermon.",
  },
  {
    name: "Undecided",
    body: "Something worth keeping that is not yet either. It can become a sermon or a point later.",
  },
];

/**
 * How the workspace will be used, for someone arriving before the library
 * exists. It follows the landing page's three stages: columns hung from one
 * rule, not cards, and nothing here is interactive.
 */
export function WorkflowOverview() {
  return (
    <section aria-labelledby="workflow-heading">
      <h2 id="workflow-heading" className="text-lg font-semibold tracking-[-0.015em]">
        How your workspace will work
      </h2>
      <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted-foreground">
        The idea library is the next thing being built. This is the path an idea will take through
        it.
      </p>

      <ol className="mt-7 grid gap-x-10 gap-y-8 md:grid-cols-3">
        {stages.map(({ stage, title, body }, index) => (
          <li key={stage} className="group/stage min-w-0">
            <p className="flex items-center gap-3">
              <span aria-hidden className="font-serif text-xl leading-none text-gold-ink italic">
                {index + 1}
              </span>
              <span className="font-serif text-xl leading-none font-medium">{stage}</span>
              <span
                aria-hidden
                className="h-px flex-1 bg-border md:-mr-10 md:group-last/stage:mr-0"
              />
            </p>
            <h3 className="mt-5 text-[0.9375rem] font-semibold tracking-[-0.01em]">{title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
          </li>
        ))}
      </ol>

      <dl className="mt-9 grid gap-x-10 gap-y-5 border-t pt-7 md:grid-cols-3">
        {kinds.map(({ name, body }) => (
          <div key={name} className="min-w-0">
            <dt className="font-serif text-[1.0625rem] leading-snug font-medium">{name}</dt>
            <dd className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{body}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

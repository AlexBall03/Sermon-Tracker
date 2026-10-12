import { dictionary } from "@/i18n";
import { defaultLocale, type Locale } from "@/i18n/locales";

/**
 * How the workspace is used, for someone new to it. It follows the landing page's three stages: columns hung from one
 * rule, not cards, and nothing here is interactive.
 */
export function WorkflowOverview({ locale = defaultLocale }: { locale?: Locale }) {
  const { title, description, stages, kinds } = dictionary(locale, "dashboard").workflow;
  return (
    <section aria-labelledby="workflow-heading">
      <h2 id="workflow-heading" className="text-lg font-semibold tracking-[-0.015em]">
        {title}
      </h2>
      <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted-foreground">{description}</p>

      <ol className="mt-7 grid gap-x-10 gap-y-8 md:grid-cols-3">
        {stages.map(({ stage, title: heading, body }, index) => (
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
            <h3 className="mt-5 text-[0.9375rem] font-semibold tracking-[-0.01em]">{heading}</h3>
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

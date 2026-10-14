import { CalendarCheck, Link2, MapPin } from "lucide-react";

import { defaultNumbering, entryLabel } from "@/features/outlines/numbering";
import { formatDay } from "@/features/preaching/dates";
import { formatReference } from "@/features/scripture/reference";
import { dictionary } from "@/i18n";
import type { Locale } from "@/i18n/locales";
import { demoWorkspace } from "../demo";
import { DevelopedLine } from "../preview/dashboard-preview";
import { place } from "../preview/frames";
import { sectionLead, sectionTitle } from "./shared";

const card =
  "flex h-32 flex-col justify-center rounded-xl border bg-surface px-4 py-3.5 shadow-card";
const title = "line-clamp-2 font-serif text-[1.0625rem] leading-snug font-medium";
const detail = "mt-2 truncate text-xs text-muted-foreground";

/**
 * The five stages, told with the demonstration workspace: a thought just
 * captured, a sermon being developed, its outline, a sermon preached, and one
 * that has gone quiet. They hang from one rule and are not cards, so they read
 * as one line. Nothing says a sermon must pass through them in order.
 */
export function HowItWorks({ locale }: { locale: Locale }) {
  const t = dictionary(locale, "marketing").how;
  const statuses = dictionary(locale, "ideas").statuses;
  const workspace = demoWorkspace(locale);
  const find = (id: string) => workspace.ideas.find((idea) => idea.id === id)!;
  const [grace, waiting, voice, strength] = ["grace", "waiting", "voice", "strength"].map(find);
  const preached = workspace.occasions[0];

  const stages = [
    {
      ...t.stages.capture,
      example: (
        <div className="flex h-32 flex-col justify-center rounded-xl border border-dashed border-input px-4 py-3.5">
          <p className={title}>{waiting.title}</p>
          <p className={detail}>{t.examples.captured}</p>
        </div>
      ),
    },
    {
      ...t.stages.develop,
      example: (
        <div className={card}>
          <p className={title}>{grace.title}</p>
          <p className="mt-0.5 truncate font-serif text-sm text-muted-foreground italic">
            {formatReference(grace.references[0], locale)}
          </p>
          <p className="mt-2 flex items-center gap-2 border-t pt-2 text-xs text-muted-foreground">
            <Link2 className="size-3.5 shrink-0 text-primary" />
            <span className="truncate">{strength.title}</span>
          </p>
        </div>
      ),
    },
    {
      ...t.stages.outline,
      example: (
        <div className={card}>
          {workspace.outline.entries
            .filter((entry) => entry.type === "point" && entry.path.length === 1)
            .map((entry) => (
              <p key={entry.id} className="flex gap-2 py-0.5 text-sm">
                <span className="w-6 shrink-0 font-semibold tabular-nums">
                  {entryLabel(defaultNumbering, entry.path)}
                </span>
                <span className="truncate font-serif">{entry.title}</span>
              </p>
            ))}
        </div>
      ),
    },
    {
      ...t.stages.preach,
      example: (
        <div className={card}>
          <p className={title}>{preached.sermon.title}</p>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <CalendarCheck className="size-3.5 shrink-0 text-primary" />
              {formatDay(preached.preachedOn, locale)}
            </span>
            <span className="flex min-w-0 items-center gap-1.5">
              <MapPin className="size-3.5 shrink-0 text-primary" />
              <span className="truncate">{preached.venue.name}</span>
            </span>
          </p>
        </div>
      ),
    },
    {
      ...t.stages.revisit,
      example: (
        <div className={card}>
          <p className={title}>{voice.title}</p>
          <p className={detail}>
            <span className="font-medium">{statuses[voice.status]}</span>
            {" · "}
            <DevelopedLine idea={voice} locale={locale} />
          </p>
        </div>
      ),
    },
  ];

  return (
    <section
      id="how-it-works"
      aria-labelledby="how-heading"
      className="container-page py-14 lg:py-20"
    >
      <div className="max-w-2xl reveal">
        <h2 id="how-heading" className={sectionTitle}>
          {t.title}
        </h2>
        <p className={sectionLead}>{t.body}</p>
      </div>

      <ol className="mt-10 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:mt-14 lg:grid-cols-5">
        {stages.map(({ name, title: stageTitle, body, example }, index) => (
          <li key={name} style={place(index)} className="group/stage flex min-w-0 reveal flex-col">
            <p className="flex items-center gap-3">
              <span aria-hidden className="font-serif text-xl leading-none text-gold-ink italic">
                {index + 1}
              </span>
              <span className="font-serif text-xl leading-none font-medium">{name}</span>
              <span
                aria-hidden
                className="h-px flex-1 bg-border lg:-mr-8 lg:group-last/stage:mr-0"
              />
            </p>
            <h3 className="mt-6 text-[1.0625rem] font-semibold tracking-[-0.015em]">
              {stageTitle}
            </h3>
            <p className="mt-2 mb-7 text-[0.9375rem] leading-relaxed text-muted-foreground">
              {body}
            </p>
            <div aria-hidden className="mt-auto select-none">
              {example}
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-8 max-w-2xl text-sm leading-relaxed text-muted-foreground">{t.note}</p>
    </section>
  );
}

import { ArrowRight, CalendarPlus, List, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { summaryStats } from "@/features/dashboard/summary";
import { welcomeTitle } from "@/features/dashboard/greeting";
import { formatDay } from "@/features/preaching/dates";
import { dictionary } from "@/i18n";
import type { Locale } from "@/i18n/locales";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { demoWorkspace, type DemoIdea, type DemoWorkspace } from "../demo";
import { PhoneFrame, place, WindowFrame } from "./frames";

/*
 * The dashboard, reconstructed. Each piece below is drawn from the section of
 * the real dashboard it is named for (src/features/dashboard/components), with
 * the same classes and the same dictionary strings, and laid out twice: in a
 * window as the page is on a wide screen, and on a phone as it stacks below `md`.
 * When a section of the dashboard changes, change its piece here to match.
 */

const panel = "min-w-0 self-start rounded-xl border bg-surface shadow-card";
const heading = "text-lg font-semibold tracking-[-0.015em]";
const compact = "h-9 px-3.5";

type Piece = { workspace: DemoWorkspace; locale: Locale; phone?: boolean; className?: string };

/** "Last developed Oct 11, 2026", or "Never developed · created Aug 3, 2026", as the library says it. */
export function DevelopedLine({ idea, locale }: { idea: DemoIdea; locale: Locale }) {
  const t = dictionary(locale, "library").results;
  return idea.lastDevelopedAt
    ? `${t.lastDeveloped} ${formatDate(idea.lastDevelopedAt, locale)}`
    : `${t.neverDeveloped} · ${t.created} ${formatDate(idea.createdAt, locale)}`;
}

function SectionLink({ children }: { children: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
      {children}
      <ArrowRight className="size-4" />
    </span>
  );
}

function Header({ workspace, locale, phone }: Piece) {
  const t = dictionary(locale, "dashboard");
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 border-b pb-6">
      <div className="min-w-0 flex-1 basis-80">
        <p
          className={cn(
            "font-display leading-tight font-medium tracking-[-0.015em]",
            phone ? "text-[1.875rem]" : "text-[2.125rem]",
          )}
        >
          {welcomeTitle(workspace.firstName, locale)}
        </p>
        <p className="mt-2 max-w-2xl text-[0.9375rem] leading-relaxed text-muted-foreground">
          {t.description}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className={buttonVariants({ variant: "outline" })}>
          <List />
          {t.outline.title}
        </span>
        <span className={buttonVariants({ variant: "outline" })}>
          <CalendarPlus />
          {t.record.title}
        </span>
        {/* On a phone the tab bar has capture; never two. */}
        {!phone && (
          <span className={buttonVariants()}>
            <Plus />
            {dictionary(locale, "ideas").capture.button}
          </span>
        )}
      </div>
    </div>
  );
}

function ContinueWorking({ workspace, locale, phone, className }: Piece) {
  const t = dictionary(locale, "dashboard").continue;
  const statuses = dictionary(locale, "ideas").statuses;
  const outlines = dictionary(locale, "outlines");
  return (
    <div className={cn(panel, className)}>
      <div className="px-5 pt-5 pb-4">
        <p className={heading}>{t.title}</p>
        <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted-foreground">
          {t.description}
        </p>
      </div>
      <div className="divide-y border-t">
        {workspace.continueWorking.map(({ sermon, entryCount }, index) => (
          <div
            key={sermon.id}
            style={place(index)}
            className={cn(
              "flex stagger gap-x-6 gap-y-3 px-5 py-4",
              phone ? "flex-col" : "items-center justify-between",
            )}
          >
            <div className="min-w-0">
              <p className="line-clamp-2 font-serif text-lg leading-snug font-medium text-pretty underline decoration-muted-foreground/45 decoration-dotted decoration-1 underline-offset-[5px]">
                {sermon.title}
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground tabular-nums">
                <span className="font-semibold text-foreground">{statuses[sermon.status]}</span>
                {" · "}
                <DevelopedLine idea={sermon} locale={locale} />
              </p>
              <p className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                <List className="size-3.5 shrink-0" />
                <span className="truncate">
                  {entryCount === null
                    ? t.noOutline
                    : `${t.outline} · ${outlines.overview.entries(entryCount)}`}
                </span>
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {entryCount === null ? (
                <>
                  <span
                    className={cn(
                      buttonVariants({ variant: "outline" }),
                      compact,
                      phone && "order-first",
                    )}
                  >
                    {t.openSermon}
                    <ArrowRight />
                  </span>
                  <span
                    className={cn(
                      buttonVariants({ variant: "ghost", size: "sm" }),
                      "px-2.5 text-muted-foreground",
                      !phone && "order-first",
                    )}
                  >
                    <List />
                    {outlines.link.short}
                  </span>
                </>
              ) : (
                <>
                  <span
                    className={cn(
                      buttonVariants({ variant: "outline" }),
                      compact,
                      phone && "order-first",
                    )}
                  >
                    {t.resume}
                    <ArrowRight />
                  </span>
                  <span
                    className={cn(
                      buttonVariants({ variant: "ghost" }),
                      compact,
                      "text-muted-foreground",
                      !phone && "order-first",
                    )}
                  >
                    {t.openSermon}
                  </span>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Revisit({ workspace, locale, className }: Piece) {
  const t = dictionary(locale, "dashboard").revisit;
  const statuses = dictionary(locale, "ideas").statuses;
  return (
    <div className={cn(panel, className)}>
      <div className="px-5 pt-5 pb-4">
        <p className={heading}>{t.title}</p>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{t.description}</p>
      </div>
      <div className="divide-y border-t">
        {workspace.revisit.map((idea, index) => (
          <div key={idea.id} style={place(index + 2)} className="stagger px-5 py-3.5">
            <p className="line-clamp-2 font-serif text-base leading-snug font-medium text-pretty">
              {idea.title}
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground tabular-nums">
              <span className="font-medium">{statuses[idea.status]}</span>
              {" · "}
              <DevelopedLine idea={idea} locale={locale} />
            </p>
          </div>
        ))}
      </div>
      <div className="border-t px-5 py-3.5">
        <SectionLink>{t.all}</SectionLink>
      </div>
    </div>
  );
}

/** The dashboard lists the five latest; the library has the rest. */
const recentCount = 5;

function RecentIdeas({ workspace, locale, className }: Piece) {
  const t = dictionary(locale, "dashboard").recent;
  const words = dictionary(locale, "ideas");
  return (
    <div className={cn(panel, className)}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 pt-5 pb-4">
        <p className={heading}>{t.title}</p>
        <SectionLink>{t.all}</SectionLink>
      </div>
      <div className="divide-y border-t">
        {workspace.recentIdeas.slice(0, recentCount).map((idea, index) => (
          <div
            key={idea.id}
            style={place(index + 4)}
            className="flex stagger items-start justify-between gap-4 px-5 py-3.5"
          >
            <div className="min-w-0">
              <p className="line-clamp-2 font-serif text-base leading-snug font-medium text-pretty">
                {idea.title}
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground tabular-nums">
                <span className="font-medium">{words.statuses[idea.status]}</span>
                {" · "}
                {t.updated} {formatDate(idea.updatedAt, locale)}
              </p>
            </div>
            <Badge tone={idea.kind === "undecided" ? "muted" : "accent"}>
              {words.kinds[idea.kind]}
            </Badge>
          </div>
        ))}
      </div>
    </div>
  );
}

function RecentPreaching({ workspace, locale, className }: Piece) {
  const t = dictionary(locale, "dashboard").preaching;
  const times = dictionary(locale, "preaching").timesOfDay;
  return (
    <div className={cn(panel, className)}>
      <div className="px-5 pt-5 pb-4">
        <p className={heading}>{t.title}</p>
      </div>
      <div className="divide-y border-t">
        {workspace.recentPreaching.map((item, index) => (
          <div key={item.id} style={place(index + 5)} className="stagger px-5 py-3.5">
            <p className="flex items-baseline gap-2 text-xs whitespace-nowrap text-muted-foreground tabular-nums">
              <span className="font-semibold text-foreground">
                {formatDay(item.preachedOn, locale)}
              </span>
              {item.timeOfDay && <span className="font-semibold">{times[item.timeOfDay]}</span>}
            </p>
            <p className="mt-1 line-clamp-2 font-serif text-base leading-snug font-medium text-pretty">
              {item.sermon.title}
            </p>
            <p className="mt-1 text-[0.8125rem] leading-snug text-muted-foreground">
              {[
                [item.venue.name, item.venue.locality].filter(Boolean).join(", "),
                item.context,
              ].join(" · ")}
            </p>
          </div>
        ))}
      </div>
      <div className="border-t px-5 py-3.5">
        <SectionLink>{t.all}</SectionLink>
      </div>
    </div>
  );
}

/** At a Glance: four figures across a wide window, two by two on a phone, as `StatStrip` sets them. */
function Glance({ workspace, locale, phone }: Piece) {
  const t = dictionary(locale, "dashboard").summary;
  const stats = summaryStats(workspace.counts, workspace.timesPreached, locale);
  return (
    <div className="mt-10">
      <p className={heading}>{t.title}</p>
      <div
        className={cn(
          "mt-4 grid rounded-xl border bg-surface shadow-card",
          phone ? "grid-cols-2" : "grid-cols-4",
        )}
      >
        {stats.map((stat, index) => (
          <div
            key={stat.label}
            className={cn(
              "px-5 py-4",
              phone
                ? [index % 2 === 1 && "border-l", index >= 2 && "border-t"]
                : index > 0 && "border-l",
            )}
          >
            <p className="text-[0.8125rem] font-medium text-muted-foreground">{stat.label}</p>
            <p className="mt-1.5 text-[1.75rem] leading-none font-semibold tracking-[-0.02em] tabular-nums">
              {stat.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The dashboard in a window, in the three columns it has on a wide screen.
 * The window is drawn at that width whatever the browser's, and whoever shows
 * it scales or crops it to fit.
 */
export function DashboardWindow({ locale, className }: { locale: Locale; className?: string }) {
  const workspace = demoWorkspace(locale);
  const piece = { workspace, locale };
  return (
    <WindowFrame
      locale={locale}
      current="dashboard"
      initials={workspace.initials}
      className={className}
    >
      <div className="px-8 py-10">
        <Header {...piece} />
        <div className="mt-8 grid grid-cols-3 gap-6">
          <ContinueWorking {...piece} className="col-span-2" />
          <Revisit {...piece} />
          <RecentIdeas {...piece} className="col-span-2" />
          <RecentPreaching {...piece} />
        </div>
        <Glance {...piece} />
      </div>
    </WindowFrame>
  );
}

/**
 * The dashboard on a phone. `top` is the page as it opens; `lower` is the
 * same page scrolled on to what follows the sermons being worked on.
 */
export function DashboardPhone({
  locale,
  part = "top",
  className,
}: {
  locale: Locale;
  part?: "top" | "lower";
  className?: string;
}) {
  const workspace = demoWorkspace(locale);
  const piece = { workspace, locale, phone: true };
  return (
    <PhoneFrame
      locale={locale}
      current="dashboard"
      initials={workspace.initials}
      className={className}
    >
      {part === "top" ? (
        <div className="px-5 py-10">
          <Header {...piece} />
          <div className="mt-8 grid gap-6">
            <ContinueWorking {...piece} />
            <Revisit {...piece} />
          </div>
        </div>
      ) : (
        <div className="px-5 pt-6">
          <div className="grid gap-6">
            <Revisit {...piece} />
            <RecentPreaching {...piece} />
          </div>
          <Glance {...piece} />
        </div>
      )}
    </PhoneFrame>
  );
}

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { StatStrip } from "@/components/ui/stat-strip";
import { IdeaList } from "@/features/ideas/components/idea-list";
import { CaptureButton } from "@/features/ideas/components/quick-capture";
import type { IdeaRecord, IdeaWithReferences } from "@/features/ideas/ideas";
import { RecordPreachingProvider } from "@/features/preaching/components/record-preaching";
import type { ReferenceOption } from "@/features/preaching/components/reference-field";
import { dictionary } from "@/i18n";
import { defaultLocale, type Locale } from "@/i18n/locales";
import { routes } from "@/lib/site";
import { welcomeTitle } from "../greeting";
import { summaryStats } from "../summary";
import { DashboardRecordButton } from "./record-button";
import { RevisitIdeas } from "./revisit-ideas";
import { WorkflowOverview } from "./workflow-overview";

type DashboardViewProps = {
  firstName?: string | null;
  /** The person's latest ideas, newest first. The full list is the library. */
  recentIdeas: IdeaWithReferences[];
  /** Unfinished sermon ideas left alone for a while, chosen and ordered by the server. */
  revisitIdeas?: IdeaRecord[];
  /** The account's venues and contexts, for recording a sermon as preached from here. */
  venues?: readonly ReferenceOption[];
  contexts?: readonly ReferenceOption[];
  /** The interface language. English when omitted. */
  locale?: Locale;
};

/**
 * The dashboard's content: the page's two actions, the latest ideas, and the
 * ones worth returning to. Settings and administration are in the account
 * menu, not here. The summary figures still wait for the phases that produce them.
 */
export function DashboardView({
  firstName,
  recentIdeas,
  revisitIdeas = [],
  venues = [],
  contexts = [],
  locale = defaultLocale,
}: DashboardViewProps) {
  const t = dictionary(locale, "dashboard");
  return (
    <div className="container-page py-10 lg:py-12">
      <PageHeader
        title={welcomeTitle(firstName, locale)}
        description={t.description}
        action={
          <div className="flex flex-wrap items-center gap-3">
            {/* The same form as the preaching record's, opened here; the sermon is chosen in it. */}
            <RecordPreachingProvider venues={venues} contexts={contexts}>
              <DashboardRecordButton />
            </RecordPreachingProvider>
            {/* With no ideas the invitation below has the capture button; never two. */}
            {recentIdeas.length > 0 && <CaptureButton className="max-md:hidden" />}
          </div>
        }
      />

      <div className="mt-8 grid gap-x-6 gap-y-10 lg:grid-cols-3">
        {recentIdeas.length === 0 ? (
          <section
            aria-labelledby="recent-heading"
            className="flex flex-col justify-center rounded-xl border border-dashed border-input px-6 py-10 sm:px-8 lg:col-span-3"
          >
            <h2 id="recent-heading" className="font-display text-2xl leading-snug font-medium">
              {t.empty.title}
            </h2>
            <p className="mt-3 max-w-md text-[0.9375rem] leading-relaxed text-muted-foreground">
              {t.empty.body}
            </p>
            <div className="mt-6">
              <CaptureButton />
            </div>
          </section>
        ) : (
          <section aria-labelledby="recent-heading" className="min-w-0 lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="recent-heading" className="text-lg font-semibold tracking-[-0.015em]">
                {t.recent}
              </h2>
              <Link
                href={routes.sermonIdeas}
                className="group/all inline-flex items-center gap-1.5 rounded-md text-sm font-semibold text-primary link-underline"
              >
                {t.openLibrary}
                <ArrowRight
                  className="size-4 transition-transform duration-150 group-hover/all:translate-x-0.5"
                  aria-hidden
                />
              </Link>
            </div>
            <div className="mt-4">
              <IdeaList ideas={recentIdeas} label={t.recent} locale={locale} />
            </div>
          </section>
        )}

        {/* With nothing active there is nothing to return to: the invitation to capture stands alone. */}
        {recentIdeas.length > 0 && <RevisitIdeas ideas={revisitIdeas} locale={locale} />}
      </div>

      <div className="mt-12 lg:mt-14">
        <WorkflowOverview locale={locale} />
      </div>

      <section aria-labelledby="summary-heading" className="mt-12 lg:mt-14">
        <h2 id="summary-heading" className="text-lg font-semibold tracking-[-0.015em]">
          {t.summary.title}
        </h2>
        <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted-foreground">
          {t.summary.description}
        </p>
        <StatStrip stats={summaryStats(locale)} className="mt-4" />
      </section>
    </div>
  );
}

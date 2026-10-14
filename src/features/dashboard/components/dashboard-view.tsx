import { PageHeader } from "@/components/layout/page-header";
import { StatStrip } from "@/components/ui/stat-strip";
import { CaptureButton } from "@/features/ideas/components/quick-capture";
import type { IdeaRecord, WorkspaceCounts } from "@/features/ideas/ideas";
import { RecordPreachingProvider } from "@/features/preaching/components/record-preaching";
import { OfflineNotice } from "@/features/offline/components/offline-notice";
import { InstallNotice } from "@/features/pwa/components/install-notice";
import { TourInvitation } from "@/features/tour/components/tour-invitation";
import type { ReferenceOption } from "@/features/preaching/components/reference-field";
import type { HistoryItem } from "@/features/preaching/occurrences";
import { dictionary } from "@/i18n";
import { defaultLocale, type Locale } from "@/i18n/locales";
import { welcomeTitle } from "../greeting";
import { summaryStats } from "../summary";
import { ContinueWorking, type WorkInProgress } from "./continue-working";
import { FreshOnReturn } from "./fresh-on-return";
import { DashboardOutlineButton } from "./outline-button";
import { RecentIdeas } from "./recent-ideas";
import { RecentPreaching } from "./recent-preaching";
import { DashboardRecordButton } from "./record-button";
import { RevisitIdeas } from "./revisit-ideas";

type DashboardViewProps = {
  firstName?: string | null;
  /** The sermons being developed now, most recently worked on first, each with its outline if it has one. */
  continueWorking?: WorkInProgress[];
  /** Unfinished sermon ideas left alone for a while, chosen and ordered by the server. */
  revisitIdeas?: IdeaRecord[];
  /** The person's latest ideas of every kind, newest first. The full list is the library. */
  recentIdeas: IdeaRecord[];
  /** The latest occasions on the Preaching Record, most recent first. */
  recentPreaching?: HistoryItem[];
  /** The counts of active ideas, or null when they could not be read. */
  counts?: WorkspaceCounts | null;
  /** Every occasion the account has recorded, ever. */
  timesPreached?: number;
  /** The account's venues and contexts, for recording a sermon as preached from here. */
  venues?: readonly ReferenceOption[];
  contexts?: readonly ReferenceOption[];
  /** The interface language. English when omitted. */
  locale?: Locale;
  /** Whether to invite the account to take the product tour (`shouldOfferTour`). */
  offerTour?: boolean;
};

/**
 * The dashboard: a workspace, in the order a person needs it. The page's
 * actions, the sermons being developed, the unfinished ones left alone, the
 * latest ideas, the latest preaching, and four figures. Everything shown was
 * chosen, ordered, and counted by the server; this only lays it out. Settings
 * and administration are in the account menu, not here.
 *
 * An account with no active idea and nothing preached gets one invitation to
 * capture in place of the sections, never several empty panels. An account
 * with some of it gets the sections it has something for: a section with
 * nothing to say either says so in a line or is left out.
 */
export function DashboardView({
  firstName,
  continueWorking = [],
  revisitIdeas = [],
  recentIdeas,
  recentPreaching = [],
  counts = null,
  timesPreached = 0,
  venues = [],
  contexts = [],
  locale = defaultLocale,
  offerTour = false,
}: DashboardViewProps) {
  const t = dictionary(locale, "dashboard");
  const hasIdeas = recentIdeas.length > 0;
  const empty = !hasIdeas && timesPreached === 0;
  // Preaching is offered a place before any is recorded only where there is a sermon to preach.
  const showPreaching = recentPreaching.length > 0 || (counts?.sermons ?? 0) > 0;

  return (
    <div className="container-page py-10 lg:py-12" data-tour="dashboard-workspace">
      <FreshOnReturn />
      {/* One recording form for the page: the same one as the Preaching Record's, the sermon chosen in it. */}
      <RecordPreachingProvider venues={venues} contexts={contexts}>
        <PageHeader
          title={welcomeTitle(firstName, locale)}
          description={t.description}
          action={
            // With nothing in the workspace the invitation below is the one action.
            !empty && (
              <div className="flex flex-wrap items-center gap-3">
                <DashboardOutlineButton />
                <DashboardRecordButton />
                {/* On a small screen the tab bar has capture; never two. */}
                <CaptureButton className="max-md:hidden" />
              </div>
            )
          }
        />

        {/* An invitation, in the page and not over it: nothing begins until it is taken up. */}
        {/* Installing waits until the tour has been answered: never two invitations at once. */}
        {offerTour ? <TourInvitation /> : <InstallNotice />}
        {/* Captures waiting on this device, always; what works offline, once the tour is answered. */}
        <OfflineNotice introduce={!offerTour} />

        {empty ? (
          <section
            aria-labelledby="start-heading"
            className="mt-8 rounded-xl border border-dashed border-input px-6 py-10 sm:px-8"
          >
            <h2 id="start-heading" className="font-display text-2xl leading-snug font-medium">
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
          // One grid, so the panels are as far apart down the page as they are across it.
          <div className="mt-8 grid gap-6 lg:grid-cols-3">
            {/* With no active idea there is nothing to continue or return to. */}
            {hasIdeas && (
              <>
                <ContinueWorking
                  items={continueWorking}
                  locale={locale}
                  className="lg:col-span-2"
                />
                <RevisitIdeas ideas={revisitIdeas} locale={locale} />
                <RecentIdeas
                  ideas={recentIdeas}
                  locale={locale}
                  className={showPreaching ? "lg:col-span-2" : "lg:col-span-3"}
                />
              </>
            )}
            {showPreaching && (
              <RecentPreaching
                items={recentPreaching}
                locale={locale}
                className={hasIdeas ? undefined : "lg:col-span-3"}
              />
            )}
          </div>
        )}
      </RecordPreachingProvider>

      <section aria-labelledby="summary-heading" data-tour="at-a-glance" className="mt-10">
        <h2 id="summary-heading" className="text-lg font-semibold tracking-[-0.015em]">
          {t.summary.title}
        </h2>
        <StatStrip
          stats={summaryStats(counts, timesPreached, locale)}
          unavailable={t.summary.unavailable}
          className="mt-4"
        />
      </section>
    </div>
  );
}

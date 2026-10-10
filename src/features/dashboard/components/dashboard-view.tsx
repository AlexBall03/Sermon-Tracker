import Link from "next/link";
import { ArrowRight, Settings, ShieldCheck } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { StatStrip } from "@/components/ui/stat-strip";
import { IdeaList } from "@/features/ideas/components/idea-list";
import { CaptureButton } from "@/features/ideas/components/quick-capture";
import type { IdeaWithReferences } from "@/features/ideas/ideas";
import { routes } from "@/lib/site";
import { welcomeTitle } from "../greeting";
import { summaryStats } from "../summary";
import { ShortcutLink } from "./shortcut-link";
import { WorkflowOverview } from "./workflow-overview";

type DashboardViewProps = {
  firstName?: string | null;
  /** Decided on the server from the database; it only chooses what to show. */
  isAdmin: boolean;
  /** The person's latest ideas, newest first. The full list is the library. */
  recentIdeas: IdeaWithReferences[];
};

/**
 * The dashboard's content: the latest ideas, the way in to capture, and
 * shortcuts. The summary figures still wait for the phases that produce them.
 */
export function DashboardView({ firstName, isAdmin, recentIdeas }: DashboardViewProps) {
  return (
    <div className="container-page py-10 lg:py-12">
      <PageHeader
        title={welcomeTitle(firstName)}
        description="Your workspace for sermon ideas, and for the points that build them."
      />

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        {recentIdeas.length === 0 ? (
          <section
            aria-labelledby="recent-heading"
            className="flex flex-col justify-center rounded-xl border border-dashed border-input px-6 py-10 sm:px-8 lg:col-span-2"
          >
            <h2 id="recent-heading" className="font-display text-2xl leading-snug font-medium">
              No ideas yet
            </h2>
            <p className="mt-3 max-w-md text-[0.9375rem] leading-relaxed text-muted-foreground">
              Capture the first thought worth keeping. A line is enough, and you can decide later
              whether it is a sermon or a point.
            </p>
            <div className="mt-6">
              <CaptureButton />
            </div>
          </section>
        ) : (
          <section aria-labelledby="recent-heading" className="min-w-0 lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="recent-heading" className="text-lg font-semibold tracking-[-0.015em]">
                Recent ideas
              </h2>
              <CaptureButton size="sm" className="max-md:hidden" />
            </div>
            <div className="mt-4">
              <IdeaList ideas={recentIdeas} label="Recent ideas" />
            </div>
            <Link
              href={routes.library}
              className="group/all mt-4 inline-flex items-center gap-1.5 rounded-md text-sm font-semibold text-primary link-underline"
            >
              Open the library
              <ArrowRight
                className="size-4 transition-transform duration-150 group-hover/all:translate-x-0.5"
                aria-hidden
              />
            </Link>
          </section>
        )}

        <nav aria-label="Shortcuts" className="grid content-start gap-4">
          <ShortcutLink
            href={routes.settings}
            icon={Settings}
            title="Account settings"
            description="Your name, email, password, and how the app looks."
          />
          {isAdmin && (
            <ShortcutLink
              href={routes.admin}
              icon={ShieldCheck}
              title="Administration"
              description="Invite people, and manage roles and access."
            />
          )}
        </nav>
      </div>

      <div className="mt-12 lg:mt-14">
        <WorkflowOverview />
      </div>

      <section aria-labelledby="summary-heading" className="mt-12 lg:mt-14">
        <h2 id="summary-heading" className="text-lg font-semibold tracking-[-0.015em]">
          At a glance
        </h2>
        <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted-foreground">
          A short summary of your work will sit here. Its figures arrive with the preaching record,
          so none are shown yet.
        </p>
        <StatStrip stats={summaryStats} className="mt-4" />
      </section>
    </div>
  );
}

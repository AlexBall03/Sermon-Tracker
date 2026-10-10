import { Settings, ShieldCheck } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { StatStrip } from "@/components/ui/stat-strip";
import { routes } from "@/lib/site";
import { welcomeTitle } from "../greeting";
import { summaryStats } from "../summary";
import { ShortcutLink } from "./shortcut-link";
import { WorkflowOverview } from "./workflow-overview";

type DashboardViewProps = {
  firstName?: string | null;
  /** Decided on the server from the database; it only chooses what to show. */
  isAdmin: boolean;
};

/** The dashboard's content. It holds no data of its own yet, and invents none. */
export function DashboardView({ firstName, isAdmin }: DashboardViewProps) {
  return (
    <div className="container-page py-10 lg:py-12">
      <PageHeader
        title={welcomeTitle(firstName)}
        description="Your workspace for sermon ideas, and for the points that build them."
      />

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <section
          aria-labelledby="recent-heading"
          className="flex flex-col justify-center rounded-xl border border-dashed border-input px-6 py-10 sm:px-8 lg:col-span-2"
        >
          <h2 id="recent-heading" className="font-display text-2xl leading-snug font-medium">
            No ideas yet
          </h2>
          <p className="mt-3 max-w-md text-[0.9375rem] leading-relaxed text-muted-foreground">
            Your most recent ideas will be listed here once the idea library opens. Until then there
            is nothing for you to do, and nothing you can miss.
          </p>
        </section>

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
          A short summary of your work will sit here. There is nothing to count yet, so no figures
          are shown.
        </p>
        <StatStrip stats={summaryStats} className="mt-4" />
      </section>
    </div>
  );
}

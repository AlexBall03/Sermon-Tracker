import type { Metadata } from "next";
import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { ArrowRight } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { requireActiveUser } from "@/features/auth/access";
import { routes } from "@/lib/site";

export const metadata: Metadata = { title: "Dashboard" };

/** Placeholder home for signed-in users. The real dashboard is Phase 1C. */
export default async function DashboardPage() {
  const user = await requireActiveUser();
  const identity = await currentUser();
  const name = identity?.firstName || identity?.fullName;

  return (
    <div className="container-page py-10 lg:py-12">
      <PageHeader
        title={name ? `Welcome, ${name}` : "Welcome"}
        description="Your account is set up and ready."
      />

      {/* Empty state for the space the dashboard will fill. */}
      <section className="mt-8 rounded-xl border border-dashed border-input px-6 py-12 text-center sm:py-16">
        <h2 className="font-display text-2xl leading-snug font-medium">Nothing to show yet</h2>
        <p className="mx-auto mt-3 max-w-md text-[0.9375rem] leading-relaxed text-muted-foreground">
          The dashboard arrives in the next phase, followed by the idea library and quick capture.
          Your ideas will appear here once they do.
        </p>
      </section>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <section className="rounded-xl border bg-surface p-6 shadow-card">
          <h2 className="text-[0.9375rem] font-semibold">Your account</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Change your name, password, or connected Google account from the account menu in the top
            bar.
          </p>
        </section>

        {user.role === "admin" && (
          <section className="rounded-xl border bg-surface p-6 shadow-card">
            <h2 className="text-[0.9375rem] font-semibold">Administration</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Invite people, and manage roles and account access.
            </p>
            <Link
              href={routes.admin}
              className={buttonVariants({ variant: "outline", size: "sm", className: "mt-5" })}
            >
              Open administration
              <ArrowRight />
            </Link>
          </section>
        )}
      </div>
    </div>
  );
}

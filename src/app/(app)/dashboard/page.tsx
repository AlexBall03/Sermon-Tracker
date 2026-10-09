import type { Metadata } from "next";
import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { ArrowRight } from "lucide-react";

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
    <div className="container-page py-12 lg:py-16">
      <p className="text-xs font-semibold tracking-[0.24em] text-primary uppercase">Dashboard</p>
      <h1 className="mt-4 font-display text-4xl leading-[1.1] font-semibold tracking-tight sm:text-5xl">
        {name ? `Welcome, ${name}` : "Welcome"}
      </h1>
      <p className="mt-4 max-w-xl text-lg text-muted-foreground">
        Your account is set up. The dashboard itself arrives in the next phase, followed by the idea
        library and quick capture.
      </p>

      <div className="mt-10 grid gap-5 md:grid-cols-2">
        <section className="rounded-xl border bg-surface p-6 shadow-card">
          <h2 className="text-base font-semibold">Your account</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Change your name, password, or connected Google account from the account menu in the top
            bar.
          </p>
        </section>

        {user.role === "admin" && (
          <section className="rounded-xl border bg-surface p-6 shadow-card">
            <h2 className="text-base font-semibold">Administration</h2>
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

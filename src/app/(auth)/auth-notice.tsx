import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { routes } from "@/lib/site";

type AuthNoticeProps = {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
  /** Replaces the default "Back to home" link. */
  actions?: React.ReactNode;
};

/** The card used by the auth shell whenever there is a message instead of a form. */
export function AuthNotice({ eyebrow, title, children, actions }: AuthNoticeProps) {
  return (
    <div className="rounded-xl border bg-surface p-8 text-center shadow-raised sm:p-10">
      <p className="text-[0.8125rem] font-semibold text-primary">{eyebrow}</p>
      <h1 className="mt-3 font-display text-[1.75rem] leading-tight font-medium tracking-[-0.01em] text-balance">
        {title}
      </h1>
      <p className="mt-4 text-[0.9375rem] leading-relaxed text-muted-foreground">{children}</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        {actions ?? (
          <Link href={routes.home} className={buttonVariants({ variant: "outline" })}>
            <ArrowLeft />
            Back to home
          </Link>
        )}
      </div>
    </div>
  );
}

/** Holds the space of Clerk's form while it loads, so the page does not jump. */
export function AuthFormFallback() {
  return (
    <div
      role="status"
      className="h-[23rem] animate-pulse rounded-xl border bg-surface shadow-raised"
    >
      <span className="sr-only">Loading</span>
    </div>
  );
}

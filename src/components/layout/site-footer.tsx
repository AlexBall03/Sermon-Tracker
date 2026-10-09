import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { routes, siteConfig } from "@/lib/site";

// Resolved once per build, which keeps the footer fully static.
const year = new Date().getFullYear();

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="container-page flex flex-col gap-6 py-10 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-3">
          <Logo markClassName="size-7" />
          <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
            {siteConfig.tagline}
          </p>
        </div>
        <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:items-end">
          <nav aria-label="Footer">
            <Link
              href={routes.signIn}
              className="rounded-sm underline-offset-4 transition-colors duration-200 hover:text-foreground hover:underline"
            >
              Sign in
            </Link>
          </nav>
          <p>
            {year} {siteConfig.name}
          </p>
        </div>
      </div>
    </footer>
  );
}

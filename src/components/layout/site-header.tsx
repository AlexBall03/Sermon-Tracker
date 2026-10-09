import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { buttonVariants } from "@/components/ui/button";
import { routes } from "@/lib/site";
import { ThemeToggle } from "./theme-toggle";

export function SiteHeader() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-6">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between rounded-2xl glass pr-2.5 pl-3.5 shadow-sm">
        <Link href={routes.home} className="rounded-lg" aria-label="Sermon Tracker home">
          <Logo />
        </Link>
        <nav aria-label="Primary" className="flex items-center gap-1.5">
          <ThemeToggle />
          <Link href={routes.signIn} className={buttonVariants({ size: "sm" })}>
            Sign in
          </Link>
        </nav>
      </div>
    </header>
  );
}

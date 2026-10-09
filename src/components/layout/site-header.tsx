import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { buttonVariants } from "@/components/ui/button";
import { routes } from "@/lib/site";
import { MobileNav } from "./mobile-nav";
import { ThemeToggle } from "./theme-toggle";

const sectionLinks = [
  { href: "#capabilities", label: "How it works" },
  { href: "#preview", label: "Library" },
  { href: "#beta", label: "Beta access" },
] as const;

/** Fixed, full-width glass bar. Shells that render it must offset `main` by `pt-16`. */
export function SiteHeader() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b glass">
      <div className="container-page flex h-16 items-center justify-between gap-6">
        <Link href={routes.home} className="rounded-md" aria-label="Sermon Tracker home">
          <Logo />
        </Link>

        <nav
          aria-label="Primary"
          className="hidden flex-1 items-center justify-between gap-6 md:flex"
        >
          <ul className="flex items-center gap-1 lg:pl-4">
            {sectionLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors duration-200 hover:bg-accent hover:text-foreground"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link href={routes.signIn} className={buttonVariants({ size: "sm" })}>
              Sign in
            </Link>
          </div>
        </nav>

        <MobileNav links={sectionLinks} />
      </div>
    </header>
  );
}

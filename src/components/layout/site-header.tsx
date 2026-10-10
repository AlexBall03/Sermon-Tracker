import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { routes } from "@/lib/site";
import { HomeLink } from "./home-link";
import { MobileNav } from "./mobile-nav";
import { ThemeToggle } from "./theme-toggle";

const sectionLinks = [
  { href: "#capabilities", label: "How it works" },
  { href: "#preview", label: "Library" },
  { href: "#beta", label: "Beta access" },
] as const;

/**
 * Fixed, full-width glass bar. Clear at the very top of the page, glass once
 * content scrolls under it. Shells that render it must offset `main` by `pt-bar`.
 */
export function SiteHeader() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 glass-settle border-b glass has-[[data-nav-panel]]:animate-none has-[[data-nav-panel]]:bg-surface-raised">
      <div className="container-page flex h-bar items-center justify-between gap-8">
        <HomeLink />

        <nav
          aria-label="Primary"
          className="hidden flex-1 items-center justify-between gap-6 md:flex"
        >
          <ul className="flex items-center gap-0.5">
            {sectionLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="rounded-md px-2.5 py-1.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground active:bg-foreground/10"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-2.5">
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

import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { routes, siteConfig } from "@/lib/site";

// Resolved once per build, which keeps the footer fully static.
const year = new Date().getFullYear();

const links = [
  { href: "/#capabilities", label: "How it works" },
  { href: "/#preview", label: "Library" },
  { href: "/#beta", label: "Beta access" },
  { href: routes.signIn, label: "Sign in" },
] as const;

const linkClassName =
  "block rounded-md px-2.5 py-1.5 whitespace-nowrap text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground active:bg-foreground/10 pointer-coarse:py-3";

/**
 * Two rows: the lockup with a line saying what the product is, beside the
 * page's links; then a hairline and the small print.
 */
export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="container-page pt-11 pb-8 lg:pt-14">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Logo markClassName="size-8" textClassName="text-[1.3125rem]" />
            <p className="mt-3.5 max-w-[19rem] text-sm leading-relaxed text-pretty text-muted-foreground">
              {siteConfig.blurb}
            </p>
          </div>
          <nav aria-label="Footer">
            {/* Negative margins keep the first link's text on the container edge. */}
            <ul className="-mx-2.5 -my-1.5 flex flex-wrap gap-x-1 text-sm font-medium">
              {links.map((link) => (
                <li key={link.href}>
                  {link.href.includes("#") ? (
                    // A plain anchor: next/link does not scroll again to a hash already in the URL.
                    <a href={link.href} className={linkClassName}>
                      {link.label}
                    </a>
                  ) : (
                    <Link href={link.href} className={linkClassName}>
                      {link.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="mt-9 flex flex-col gap-2 border-t pt-6 text-[0.8125rem] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            <p className="tabular-nums">
              {year} {siteConfig.name}
            </p>
            <span aria-hidden className="hidden h-3.5 w-px bg-border sm:block" />
            <p>
              Developed by:{" "}
              <a
                href={siteConfig.developer.url}
                target="_blank"
                rel="noopener noreferrer"
                // Always underlined, in a transparent colour: the line then fades in
                // with the text colour instead of appearing at once.
                className="rounded-sm font-medium text-foreground underline decoration-transparent underline-offset-4 transition-colors duration-150 hover:text-primary hover:decoration-primary"
              >
                {siteConfig.developer.name}
              </a>
            </p>
          </div>
          <p className="flex items-center gap-2">
            <span aria-hidden className="size-1.5 rounded-full bg-primary" />
            Invitation-only beta
          </p>
        </div>
      </div>
    </footer>
  );
}

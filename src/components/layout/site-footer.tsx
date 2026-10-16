import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { dictionary } from "@/i18n";
import { defaultLocale, type Locale } from "@/i18n/locales";
import { routes, siteConfig } from "@/lib/site";
import { GuestLanguage } from "./guest-language";

// Resolved once per build, which keeps the year from changing between server and browser.
const year = new Date().getFullYear();

const linkClassName =
  "block rounded-md px-2.5 py-1.5 whitespace-nowrap text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground active:bg-foreground/10 pointer-coarse:py-3";

/**
 * Two rows: the lockup with a line saying what the product is, beside the
 * page's links; then a hairline and the small print, with the choice of
 * language where there is one to make.
 */
export function SiteFooter({
  locale = defaultLocale,
  languageChoice = false,
}: {
  locale?: Locale;
  /** Offer English and Spanish: not while Spanish is switched off. */
  languageChoice?: boolean;
}) {
  const t = dictionary(locale, "marketing");
  const links = [
    { href: "/#how-it-works", label: t.nav.how },
    { href: "/#features", label: t.nav.features },
    { href: "/#mobile-app", label: t.nav.mobile },
    { href: routes.contact, label: t.nav.contact },
    { href: routes.signIn, label: t.nav.signIn },
    { href: routes.signUp, label: t.nav.getStarted },
  ];

  return (
    <footer className="border-t">
      <div className="container-page pt-11 pb-8 lg:pt-14">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Logo markClassName="size-8" textClassName="text-[1.3125rem]" />
            <p className="mt-3.5 max-w-[19rem] text-sm leading-relaxed text-pretty text-muted-foreground">
              {t.footer.blurb}
            </p>
          </div>
          <nav aria-label={t.nav.footer}>
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

        <div className="mt-9 flex flex-col gap-x-6 gap-y-3 border-t pt-6 text-[0.8125rem] text-muted-foreground sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            <p className="tabular-nums">
              {year} {siteConfig.name}
            </p>
            <span aria-hidden className="hidden h-3.5 w-px bg-border sm:block" />
            <p>
              {t.footer.developedBy}{" "}
              <a
                href={siteConfig.developer.url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-sm font-medium text-foreground link-underline hover:text-primary"
              >
                {siteConfig.developer.name}
              </a>
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            {languageChoice && (
              <GuestLanguage current={locale} label={t.nav.language} className="-mx-2.5" />
            )}
            <p className="flex items-center gap-2">
              <span aria-hidden className="size-1.5 rounded-full bg-primary" />
              {t.footer.status}
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}

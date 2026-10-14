import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { dictionary } from "@/i18n";
import { defaultLocale, type Locale } from "@/i18n/locales";
import { routes } from "@/lib/site";
import { HomeLink } from "./home-link";
import { MobileNav } from "./mobile-nav";
import { SectionLinks } from "./section-links";
import { ThemeToggle } from "./theme-toggle";

/** The landing page's sections, in the order they come. The ids are the sections' own. */
export const siteSections = ["how", "features", "mobile"] as const;
const sectionIds = { features: "features", how: "how-it-works", mobile: "mobile-app" } as const;

/**
 * Fixed, full-width glass bar. Clear at the very top of the page, glass once
 * content scrolls under it. Shells that render it must offset `main` by `pt-bar`.
 */
export function SiteHeader({ locale = defaultLocale }: { locale?: Locale }) {
  const t = dictionary(locale, "marketing").nav;
  const links = siteSections.map((key) => ({ href: `#${sectionIds[key]}`, label: t[key] }));
  const labels = { primary: t.primary, signIn: t.signIn, open: t.openMenu, close: t.closeMenu };

  return (
    <header className="fixed inset-x-0 top-0 z-50 glass-settle border-b glass has-[[data-nav-panel]]:animate-none has-[[data-nav-panel]]:bg-surface-raised">
      <div className="container-page flex h-bar items-center justify-between gap-8">
        <HomeLink label={t.home} />

        <nav
          aria-label={t.primary}
          className="hidden flex-1 items-center justify-between gap-6 md:flex"
        >
          <SectionLinks links={links} />
          <div className="flex items-center gap-2.5">
            <ThemeToggle />
            <Link href={routes.signIn} className={buttonVariants({ size: "sm" })}>
              {t.signIn}
            </Link>
          </div>
        </nav>

        <MobileNav links={links} labels={labels} />
      </div>
    </header>
  );
}

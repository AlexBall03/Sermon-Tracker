import Link from "next/link";
import { BookMarked, History, Lightbulb } from "lucide-react";

import { BackLink } from "@/components/layout/back-link";
import { PageHeader } from "@/components/layout/page-header";
import { dictionary } from "@/i18n";
import { defaultLocale, type Locale } from "@/i18n/locales";
import { routes } from "@/lib/site";

/**
 * The library's sections, in the order they are always shown. `tour` is the
 * name the product tour points a section's link out by (`data-tour`).
 */
export const librarySections = [
  { key: "ideas", href: routes.sermonIdeas, icon: Lightbulb, tour: "section-sermon-ideas" },
  {
    key: "scripture",
    href: routes.savedScripture,
    icon: BookMarked,
    tour: "section-saved-scripture",
  },
  { key: "history", href: routes.preachingRecord, icon: History, tour: "section-preaching-record" },
] as const;

export type LibrarySection = (typeof librarySections)[number]["key"];

/**
 * The way between the library's sections: the ideas, the Scripture that was
 * saved while reading, and the record of what has been preached. It is on
 * each section's page and marks the one being shown. The overview
 * (`/library`) offers the same three as cards instead, and marks none. Each
 * section keeps its own search and filters in its own address.
 */
export function LibrarySections({
  current,
  locale = defaultLocale,
}: {
  current: LibrarySection;
  /** The interface language. English when omitted. */
  locale?: Locale;
}) {
  const t = dictionary(locale, "library").sections;
  return (
    <nav aria-label={t.label} className="mt-4 flex flex-wrap gap-1">
      {librarySections.map(({ key, href, icon: Icon, tour }) => (
        <Link
          key={key}
          href={href}
          aria-current={key === current ? "page" : undefined}
          data-tour={tour}
          className="flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground active:bg-foreground/10 aria-[current=page]:bg-primary-soft aria-[current=page]:font-semibold aria-[current=page]:text-primary pointer-coarse:h-11"
        >
          <Icon className="size-4" aria-hidden />
          {t[key]}
        </Link>
      ))}
    </nav>
  );
}

/**
 * The head of a library section's page, the same on all three: the way back
 * to the library, the section's own title and what it is for, its main action
 * if it has one, then the way to the other sections.
 */
export function LibrarySectionHeader({
  section,
  action,
  locale = defaultLocale,
}: {
  section: LibrarySection;
  /** The section's one main action. Not every section has one. */
  action?: React.ReactNode;
  /** The interface language. English when omitted. */
  locale?: Locale;
}) {
  const t = dictionary(locale, "library");
  return (
    <>
      <BackLink href={routes.library}>{t.back}</BackLink>
      <PageHeader
        title={t.sections[section]}
        description={t.descriptions[section]}
        action={action}
      />
      <LibrarySections current={section} locale={locale} />
    </>
  );
}

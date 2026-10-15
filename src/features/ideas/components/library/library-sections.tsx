import { BookMarked, History, Lightbulb } from "lucide-react";

import { BackLink } from "@/components/layout/back-link";
import { PageHeader } from "@/components/layout/page-header";
import { dictionary } from "@/i18n";
import { defaultLocale, type Locale } from "@/i18n/locales";
import { routes } from "@/lib/site";

/**
 * The library's sections, in the order they are always shown. `tour` is the
 * name the product tour points a section's page out by (`data-tour`).
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
 * The head of a library section's page, the same on all three: the way back
 * to the library, then the section's own title and what it is for, with its
 * main action if it has one. There is no way across to the other sections
 * here: they are chosen on the overview (`/library`), which "Back to Library"
 * leads to.
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
  const tour = librarySections.find(({ key }) => key === section)?.tour;
  return (
    <>
      <BackLink href={routes.library}>{t.back}</BackLink>
      <div data-tour={tour}>
        <PageHeader
          title={t.sections[section]}
          description={t.descriptions[section]}
          action={action}
        />
      </div>
    </>
  );
}

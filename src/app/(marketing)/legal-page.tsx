import Link from "next/link";

import { sectionLead, sectionTitle } from "@/components/marketing/sections/shared";
import { getLocale, getT } from "@/i18n/server";
import { formatDate } from "@/lib/format";
import { routes } from "@/lib/site";

/** When the Privacy Policy and the Terms last changed. Change it with their words. */
export const legalUpdated = new Date("2026-10-16T12:00:00Z");

/**
 * The Privacy Policy or the Terms of Service, in the visitor's language: a
 * title, an introduction, and numbered sections, as readable text and nothing
 * more. Rendered per request, as the contact page is, for the language.
 */
export async function LegalPage({ document }: { document: "privacy" | "terms" }) {
  const [t, locale] = await Promise.all([getT("legal"), getLocale()]);
  const page = t[document];
  return (
    <article className="container-page max-w-3xl py-14 sm:py-20">
      <h1 className={sectionTitle}>{page.title}</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        {t.updatedLabel}:{" "}
        <time dateTime={legalUpdated.toISOString().slice(0, 10)}>
          {formatDate(legalUpdated, locale)}
        </time>
      </p>
      <p className={sectionLead}>{page.intro}</p>

      <div className="mt-10 space-y-9">
        {page.sections.map((section, index) => (
          <section key={section.heading} aria-labelledby={`${document}-${index}`}>
            <h2
              id={`${document}-${index}`}
              className="font-display text-xl font-medium tracking-[-0.01em]"
            >
              {section.heading}
            </h2>
            <div className="mt-3 space-y-3 text-[0.9375rem] leading-relaxed text-muted-foreground">
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </section>
        ))}
      </div>

      <p className="mt-12 border-t pt-6 text-sm text-muted-foreground">
        {t.contactPrompt}{" "}
        <Link href={routes.contact} className="font-medium text-primary link-underline">
          {t.contactLink}
        </Link>
      </p>
    </article>
  );
}

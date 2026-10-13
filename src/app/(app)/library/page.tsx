import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { requireActiveUser } from "@/features/auth/access";
import { librarySections } from "@/features/ideas/components/library/library-sections";
import {
  libraryHref,
  parseLibraryQuery,
  type LibrarySearchParams,
} from "@/features/ideas/library-query";
import { dictionary } from "@/i18n";
import { getLocale } from "@/i18n/server";
import { routes } from "@/lib/site";

export async function generateMetadata(): Promise<Metadata> {
  return { title: dictionary(await getLocale(), "library").title };
}

/**
 * The library's overview: the way in to its three sections, and nothing that
 * needs a query. It is where the main navigation and every section's "Back to
 * Library" lead. No section is marked as the current one here, and there is
 * no action of its own: the work is done in a section.
 *
 * The ideas used to be listed at this address, with their search and filters
 * in it. An address that still asks for some of them is sent on to Sermon
 * Ideas with the same query, read through `library-query.ts` like any other;
 * one that asks for nothing stays here.
 */
export default async function LibraryPage({
  searchParams,
}: {
  searchParams?: Promise<LibrarySearchParams>;
} = {}) {
  await requireActiveUser();
  const asked = libraryHref(parseLibraryQuery(await searchParams));
  if (asked !== routes.sermonIdeas) redirect(asked);

  const t = dictionary(await getLocale(), "library");

  return (
    <div className="container-page py-10 lg:py-12">
      <PageHeader title={t.title} description={t.description} />
      <nav aria-label={t.sections.label} className="mt-8">
        <ul className="grid gap-4 md:grid-cols-3">
          {librarySections.map(({ key, href, icon: Icon }) => (
            <li key={key}>
              <Link
                href={href}
                className="group/section flex h-full items-start gap-4 rounded-xl border bg-surface p-5 shadow-card transition-[border-color,background-color] duration-150 hover:border-primary/70 active:bg-foreground/5 md:flex-col md:p-6"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-secondary text-foreground">
                  <Icon className="size-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 font-display text-xl leading-snug font-medium">
                    {t.sections[key]}
                    <ArrowRight
                      className="size-4 shrink-0 text-muted-foreground transition-[color,translate] duration-150 group-hover/section:translate-x-0.5 group-hover/section:text-primary"
                      aria-hidden
                    />
                  </span>
                  <span className="mt-1.5 block text-sm leading-relaxed text-muted-foreground">
                    {t.overview[key]}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

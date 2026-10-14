import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { BackLink } from "@/components/layout/back-link";
import { dictionary } from "@/i18n";
import { defaultLocale, type Locale } from "@/i18n/locales";
import { routes } from "@/lib/site";
import { settingsCategories } from "../categories";

type SettingsPageHeaderProps = {
  title: string;
  description: string;
  /** The interface language. English when omitted. */
  locale?: Locale;
};

/**
 * The head of a settings category's page: below `lg` the way back to the
 * overview (above it, the sidebar is that way), then the category's title and
 * what it is for.
 */
export function SettingsPageHeader({
  title,
  description,
  locale = defaultLocale,
}: SettingsPageHeaderProps) {
  return (
    <header className="mb-8">
      <div className="lg:hidden">
        <BackLink href={routes.settings}>{dictionary(locale, "settings").nav.back}</BackLink>
      </div>
      <h1 className="font-display text-[1.75rem] leading-tight font-medium tracking-[-0.015em] sm:text-[2rem]">
        {title}
      </h1>
      <p className="mt-2 max-w-2xl text-[0.9375rem] leading-relaxed text-muted-foreground">
        {description}
      </p>
    </header>
  );
}

/**
 * Every category as a card that leads to its page: the overview's content. It
 * is how a phone reaches a category, and from `lg` up sits beside the sidebar.
 */
export function SettingsCategoryList({ locale = defaultLocale }: { locale?: Locale }) {
  const t = dictionary(locale, "settings");
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {settingsCategories.map((category) => {
        const Icon = category.icon;
        const words = t.categories[category.key];
        return (
          <li key={category.key}>
            <Link
              href={category.href}
              className="group flex h-full min-h-16 items-center gap-4 rounded-xl border bg-surface p-4 shadow-card transition-[border-color,box-shadow,background-color] duration-150 hover:border-foreground/20 hover:shadow-raised active:bg-accent"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-foreground">
                <Icon className="size-[1.125rem]" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-[0.9375rem] font-semibold">
                  {words.title}
                </span>
                <span className="mt-0.5 block text-sm leading-snug text-muted-foreground">
                  {words.description}
                </span>
              </span>
              <ChevronRight
                className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-foreground"
                aria-hidden
              />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

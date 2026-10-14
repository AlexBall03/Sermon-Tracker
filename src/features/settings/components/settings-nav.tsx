"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useT } from "@/i18n/client";
import { settingsCategories } from "../categories";

/**
 * The way between settings' categories, beside every settings page from `lg`
 * up. It marks the category being shown, and none on the overview. Below `lg`
 * the overview's list takes its place, and each page has a way back to it.
 */
export function SettingsNav() {
  const t = useT("settings");
  const pathname = usePathname();
  return (
    <nav aria-label={t.nav.label}>
      <ul className="space-y-0.5">
        {settingsCategories.map((category) => {
          const Icon = category.icon;
          const current = pathname === category.href || pathname.startsWith(`${category.href}/`);
          return (
            <li key={category.key}>
              <Link
                href={category.href}
                aria-current={current ? "page" : undefined}
                className="relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors duration-150 before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-primary before:opacity-0 before:transition-opacity hover:bg-accent hover:text-foreground active:bg-foreground/10 aria-[current=page]:bg-accent aria-[current=page]:font-semibold aria-[current=page]:text-foreground aria-[current=page]:before:opacity-100"
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{t.categories[category.key].title}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

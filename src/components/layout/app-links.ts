import { BookOpen, LayoutDashboard, LibraryBig, ListTree, type LucideIcon } from "lucide-react";

import { dictionary, type Dictionaries } from "@/i18n";
import { defaultLocale } from "@/i18n/locales";
import { routes } from "@/lib/site";

export type AppLink = { href: string; label: string; icon: LucideIcon };

/**
 * The application's main destinations, in order. One list feeds the desktop
 * link row and the small-screen tab bar, so a destination is added here once,
 * when its page exists. Outlines is the overview of outlines (Phase 3C); the
 * editor of one outline is beneath it and is not a destination. With quick
 * capture the tab bar is now five, which is as many as it holds.
 *
 * Administration is not a destination: administrators reach it from the
 * account menu, with settings.
 *
 * A destination's name comes from the navigation dictionary, in the language
 * given; add the new name there, in both languages, with the destination.
 */
export function appLinks(
  labels: Pick<
    Dictionaries["navigation"],
    "dashboard" | "library" | "outlines" | "bible"
  > = dictionary(defaultLocale, "navigation"),
): AppLink[] {
  return [
    { href: routes.dashboard, label: labels.dashboard, icon: LayoutDashboard },
    { href: routes.library, label: labels.library, icon: LibraryBig },
    { href: routes.outlines, label: labels.outlines, icon: ListTree },
    { href: routes.bible, label: labels.bible, icon: BookOpen },
  ];
}

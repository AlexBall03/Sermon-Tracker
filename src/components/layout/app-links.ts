import { BookOpen, LayoutDashboard, LibraryBig, type LucideIcon } from "lucide-react";

import { routes } from "@/lib/site";

export type AppLink = { href: string; label: string; icon: LucideIcon };

/**
 * The application's main destinations, in order. One list feeds the desktop
 * link row and the small-screen tab bar, so a destination is added here once,
 * when its page exists. The outline builder takes a
 * place here when it is built; keep the tab bar to five with quick capture.
 *
 * Administration is not a destination: administrators reach it from the
 * account menu, with settings.
 */
export function appLinks(): AppLink[] {
  return [
    { href: routes.dashboard, label: "Dashboard", icon: LayoutDashboard },
    { href: routes.library, label: "Library", icon: LibraryBig },
    { href: routes.bible, label: "Bible", icon: BookOpen },
  ];
}

import { LayoutDashboard, ShieldCheck, type LucideIcon } from "lucide-react";

import { routes } from "@/lib/site";

export type AppLink = { href: string; label: string; icon: LucideIcon };

/**
 * The application's destinations for a role, in order. One list feeds the
 * desktop link row and the small-screen tab bar, so a destination is added
 * here once, when its page exists. Hiding a link is presentation; the pages
 * enforce access.
 */
export function appLinks(isAdmin: boolean): AppLink[] {
  return [
    { href: routes.dashboard, label: "Dashboard", icon: LayoutDashboard },
    ...(isAdmin ? [{ href: routes.admin, label: "Admin", icon: ShieldCheck }] : []),
  ];
}

/**
 * A tab bar with a single tab is noise, so it appears once there are two
 * destinations. The shell uses this to leave room for it below the page.
 */
export function showsTabBar(isAdmin: boolean) {
  return appLinks(isAdmin).length > 1;
}

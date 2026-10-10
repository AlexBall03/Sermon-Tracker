"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Plus, Settings, ShieldCheck } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useQuickCapture } from "@/features/ideas/components/quick-capture";
import { routes } from "@/lib/site";
import { AccountMenu, useAccountActions, useAccountIdentity } from "./account-menu";
import { appLinks, type AppLink } from "./app-links";
import { ThemeToggle } from "./theme-toggle";
import { row, useNavPanel } from "./use-nav-panel";

type IsCurrent = (href: string) => boolean;

/**
 * Application bar: the same fixed, full-width glass bar as the public header.
 * Shells that render it must offset `main` by `pt-bar`. Quick capture sits
 * before the account button; the theme lives in the account menu.
 *
 * Below `md` the bar keeps only the logo and the account button. Destinations
 * and quick capture move to the tab bar at the foot of the screen, and everything about the
 * account (settings, administration, theme, sign out) opens from the avatar.
 */
export function AppHeader({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const capture = useQuickCapture();
  const links = appLinks();
  const isCurrent: IsCurrent = (href) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-50 glass-settle border-b glass has-[[data-nav-panel]]:animate-none has-[[data-nav-panel]]:bg-surface-raised">
        <div className="container-page flex h-bar items-center justify-between gap-8">
          <Link
            href={routes.dashboard}
            className="flex items-center rounded-md transition-opacity duration-150 hover:opacity-80"
            aria-label="Sermon Tracker dashboard"
          >
            <Logo />
          </Link>

          <nav
            aria-label="Application"
            className="hidden flex-1 items-center justify-between gap-6 md:flex"
          >
            <ul className="flex items-center gap-0.5">
              {links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={isCurrent(link.href) ? "page" : undefined}
                    // The current page carries a short emerald rule just beneath its label.
                    className="relative rounded-md px-2.5 py-1.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors duration-150 after:absolute after:inset-x-2.5 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary after:opacity-0 after:transition-opacity after:duration-150 hover:bg-accent hover:text-foreground active:bg-foreground/10 aria-[current=page]:text-foreground aria-[current=page]:after:opacity-100"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="flex items-center gap-3">
              {/*
               * A sibling of the account button: same height, hairline, and hover. Only the
               * plus is emerald. A ring of light breathes around it, slowly, to say where a
               * thought goes; on hover the border and a soft halo ease in and the plus turns.
               */}
              <button
                type="button"
                onClick={capture.open}
                className="group/capture breathe-ring inline-flex h-9 items-center gap-1.5 rounded-full border border-input bg-surface pr-4 pl-3 text-sm font-semibold shadow-card transition-[border-color,background-color,box-shadow,scale] duration-300 ease-out hover:border-primary hover:shadow-focus active:scale-[0.98] active:bg-foreground/5"
              >
                <Plus
                  className="size-4 text-primary transition-transform duration-300 ease-out group-hover/capture:rotate-90"
                  aria-hidden
                />
                Capture
              </button>
              <AccountMenu isAdmin={isAdmin} />
            </div>
          </nav>

          <AccountSheet isAdmin={isAdmin} isCurrent={isCurrent} />
        </div>
      </header>

      <TabBar links={links} isCurrent={isCurrent} onCapture={capture.open} />
    </>
  );
}

/**
 * Small-screen destinations, within thumb reach. Shells that render it leave
 * room below `main`. It sits under the bar's layer so the
 * account sheet's scrim covers it. Quick capture takes the centre place, as
 * the one action among the destinations; keep the list to five in all.
 */
function TabBar({
  links,
  isCurrent,
  onCapture,
}: {
  links: AppLink[];
  isCurrent: IsCurrent;
  onCapture: () => void;
}) {
  const middle = Math.ceil(links.length / 2);
  const tab = ({ href, label, icon: Icon }: AppLink) => (
    <li key={href} className="flex-1">
      <Link
        href={href}
        aria-current={isCurrent(href) ? "page" : undefined}
        className="flex h-full flex-col items-center justify-center gap-1 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground active:text-foreground aria-[current=page]:text-primary"
      >
        <Icon className="size-5" aria-hidden />
        {label}
      </Link>
    </li>
  );
  return (
    <nav
      aria-label="Sections"
      className="fixed inset-x-0 bottom-0 z-40 border-t glass pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="container-page flex h-bar items-stretch">
        {links.slice(0, middle).map(tab)}
        <li className="flex flex-1 items-center justify-center">
          <button
            type="button"
            aria-label="Capture an idea"
            onClick={onCapture}
            // The bar's Capture control as a disc: outlined, the plus in emerald, the same breathing edge.
            className="group/capture breathe-ring grid size-11 place-items-center rounded-full border border-input bg-surface shadow-card transition-[border-color,background-color,box-shadow,scale] duration-300 ease-out hover:border-primary hover:shadow-focus active:scale-[0.96] active:bg-foreground/5"
          >
            <Plus
              className="size-5 text-primary transition-transform duration-300 ease-out group-hover/capture:rotate-90"
              aria-hidden
            />
          </button>
        </li>
        {links.slice(middle).map(tab)}
      </ul>
    </nav>
  );
}

const sheetRow =
  "flex min-h-12 items-center gap-3 text-[0.9375rem] font-medium transition-colors duration-150 hover:text-primary active:text-primary aria-[current=page]:text-primary [&_svg]:size-[1.125rem] [&_svg]:text-muted-foreground aria-[current=page]:[&_svg]:text-primary";

/**
 * Small-screen account sheet, the counterpart of the desktop AccountMenu: the
 * avatar opens a sheet below the bar, built on the same panel as the public
 * MobileNav.
 */
function AccountSheet({ isAdmin, isCurrent }: { isAdmin: boolean; isCurrent: IsCurrent }) {
  const { open, mounted, buttonRef, toggle, close, panelProps, scrimProps } = useNavPanel();
  const { name, email, initials, imageUrl } = useAccountIdentity();
  const { signOut } = useAccountActions();

  const items = [
    { href: routes.settings, label: "Settings", icon: Settings },
    ...(isAdmin ? [{ href: routes.admin, label: "Administration", icon: ShieldCheck }] : []),
  ];

  return (
    <div className="md:hidden">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls="app-account-sheet"
        data-nav-toggle
        aria-label={open ? "Close account menu" : "Open account menu"}
        onClick={toggle}
        className="grid size-9 place-items-center rounded-full border border-input bg-surface shadow-card transition-[border-color,box-shadow] duration-150 hover:border-primary/70 aria-expanded:border-ring aria-expanded:shadow-focus pointer-coarse:size-10"
      >
        <Avatar imageUrl={imageUrl} initials={initials} className="size-full bg-surface text-xs" />
      </button>

      {mounted && (
        <>
          <div
            {...scrimProps}
            className={`absolute inset-x-0 top-full h-dvh bg-background/70 ${scrimProps.className}`}
          />
          {/*
           * Opaque rather than glass: a backdrop filter nested in the blurred
           * header cannot see the page behind it.
           */}
          <div
            id="app-account-sheet"
            {...panelProps}
            className={`absolute inset-x-0 top-full max-h-[calc(100dvh-var(--bar-h))] overflow-y-auto overscroll-contain border-b bg-surface-raised shadow-raised ${panelProps.className}`}
          >
            <nav aria-label="Account" className="container-page pb-5">
              <div style={row(0)} className="flex animate-menu-row items-center gap-3 py-4">
                <Avatar imageUrl={imageUrl} initials={initials} className="size-10 text-sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.9375rem] font-semibold">{name}</p>
                  {email && email !== name && (
                    <p className="truncate text-sm text-muted-foreground">{email}</p>
                  )}
                </div>
                {/* Unlabelled: the sun and moon say what it is, and it stays beside the person it applies to. */}
                <ThemeToggle className="shrink-0" />
              </div>

              <ul className="divide-y border-y">
                {items.map(({ href, label, icon: Icon }, index) => (
                  <li key={href} style={row(index + 1)} className="animate-menu-row">
                    <Link
                      href={href}
                      onClick={close}
                      aria-current={isCurrent(href) ? "page" : undefined}
                      className={sheetRow}
                    >
                      <Icon aria-hidden />
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>

              <div style={row(items.length + 1)} className="animate-menu-row pt-5">
                <Button variant="secondary" className="w-full" onClick={signOut}>
                  <LogOut aria-hidden />
                  Sign out
                </Button>
              </div>
            </nav>
          </div>
        </>
      )}
    </div>
  );
}

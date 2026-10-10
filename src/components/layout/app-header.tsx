"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Settings } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { Button, buttonVariants } from "@/components/ui/button";
import { routes } from "@/lib/site";
import { AccountMenu, useAccountActions, useAccountIdentity } from "./account-menu";
import { MenuIcon } from "./menu-icon";
import { ThemeToggle } from "./theme-toggle";
import { row, useNavPanel } from "./use-nav-panel";

/** Links shown for a role. Hiding a link is presentation; the pages enforce access. */
export function appLinks(isAdmin: boolean) {
  return [
    { href: routes.dashboard, label: "Dashboard" },
    ...(isAdmin ? [{ href: routes.admin, label: "Admin" }] : []),
  ];
}

/**
 * Application bar: the same fixed, full-width glass bar as the public header.
 * Shells that render it must offset `main` by `pt-bar`. The space before the
 * theme control is where quick capture goes in Phase 2.
 */
export function AppHeader({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const links = appLinks(isAdmin);
  const isCurrent = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
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
          <div className="flex items-center gap-2.5">
            <ThemeToggle />
            <AccountMenu isAdmin={isAdmin} />
          </div>
        </nav>

        <AppMobileNav links={links} isCurrent={isCurrent} />
      </div>
    </header>
  );
}

type AppMobileNavProps = {
  links: { href: string; label: string }[];
  isCurrent: (href: string) => boolean;
};

/** Small-screen navigation, following the public MobileNav: a button and a sheet below the bar. */
function AppMobileNav({ links, isCurrent }: AppMobileNavProps) {
  const { open, mounted, buttonRef, toggle, close, panelProps, scrimProps } = useNavPanel();
  const { name, email } = useAccountIdentity();
  const { signOut } = useAccountActions();

  return (
    <div className="md:hidden">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls="app-mobile-nav"
        data-nav-toggle
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={toggle}
        className="-mr-2 grid size-10 place-items-center rounded-lg text-foreground transition-colors duration-150 hover:bg-accent active:bg-foreground/12"
      >
        <MenuIcon open={open} />
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
            id="app-mobile-nav"
            {...panelProps}
            className={`absolute inset-x-0 top-full max-h-[calc(100dvh-var(--bar-h))] overflow-y-auto overscroll-contain border-b bg-surface-raised shadow-raised ${panelProps.className}`}
          >
            <nav aria-label="Application" className="container-page pb-5">
              <ul className="divide-y border-b">
                {links.map((link, index) => (
                  <li key={link.href} style={row(index)} className="animate-menu-row">
                    <Link
                      href={link.href}
                      onClick={close}
                      aria-current={isCurrent(link.href) ? "page" : undefined}
                      // The current page is marked by a short emerald rule before its name.
                      className="flex min-h-13 items-center font-display text-xl tracking-[-0.01em] transition-colors duration-150 before:mr-3 before:hidden before:h-5 before:w-0.5 before:rounded-full before:bg-primary hover:text-primary active:text-primary aria-[current=page]:before:block"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>

              <div style={row(links.length)} className="animate-menu-row pt-5">
                <p className="truncate text-sm font-semibold">{name}</p>
                {email && email !== name && (
                  <p className="truncate text-sm text-muted-foreground">{email}</p>
                )}
                <div className="mt-3.5 grid grid-cols-2 gap-2">
                  <Link
                    href={routes.settings}
                    onClick={close}
                    aria-current={isCurrent(routes.settings) ? "page" : undefined}
                    className={buttonVariants({
                      variant: "outline",
                      className:
                        "aria-[current=page]:border-primary/70 aria-[current=page]:text-primary",
                    })}
                  >
                    <Settings aria-hidden />
                    Settings
                  </Link>
                  <Button variant="secondary" onClick={signOut}>
                    <LogOut aria-hidden />
                    Sign out
                  </Button>
                </div>
              </div>

              <div
                style={row(links.length + 1)}
                className="mt-5 flex animate-menu-row items-center justify-between border-t pt-4"
              >
                <p className="text-sm font-medium text-muted-foreground">Theme</p>
                <ThemeToggle />
              </div>
            </nav>
          </div>
        </>
      )}
    </div>
  );
}

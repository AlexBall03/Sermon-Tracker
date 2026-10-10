"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu, UserRound, X } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { routes } from "@/lib/site";
import { AccountMenu, useAccountActions, useAccountIdentity } from "./account-menu";
import { ThemeToggle } from "./theme-toggle";

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
    <header className="fixed inset-x-0 top-0 z-50 glass-settle border-b glass has-[[data-nav-toggle][aria-expanded=true]]:animate-none has-[[data-nav-toggle][aria-expanded=true]]:bg-surface-raised">
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
                  // The current page carries a short emerald rule on the bar's bottom edge.
                  className="relative rounded-md px-2.5 py-1.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors duration-150 after:absolute after:inset-x-2.5 after:-bottom-[13px] after:h-0.5 after:rounded-full after:bg-primary after:opacity-0 after:transition-opacity after:duration-150 hover:bg-accent hover:text-foreground active:bg-foreground/10 aria-[current=page]:text-foreground aria-[current=page]:after:opacity-100"
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

/** Small-screen navigation, following the public MobileNav: a button and a panel below the bar. */
function AppMobileNav({ links, isCurrent }: AppMobileNavProps) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { name, email } = useAccountIdentity();
  const { manageAccount, signOut } = useAccountActions();

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div className="md:hidden">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls="app-mobile-nav"
        data-nav-toggle
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((value) => !value)}
        className="-mr-2 grid size-10 place-items-center rounded-lg text-foreground transition-colors duration-150 hover:bg-accent active:bg-foreground/12"
      >
        {open ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
      </button>

      {open && (
        // Opaque rather than glass: a backdrop filter nested in the blurred
        // header cannot see the page behind it.
        <div
          id="app-mobile-nav"
          className="absolute inset-x-0 top-full animate-menu border-b bg-surface-raised shadow-raised"
        >
          <nav aria-label="Application" className="container-page flex flex-col py-3">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={close}
                aria-current={isCurrent(link.href) ? "page" : undefined}
                className="-mx-2 flex min-h-11 items-center rounded-lg px-2 text-[0.9375rem] font-medium transition-colors duration-150 hover:bg-accent aria-[current=page]:bg-primary-soft aria-[current=page]:text-primary"
              >
                {link.label}
              </Link>
            ))}

            <div className="mt-3 border-t pt-4">
              <p className="truncate text-sm font-semibold">{name}</p>
              {email && email !== name && (
                <p className="truncate text-sm text-muted-foreground">{email}</p>
              )}
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    close();
                    manageAccount();
                  }}
                >
                  <UserRound aria-hidden />
                  Manage account
                </Button>
                <Button variant="secondary" onClick={signOut}>
                  <LogOut aria-hidden />
                  Sign out
                </Button>
              </div>
            </div>

            <div className="mt-4 border-t pt-4 pb-1">
              <p className="mb-2 text-sm font-medium text-muted-foreground">Theme</p>
              <ThemeToggle showLabels className="flex w-full" />
            </div>
          </nav>
        </div>
      )}
    </div>
  );
}

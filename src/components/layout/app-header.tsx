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
 * Shells that render it must offset `main` by `pt-16`. The space before the
 * theme control is where quick capture goes in Phase 2.
 */
export function AppHeader({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const links = appLinks(isAdmin);
  const isCurrent = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b glass">
      <div className="container-page flex h-16 items-center justify-between gap-6">
        <Link href={routes.dashboard} className="rounded-md" aria-label="Sermon Tracker dashboard">
          <Logo />
        </Link>

        <nav
          aria-label="Application"
          className="hidden flex-1 items-center justify-between gap-6 md:flex"
        >
          <ul className="flex items-center gap-1 lg:pl-4">
            {links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={isCurrent(link.href) ? "page" : undefined}
                  className="rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors duration-200 hover:bg-accent hover:text-foreground aria-[current=page]:text-primary"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-3">
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
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((value) => !value)}
        className="-mr-2 grid size-10 place-items-center rounded-lg text-foreground transition-colors duration-200 hover:bg-accent"
      >
        {open ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
      </button>

      {open && (
        // Opaque rather than glass: a backdrop filter nested in the blurred
        // header cannot see the page behind it.
        <div
          id="app-mobile-nav"
          className="absolute inset-x-0 top-full animate-menu border-b bg-background shadow-raised"
        >
          <nav aria-label="Application" className="container-page flex flex-col py-4">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={close}
                aria-current={isCurrent(link.href) ? "page" : undefined}
                className="-mx-2 rounded-lg px-2 py-3 text-base font-medium transition-colors duration-200 hover:bg-accent aria-[current=page]:text-primary"
              >
                {link.label}
              </Link>
            ))}

            <div className="mt-4 border-t pt-4">
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

            <div className="mt-5 border-t pt-4">
              <p className="mb-2 text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                Theme
              </p>
              <ThemeToggle showLabels className="flex w-full" />
            </div>
          </nav>
        </div>
      )}
    </div>
  );
}

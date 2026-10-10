"use client";

import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { routes } from "@/lib/site";
import { MenuIcon } from "./menu-icon";
import { ThemeToggle } from "./theme-toggle";
import { row, useNavPanel } from "./use-nav-panel";

type MobileNavProps = {
  links: readonly { href: string; label: string }[];
};

/**
 * Small-screen navigation: a menu button and a sheet that unrolls below the
 * bar, set like a contents page, with the page dimmed behind it.
 */
export function MobileNav({ links }: MobileNavProps) {
  const { open, mounted, buttonRef, toggle, close, panelProps, scrimProps } = useNavPanel();

  return (
    <div className="md:hidden">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls="mobile-nav"
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
            id="mobile-nav"
            {...panelProps}
            className={`absolute inset-x-0 top-full max-h-[calc(100dvh-var(--bar-h))] overflow-y-auto overscroll-contain border-b bg-surface-raised shadow-raised ${panelProps.className}`}
          >
            <nav aria-label="Primary" className="container-page pb-5">
              <ul className="divide-y border-b">
                {links.map((link, index) => (
                  <li key={link.href} style={row(index)} className="animate-menu-row">
                    {/* A plain anchor: next/link does not scroll again to a hash already in the URL. */}
                    <a
                      href={link.href}
                      onClick={close}
                      className="flex min-h-13 items-center font-display text-xl tracking-[-0.01em] transition-colors duration-150 hover:text-primary active:text-primary"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
              <div style={row(links.length)} className="animate-menu-row pt-5">
                <Link
                  href={routes.signIn}
                  onClick={close}
                  className={buttonVariants({ size: "lg", className: "w-full" })}
                >
                  Sign in
                </Link>
              </div>
              <div
                style={row(links.length + 1)}
                className="flex animate-menu-row items-center justify-between pt-5"
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

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { routes } from "@/lib/site";
import { ThemeToggle } from "./theme-toggle";

type MobileNavProps = {
  links: readonly { href: string; label: string }[];
};

/** Small-screen navigation: a menu button and a panel that drops below the bar. */
export function MobileNav({ links }: MobileNavProps) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

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
        aria-controls="mobile-nav"
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
          id="mobile-nav"
          className="absolute inset-x-0 top-full animate-menu border-b bg-surface-raised shadow-raised"
        >
          <nav aria-label="Primary" className="container-page flex flex-col py-3">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={close}
                className="-mx-2 flex min-h-11 items-center rounded-lg px-2 text-[0.9375rem] font-medium transition-colors duration-150 hover:bg-accent"
              >
                {link.label}
              </Link>
            ))}
            <Link
              href={routes.signIn}
              onClick={close}
              className={buttonVariants({ size: "lg", className: "mt-3" })}
            >
              Sign in
            </Link>
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

"use client";

import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { routes } from "@/lib/site";

/**
 * The logo in the public header. A link to the page you are already on does
 * nothing, and with a section hash in the URL it returns to that section, so
 * on the landing page this scrolls to the very top and clears the hash itself.
 */
export function HomeLink() {
  function onClick(event: React.MouseEvent<HTMLAnchorElement>) {
    if (window.location.pathname !== routes.home) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    window.history.replaceState(null, "", routes.home);
    // Smoothness comes from `scroll-behavior` on <html>, so reduced motion is respected.
    window.scrollTo({ top: 0 });
  }

  return (
    <Link
      href={routes.home}
      onClick={onClick}
      className="flex items-center rounded-md transition-opacity duration-150 hover:opacity-80"
      aria-label="Sermon Tracker home"
    >
      <Logo />
    </Link>
  );
}

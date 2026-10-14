"use client";

import { useEffect, useState } from "react";

/**
 * The public header's links to the landing page's sections, with the one
 * being read marked as the application's bar marks the current page: ink, and
 * a short emerald rule beneath it. A section is the one being read while it
 * crosses the middle of the window, so none is marked in the hero or the
 * footer.
 */
export function SectionLinks({ links }: { links: readonly { href: string; label: string }[] }) {
  const [current, setCurrent] = useState<string | null>(null);

  useEffect(() => {
    const sections = links
      .map((link) => document.getElementById(link.href.slice(link.href.indexOf("#") + 1)))
      .filter((section) => section !== null);
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const href = links.find((link) => link.href.endsWith(`#${entry.target.id}`))?.href;
          if (!href) continue;
          if (entry.isIntersecting) setCurrent(href);
          else setCurrent((was) => (was === href ? null : was));
        }
      },
      // A line across the middle of the window.
      { rootMargin: "-50% 0px -50% 0px" },
    );
    for (const section of sections) observer.observe(section);
    return () => observer.disconnect();
  }, [links]);

  return (
    <ul className="flex items-center gap-0.5">
      {links.map((link) => (
        <li key={link.href}>
          {/* A plain anchor: next/link does not scroll again to a hash already in the URL. */}
          <a
            href={link.href}
            aria-current={current === link.href ? "location" : undefined}
            className="relative rounded-md px-2.5 py-1.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors duration-150 after:absolute after:inset-x-2.5 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary after:opacity-0 after:transition-opacity after:duration-150 hover:bg-accent hover:text-foreground active:bg-foreground/10 aria-[current=location]:text-foreground aria-[current=location]:after:opacity-100"
          >
            {link.label}
          </a>
        </li>
      ))}
    </ul>
  );
}

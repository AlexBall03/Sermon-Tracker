import Link from "next/link";
import { BookMarked, Lightbulb } from "lucide-react";

import { routes } from "@/lib/site";

const sections = [
  { key: "ideas", label: "Ideas", href: routes.library, icon: Lightbulb },
  { key: "scripture", label: "Saved Scripture", href: routes.savedScripture, icon: BookMarked },
] as const;

export type LibrarySection = (typeof sections)[number]["key"];

/**
 * The library's sections: the ideas, and the Scripture that was saved while
 * reading. They are two views of one place, so they are chosen between here,
 * under the library's own heading, and neither is in the main navigation.
 * Each keeps its own search and filters in its own address.
 */
export function LibrarySections({ current }: { current: LibrarySection }) {
  return (
    <nav aria-label="Library sections" className="mt-4 flex gap-1">
      {sections.map(({ key, label, href, icon: Icon }) => (
        <Link
          key={key}
          href={href}
          aria-current={key === current ? "page" : undefined}
          className="flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground active:bg-foreground/10 aria-[current=page]:bg-primary-soft aria-[current=page]:font-semibold aria-[current=page]:text-primary pointer-coarse:h-11"
        >
          <Icon className="size-4" aria-hidden />
          {label}
        </Link>
      ))}
    </nav>
  );
}

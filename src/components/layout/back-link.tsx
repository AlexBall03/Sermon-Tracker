import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/**
 * The way up one level, set above a page's title: from a library section to
 * the library, from an idea to the section it was found in. It is a link to a
 * place, never a step back through the browser's history, so it leads to the
 * same page however this one was reached.
 */
export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="mb-3 -ml-1 inline-flex min-h-8 items-center gap-1.5 rounded-md px-1 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground active:text-foreground pointer-coarse:min-h-11"
    >
      <ArrowLeft className="size-4" aria-hidden />
      {children}
    </Link>
  );
}

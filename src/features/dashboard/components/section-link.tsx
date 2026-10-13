import Link from "next/link";
import { ArrowRight } from "lucide-react";

/** The way from one of the dashboard's sections to the page that has the rest. */
export function SectionLink({ href, children }: { href: string; children: string }) {
  return (
    <Link
      href={href}
      className="group/all inline-flex items-center gap-1.5 rounded-md text-sm font-semibold text-primary link-underline"
    >
      {children}
      <ArrowRight
        className="size-4 transition-transform duration-150 group-hover/all:translate-x-0.5"
        aria-hidden
      />
    </Link>
  );
}

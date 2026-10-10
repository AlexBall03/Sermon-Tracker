import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { routes } from "@/lib/site";

/** Shown for an idea that does not exist, was deleted, or belongs to someone else. */
export default function IdeaNotFound() {
  return (
    <div className="container-page py-16">
      <div className="mx-auto max-w-lg rounded-xl border bg-surface p-8 shadow-card">
        <h1 className="font-display text-2xl leading-snug font-medium">Idea not found</h1>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-muted-foreground">
          There is no idea at this address in your library. It may have been deleted.
        </p>
        <Link href={routes.library} className={buttonVariants({ className: "mt-6" })}>
          Back to the library
        </Link>
      </div>
    </div>
  );
}

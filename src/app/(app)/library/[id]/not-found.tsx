import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { getT } from "@/i18n/server";
import { routes } from "@/lib/site";

/** Shown for an idea that does not exist, was deleted, or belongs to someone else. */
export default async function IdeaNotFound() {
  const t = (await getT("ideas")).page;
  return (
    <div className="container-page py-16">
      <div className="mx-auto max-w-lg rounded-xl border bg-surface p-8 shadow-card">
        <h1 className="font-display text-2xl leading-snug font-medium">{t.notFound.title}</h1>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-muted-foreground">
          {t.notFound.body}
        </p>
        <Link href={routes.sermonIdeas} className={buttonVariants({ className: "mt-6" })}>
          {t.back}
        </Link>
      </div>
    </div>
  );
}

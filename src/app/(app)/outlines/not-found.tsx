import Link from "next/link";
import { FileQuestion } from "lucide-react";

import { StatusPage } from "@/components/layout/status-page";
import { buttonVariants } from "@/components/ui/button";
import { getT } from "@/i18n/server";
import { routes } from "@/lib/site";

/**
 * Shown for an outline that does not exist, was deleted, or belongs to
 * someone else, and for a sermon to outline that is any of those.
 */
export default async function OutlineNotFound() {
  const t = (await getT("outlines")).page.notFound;
  const shell = (await getT("navigation")).notFound;
  return (
    <StatusPage icon={FileQuestion} title={t.title} body={t.body}>
      <Link href={routes.sermonIdeas} className={buttonVariants()}>
        {t.back}
      </Link>
      <Link href={routes.dashboard} className={buttonVariants({ variant: "outline" })}>
        {shell.dashboard}
      </Link>
    </StatusPage>
  );
}

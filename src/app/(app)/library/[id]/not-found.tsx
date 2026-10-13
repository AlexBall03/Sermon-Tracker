import Link from "next/link";
import { FileQuestion } from "lucide-react";

import { StatusPage } from "@/components/layout/status-page";
import { buttonVariants } from "@/components/ui/button";
import { getT } from "@/i18n/server";
import { routes } from "@/lib/site";

/** Shown for an idea that does not exist, was deleted, or belongs to someone else. */
export default async function IdeaNotFound() {
  const t = (await getT("ideas")).page;
  const shell = (await getT("navigation")).notFound;
  return (
    <StatusPage icon={FileQuestion} title={t.notFound.title} body={t.notFound.body}>
      <Link href={routes.sermonIdeas} className={buttonVariants()}>
        {t.back}
      </Link>
      <Link href={routes.dashboard} className={buttonVariants({ variant: "outline" })}>
        {shell.dashboard}
      </Link>
    </StatusPage>
  );
}

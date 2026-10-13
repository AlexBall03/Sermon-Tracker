import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { FileQuestion } from "lucide-react";

import { BackLink } from "@/components/layout/back-link";
import { PageHeader } from "@/components/layout/page-header";
import { StatusPage } from "@/components/layout/status-page";
import { buttonVariants } from "@/components/ui/button";
import { getDb } from "@/db";
import { requireActiveUser } from "@/features/auth/access";
import { getIdea } from "@/features/ideas/ideas";
import { CreateOutlineButton } from "@/features/outlines/components/create-outline-button";
import { getOutlineForSermon } from "@/features/outlines/outlines";
import { sermonIdSchema } from "@/features/outlines/schemas";
import { getT } from "@/i18n/server";
import { routes } from "@/lib/site";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("outlines")).create.metaTitle };
}

/**
 * Where a sermon is given its outline: `/outlines/new?sermon=<id>`. A sermon
 * that has one already is sent on to it. Nothing is made by opening this
 * page; the outline is made when the button is pressed.
 *
 * A sermon that is malformed, unknown, or someone else's is the same "not
 * found". An idea that is the owner's and not a sermon is told why it cannot
 * have one, which the action would say too.
 */
export default async function NewOutlinePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireActiveUser();
  const sermonId = sermonIdSchema.safeParse((await searchParams)?.sermon);
  if (!sermonId.success) notFound();

  const db = getDb();
  const [idea, outline] = await Promise.all([
    getIdea(db, user.id, sermonId.data),
    getOutlineForSermon(db, user.id, sermonId.data),
  ]);
  if (!idea) notFound();
  if (outline) redirect(`${routes.outlines}/${outline.id}`);

  const t = await getT("outlines");
  const ideaHref = `${routes.library}/${idea.id}`;
  if (idea.kind !== "sermon") {
    return (
      <StatusPage icon={FileQuestion} title={t.create.notSermonTitle} body={t.create.notSermonBody}>
        <Link href={ideaHref} className={buttonVariants()}>
          {t.create.backToIdea}
        </Link>
      </StatusPage>
    );
  }

  return (
    <div className="container-page py-10 lg:py-12">
      <BackLink href={ideaHref}>{t.page.back}</BackLink>
      <PageHeader
        title={t.create.title}
        description={
          <>
            {t.page.sermon}{" "}
            <span className="font-serif font-medium text-foreground">{idea.title}</span>
          </>
        }
      />
      <p className="mt-8 max-w-xl text-[0.9375rem] leading-relaxed text-muted-foreground">
        {t.create.body}
      </p>
      <CreateOutlineButton sermonId={idea.id} />
    </div>
  );
}

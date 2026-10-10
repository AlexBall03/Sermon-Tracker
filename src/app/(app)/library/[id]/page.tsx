import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { getDb } from "@/db";
import { requireActiveUser } from "@/features/auth/access";
import { IdeaEditor } from "@/features/ideas/components/idea-editor";
import { getIdea } from "@/features/ideas/ideas";
import { libraryReturnHref } from "@/features/ideas/library-query";
import { ideaKindLabels } from "@/features/ideas/model";
import { ideaIdSchema } from "@/features/ideas/schemas";
import { listTags } from "@/features/ideas/tags";

export const metadata: Metadata = { title: "Idea" };

/**
 * One idea. An ID that is malformed, unknown, or someone else's is the same
 * "not found": the query itself is limited to the signed-in owner.
 *
 * Opened from the library, the address carries `from`: the library's query
 * at the time. It is only ever read back as a library query, so the way back
 * returns to the same search, filters, order, and page and nowhere else.
 */
export default async function IdeaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireActiveUser();
  const id = ideaIdSchema.safeParse((await params).id);
  if (!id.success) notFound();

  const db = getDb();
  const [idea, tags] = await Promise.all([getIdea(db, user.id, id.data), listTags(db, user.id)]);
  if (!idea) notFound();
  const back = libraryReturnHref((await searchParams)?.from);

  return (
    <div className="container-page py-10 lg:py-12">
      <Link
        href={back}
        className="mb-5 inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Library
      </Link>
      <PageHeader
        title={ideaKindLabels[idea.kind]}
        description="Change anything here. Nothing is lost when an idea is reclassified."
      />
      <IdeaEditor
        key={idea.id}
        id={idea.id}
        backHref={back}
        allTags={tags.map(({ id, name }) => ({ id, name }))}
        createdAt={idea.createdAt}
        updatedAt={idea.updatedAt}
        initial={{
          kind: idea.kind,
          title: idea.title,
          notes: idea.notes ?? "",
          status: idea.status,
          sermonType: idea.sermonType,
          subject: idea.subject ?? "",
          references: idea.references,
          // The tags it has now: the editor sends these back with every save.
          tags: idea.tags,
        }}
      />
    </div>
  );
}

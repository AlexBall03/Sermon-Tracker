import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { getDb } from "@/db";
import { requireActiveUser } from "@/features/auth/access";
import { IdeaEditor } from "@/features/ideas/components/idea-editor";
import { getIdea } from "@/features/ideas/ideas";
import { ideaKindLabels } from "@/features/ideas/model";
import { ideaIdSchema } from "@/features/ideas/schemas";
import { routes } from "@/lib/site";

export const metadata: Metadata = { title: "Idea" };

/**
 * One idea. An ID that is malformed, unknown, or someone else's is the same
 * "not found": the query itself is limited to the signed-in owner.
 */
export default async function IdeaPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireActiveUser();
  const id = ideaIdSchema.safeParse((await params).id);
  if (!id.success) notFound();

  const idea = await getIdea(getDb(), user.id, id.data);
  if (!idea) notFound();

  return (
    <div className="container-page py-10 lg:py-12">
      <Link
        href={routes.library}
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
        }}
      />
    </div>
  );
}

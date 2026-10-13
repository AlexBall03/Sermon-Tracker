import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Archive } from "lucide-react";

import { BackLink } from "@/components/layout/back-link";
import { PageHeader } from "@/components/layout/page-header";
import { getDb } from "@/db";
import { requireActiveUser } from "@/features/auth/access";
import { OutlineEditor } from "@/features/outlines/components/outline-editor";
import { getOutline } from "@/features/outlines/outlines";
import { outlineIdSchema } from "@/features/outlines/schemas";
import { getT } from "@/i18n/server";
import { routes } from "@/lib/site";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("outlines")).page.metaTitle };
}

/**
 * One outline, open in its editor. An ID that is malformed, unknown, or
 * someone else's is the same "not found": the query itself is limited to the
 * signed-in owner.
 *
 * The outline of a sermon that has since been archived, or filed as something
 * else, still opens here and can still be changed (`getOutline` returns it on
 * purpose); the page says which it is.
 */
export default async function OutlinePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireActiveUser();
  const id = outlineIdSchema.safeParse((await params).id);
  if (!id.success) notFound();

  const outline = await getOutline(getDb(), user.id, id.data);
  if (!outline) notFound();
  const t = (await getT("outlines")).page;
  const { sermon } = outline;
  const aside = sermon.kind !== "sermon" ? t.refiled : sermon.archivedAt ? t.archived : null;

  return (
    <div className="container-page py-10 lg:py-12">
      <BackLink href={`${routes.library}/${sermon.id}`}>{t.back}</BackLink>
      <PageHeader
        title={t.title}
        description={
          <>
            {t.sermon}{" "}
            <span className="font-serif font-medium text-foreground">{sermon.title}</span>
          </>
        }
      />
      {aside && (
        <p className="mt-4 flex max-w-4xl items-start gap-2 rounded-xl border bg-muted/50 px-4 py-3 text-sm">
          <Archive className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          {aside}
        </p>
      )}
      <OutlineEditor
        key={outline.id}
        sermon={{ id: sermon.id, title: sermon.title }}
        snapshot={{
          id: outline.id,
          revision: outline.revision,
          numbering: outline.numbering,
          // What the editor edits, and no more: passages on an entry come with Phase 3C.
          entries: outline.entries.map(
            ({ id, parentId, type, position, title, notes, revision }) => ({
              id,
              parentId,
              type,
              position,
              title,
              notes,
              revision,
            }),
          ),
        }}
      />
    </div>
  );
}

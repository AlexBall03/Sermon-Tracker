import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Archive } from "lucide-react";

import { BackLink } from "@/components/layout/back-link";
import { PageHeader } from "@/components/layout/page-header";
import { getDb } from "@/db";
import { requireActiveUser } from "@/features/auth/access";
import { getIdea } from "@/features/ideas/ideas";
import { OutlineEditor } from "@/features/outlines/components/outline-editor";
import { getOutline, getOutlineSermon } from "@/features/outlines/outlines";
import { outlineIdSchema } from "@/features/outlines/schemas";
import { ConvertOnOpen } from "@/features/sermon-editor/host/convert-on-open";
import { OutlineDocumentHost } from "@/features/sermon-editor/host/outline-document-host";
import { hasDocument } from "@/features/sermon-editor/persistence/authority";
import { conversionEnabled } from "@/features/sermon-editor/persistence/rollout";
import { getT } from "@/i18n/server";
import { routes } from "@/lib/site";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("outlines")).page.metaTitle };
}

/**
 * One outline, open in its editor. An ID that is malformed, unknown, or
 * someone else's is the same "not found": every query is limited to the
 * signed-in owner.
 *
 * Which editor (A3):
 * - An outline with a sermon document is the document's, whatever the
 *   rollout switch says, and opens in the sermon editor (`OutlineDocumentHost`),
 *   which reads the document itself through its session. The page sends no
 *   content of it.
 * - One without, while conversion is on (`conversionEnabled`), is converted
 *   once the page is in the browser (`ConvertOnOpen`), never while it renders.
 * - One without, while conversion is off, opens in the outline editor as
 *   before.
 *
 * The outline of a sermon that has since been archived, or filed as something
 * else, still opens here and can still be changed (`getOutline` returns it on
 * purpose); the page says which it is.
 */
export default async function OutlinePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireActiveUser();
  const id = outlineIdSchema.safeParse((await params).id);
  if (!id.success) notFound();
  const db = getDb();

  const found = await getOutlineSermon(db, user.id, id.data);
  if (!found) notFound();
  const host = {
    owner: user.id,
    clerkUserId: user.clerkUserId,
    outlineId: found.id,
    sermon: {
      id: found.sermon.id,
      title: found.sermon.title,
      kind: found.sermon.kind,
      archivedAt: found.sermon.archivedAt?.toISOString() ?? null,
    },
  };
  // The authority is the row (A2.2): with one, the legacy editor is never offered.
  if (await hasDocument(db, user.id, found.id)) return <OutlineDocumentHost {...host} />;

  const legacy = await LegacyOutline({ ownerId: user.id, outlineId: found.id });
  if (!legacy) notFound();
  if (!conversionEnabled()) return legacy;
  return <ConvertOnOpen {...host} legacy={legacy} />;
}

/** The outline editor's page, as it was before A3: for an outline with no document. */
async function LegacyOutline({ ownerId, outlineId }: { ownerId: string; outlineId: string }) {
  const db = getDb();
  const outline = await getOutline(db, ownerId, outlineId);
  if (!outline) return null;
  const t = (await getT("outlines")).page;
  const { sermon } = outline;
  // The sermon's own passages, main text first, for the editor to offer on each entry.
  const idea = await getIdea(db, ownerId, sermon.id);
  const passages = idea?.references ?? [];
  const sermonReferences = [...passages]
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
    .map(({ book, chapterStart, verseStart, chapterEnd, verseEnd }) => ({
      book,
      chapterStart,
      verseStart,
      chapterEnd,
      verseEnd,
    }));
  const aside = sermon.kind !== "sermon" ? t.refiled : sermon.archivedAt ? t.archived : null;

  return (
    <div className="container-page py-10 lg:py-12">
      <BackLink href={`${routes.library}/${sermon.id}`}>{t.back}</BackLink>
      <PageHeader
        title={t.title}
        description={
          <>
            {t.sermon}{" "}
            <Link
              href={`${routes.library}/${sermon.id}`}
              className="rounded-sm font-serif font-medium text-foreground underline-offset-4 transition-colors duration-150 hover:text-primary hover:underline"
            >
              {sermon.title}
            </Link>
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
        sermon={{
          id: sermon.id,
          title: sermon.title,
          kind: sermon.kind,
          status: idea?.status,
          archivedAt: sermon.archivedAt?.toISOString() ?? null,
        }}
        sermonReferences={sermonReferences}
        snapshot={{
          id: outline.id,
          revision: outline.revision,
          numbering: outline.numbering,
          // What the editor edits, and no more: no dates, no depth, no path.
          entries: outline.entries.map(
            ({
              id,
              parentId,
              type,
              position,
              title,
              notes,
              revision,
              references,
              sourcePointId,
            }) => ({
              id,
              parentId,
              type,
              position,
              title,
              notes,
              revision,
              references,
              sourcePointId,
            }),
          ),
        }}
      />
    </div>
  );
}

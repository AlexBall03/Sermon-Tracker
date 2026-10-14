import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BackLink } from "@/components/layout/back-link";
import { PageHeader } from "@/components/layout/page-header";
import { getDb } from "@/db";
import { requireActiveUser } from "@/features/auth/access";
import { IdeaEditor } from "@/features/ideas/components/idea-editor";
import { RelatedIdeas } from "@/features/ideas/components/related-ideas";
import { getIdea } from "@/features/ideas/ideas";
import { libraryReturnHref } from "@/features/ideas/library-query";
import { relatedIdeas } from "@/features/ideas/relations";
import { ideaIdSchema } from "@/features/ideas/schemas";
import { listTags } from "@/features/ideas/tags";
import { OutlineLink } from "@/features/outlines/components/outline-link";
import { outlineIdsForSermons } from "@/features/outlines/outlines";
import {
  RecordPreachingButton,
  RecordPreachingProvider,
} from "@/features/preaching/components/record-preaching";
import { SermonHistory } from "@/features/preaching/components/sermon-history";
import { listContexts } from "@/features/preaching/contexts";
import { listForSermon } from "@/features/preaching/occurrences";
import { listVenues } from "@/features/preaching/venues";
import { getLocale, getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("ideas")).page.metaTitle };
}

/** How many of a sermon's occasions its own page lists. The rest are in the history section. */
const recentOccasions = 5;

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
  const [idea, tags, related, history, venues, contexts, outlines] = await Promise.all([
    getIdea(db, user.id, id.data),
    listTags(db, user.id),
    // Archived ones too, which the section marks; nothing for an undecided idea.
    relatedIdeas(db, user.id, id.data),
    // The latest few occasions and how many there are in all, in the one query.
    listForSermon(db, user.id, id.data, 1, recentOccasions),
    listVenues(db, user.id),
    listContexts(db, user.id),
    // Which outline is this idea's, if it has one: its ID and nothing of what is in it.
    outlineIdsForSermons(db, user.id, [id.data]),
  ]);
  if (!idea) notFound();
  const outlineId = outlines.get(idea.id) ?? null;
  const locale = await getLocale();
  const from = (await searchParams)?.from;
  const back = libraryReturnHref(from);
  const t = await getT("ideas");
  const sermon = { id: idea.id, title: idea.title };
  const venueOptions = venues.map(({ id, name, locality }) => ({ id, name, locality }));
  const contextOptions = contexts.map(({ id, name }) => ({ id, name }));

  return (
    <div className="container-page py-10 lg:py-12">
      <BackLink href={back}>{t.page.back}</BackLink>
      <PageHeader
        title={t.kinds[idea.kind]}
        description={t.page.description}
        action={
          // Only a sermon can be outlined or recorded as preached. An archived one still can.
          // An idea filed as something else keeps the outline it had, and the way to it.
          idea.kind === "sermon" || outlineId ? (
            <div className="flex flex-wrap items-center gap-2">
              <OutlineLink sermon={sermon} outlineId={outlineId} locale={locale} />
              {idea.kind === "sermon" && (
                <RecordPreachingProvider venues={venueOptions} contexts={contextOptions}>
                  <RecordPreachingButton sermon={sermon} />
                </RecordPreachingProvider>
              )}
            </div>
          ) : undefined
        }
      />
      <IdeaEditor
        key={idea.id}
        id={idea.id}
        backHref={back}
        allTags={tags.map(({ id, name }) => ({ id, name }))}
        createdAt={idea.createdAt}
        updatedAt={idea.updatedAt}
        archivedAt={idea.archivedAt}
        hasOutline={outlineId !== null}
        revision={idea.revision}
        lastDevelopedAt={idea.lastDevelopedAt}
        preached={history.total > 0}
        initial={{
          kind: idea.kind,
          title: idea.title,
          notes: idea.notes ?? "",
          status: idea.status,
          intendedFormat: idea.intendedFormat,
          sermonType: idea.sermonType,
          subject: idea.subject ?? "",
          references: idea.references,
          // The tags it has now: the editor sends these back with every save.
          tags: idea.tags,
        }}
      >
        {/* Not part of the draft: relating takes effect at once and changes neither idea. */}
        {idea.kind !== "undecided" && (
          <RelatedIdeas
            idea={{ id: idea.id, title: idea.title, kind: idea.kind }}
            sermons={related.sermons}
            points={related.points}
            from={typeof from === "string" ? from : undefined}
          />
        )}
        {/* History outlives the idea's time as a sermon: it is shown wherever there is any. */}
        {(idea.kind === "sermon" || history.total > 0) && (
          <SermonHistory
            sermon={sermon}
            recordable={idea.kind === "sermon"}
            recent={history.items}
            total={history.total}
            venues={venueOptions}
            contexts={contextOptions}
          />
        )}
      </IdeaEditor>
    </div>
  );
}

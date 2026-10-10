import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { getDb } from "@/db";
import { requireActiveUser } from "@/features/auth/access";
import { IdeaList } from "@/features/ideas/components/idea-list";
import { CaptureButton } from "@/features/ideas/components/quick-capture";
import { libraryLimit, listIdeas } from "@/features/ideas/ideas";

export const metadata: Metadata = { title: "Library" };

/**
 * The signed-in person's ideas, most recently changed first. Rendered per
 * request and never cached. Search, filters, and tags belong to Phase 2B.
 */
export default async function LibraryPage() {
  const user = await requireActiveUser();
  const ideas = await listIdeas(getDb(), user.id);

  return (
    <div className="container-page py-10 lg:py-12">
      <PageHeader
        title="Library"
        description="Every idea you have captured: sermons, points, and thoughts you have not sorted yet."
      />

      {ideas.length === 0 ? (
        <section
          aria-labelledby="empty-heading"
          className="mt-8 rounded-xl border border-dashed border-input px-6 py-12 sm:px-8"
        >
          <h2 id="empty-heading" className="font-display text-2xl leading-snug font-medium">
            Nothing here yet
          </h2>
          <p className="mt-3 max-w-md text-[0.9375rem] leading-relaxed text-muted-foreground">
            Capture the first thought that is worth keeping. A line is enough, and you can decide
            later whether it is a sermon or a point.
          </p>
          <CaptureButton className="mt-6" />
        </section>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {ideas.length === libraryLimit
                ? `Your ${libraryLimit} most recently changed ideas`
                : `${ideas.length} ${ideas.length === 1 ? "idea" : "ideas"}, most recently changed first`}
            </p>
            <CaptureButton size="sm" className="max-md:hidden" />
          </div>
          <div className="mt-4">
            <IdeaList ideas={ideas} label="Your ideas" />
          </div>
        </>
      )}
    </div>
  );
}

import { getDb } from "@/db";
import { describeDatabaseError } from "@/db/types";
import { authorize } from "@/features/auth/access";
import { ideaSearchSize, type IdeaMatches } from "@/features/ideas/idea-search";
import { searchIdeas } from "@/features/ideas/ideas";
import {
  defaultLibraryQuery,
  libraryParams,
  parseLibraryQuery,
} from "@/features/ideas/library-query";

const noStore = { "Cache-Control": "no-store" };

/**
 * The signed-in account's ideas by name, for choosing one to put Scripture
 * on. It is the library's own search, so the owner is in its WHERE clause and
 * another account's ideas cannot be found, counted, or named. Only the search
 * text, the kind, and the archive view are taken from the address, through the
 * library's parser; the order is always most recently changed first. Archived
 * ideas are left out unless the address asks for them, which only the
 * related-ideas picker does.
 */
export async function GET(request: Request) {
  const actor = await authorize("active");
  if (!actor.ok) return Response.json({ message: actor.message }, { status: 401 });

  const asked = new URL(request.url).searchParams;
  const params = new URLSearchParams();
  for (const name of [libraryParams.q, libraryParams.kinds, libraryParams.archive]) {
    for (const value of asked.getAll(name)) params.append(name, value);
  }
  const { q, kinds, archive } = parseLibraryQuery(params);

  try {
    const page = await searchIdeas(
      getDb(),
      actor.user.id,
      { ...defaultLibraryQuery, q, kinds, archive },
      ideaSearchSize,
    );
    const matches: IdeaMatches = {
      total: page.total,
      items: page.items.map((idea) => ({
        id: idea.id,
        title: idea.title,
        kind: idea.kind,
        status: idea.status,
        // Kept from an idea's time as a sermon, a subject is not shown on anything else.
        subject: idea.kind === "sermon" ? idea.subject : null,
        references: idea.references,
        archived: idea.archivedAt !== null,
      })),
    };
    return Response.json(matches, { headers: noStore });
  } catch (error) {
    console.error("Idea search failed:", describeDatabaseError(error));
    return Response.json(
      { message: "Your ideas could not be searched. Try again." },
      { status: 503, headers: noStore },
    );
  }
}

import { getDb } from "@/db";
import { describeDatabaseError } from "@/db/types";
import { authorize } from "@/features/auth/access";
import { searchIdeas } from "@/features/ideas/ideas";
import { defaultLibraryQuery, normaliseSearch } from "@/features/ideas/library-query";
import { sermonSearchSize, type SermonMatches } from "@/features/preaching/sermon-search";

const noStore = { "Cache-Control": "no-store" };

/**
 * The signed-in account's sermons by name, for choosing one to record as
 * preached. It is the library's own search, so the owner is in its WHERE
 * clause and another account's sermons cannot be found, counted, or named.
 * Only the search text is taken from the address. The kind is always sermon
 * and archived ones are included: an archived sermon can still be recorded.
 *
 * This only offers. Whether the idea chosen is a sermon when it is recorded
 * is checked again, with its row locked, by `createOccurrence`.
 */
export async function GET(request: Request) {
  const actor = await authorize("active");
  if (!actor.ok) return Response.json({ message: actor.message }, { status: 401 });

  const q = normaliseSearch(new URL(request.url).searchParams.get("q") ?? "");

  try {
    const page = await searchIdeas(
      getDb(),
      actor.user.id,
      { ...defaultLibraryQuery, q, kinds: ["sermon"], archive: "all" },
      sermonSearchSize,
    );
    const matches: SermonMatches = {
      total: page.total,
      items: page.items.map((idea) => ({
        id: idea.id,
        title: idea.title,
        archived: idea.archivedAt !== null,
      })),
    };
    return Response.json(matches, { headers: noStore });
  } catch (error) {
    console.error("Sermon search failed:", describeDatabaseError(error));
    // No words here: the picker says what happened in the account's language.
    return Response.json({}, { status: 503, headers: noStore });
  }
}

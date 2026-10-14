import { getDb } from "@/db";
import { describeDatabaseError } from "@/db/types";
import { authorize } from "@/features/auth/access";
import { ideasByIdsLimit } from "@/features/ideas/ideas";
import { ideaIdSchema } from "@/features/ideas/schemas";
import { manifestFor, offlineIdeas } from "@/features/sync/snapshot";

const private_ = { "Cache-Control": "private, no-store" };

/**
 * The signed-in account's ideas, for its device to keep (Phase 5D.1,
 * features/offline/ideas). Without `ids`: every idea's revision and the
 * dates and marks that change without it, and the account's tags. With
 * `ids` (comma-separated, at most `ideasByIdsLimit`): those ideas whole.
 * Only ever the session's own; never stored by the service worker, which
 * does not answer `/api`, nor by any cache.
 */
export async function GET(request: Request) {
  const actor = await authorize("active");
  if (!actor.ok)
    return Response.json({ message: actor.message }, { status: 401, headers: private_ });

  const named = new URL(request.url).searchParams.get("ids");
  const ids = named === null ? null : named.split(",").filter(Boolean);
  if (
    ids &&
    (ids.length > ideasByIdsLimit || ids.some((id) => !ideaIdSchema.safeParse(id).success))
  ) {
    return Response.json({ message: "Bad request" }, { status: 400, headers: private_ });
  }

  try {
    const db = getDb();
    const body = ids
      ? { ideas: await offlineIdeas(db, actor.user.id, ids) }
      : await manifestFor(db, actor.user.id);
    // Whose these are, so a device never keeps them under another account.
    return Response.json({ owner: actor.user.id, ...body }, { headers: private_ });
  } catch (error) {
    console.error("Offline ideas failed:", describeDatabaseError(error));
    return Response.json({ message: "Unavailable" }, { status: 503, headers: private_ });
  }
}

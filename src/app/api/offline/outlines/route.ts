import { getDb } from "@/db";
import { describeDatabaseError } from "@/db/types";
import { authorize } from "@/features/auth/access";
import { outlineIdSchema } from "@/features/outlines/schemas";
import { outlinesByIdsLimit } from "@/features/sync/outlines";
import { offlineOutlines, outlineManifestFor } from "@/features/sync/snapshot";

const private_ = { "Cache-Control": "private, no-store" };

/**
 * The signed-in account's outlines, for its device to keep (Phase 5D.2,
 * features/offline/outlines). Without `ids`: every outline's revision, the
 * time it was last worked on, and its sermon as it is now. With `ids`
 * (comma-separated, at most `outlinesByIdsLimit`): those outlines whole.
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
    (ids.length > outlinesByIdsLimit || ids.some((id) => !outlineIdSchema.safeParse(id).success))
  ) {
    return Response.json({ message: "Bad request" }, { status: 400, headers: private_ });
  }

  try {
    const db = getDb();
    const body = ids
      ? { outlines: await offlineOutlines(db, actor.user.id, ids) }
      : await outlineManifestFor(db, actor.user.id);
    // Whose these are, so a device never keeps them under another account.
    return Response.json({ owner: actor.user.id, ...body }, { headers: private_ });
  } catch (error) {
    console.error("Offline outlines failed:", describeDatabaseError(error));
    return Response.json({ message: "Unavailable" }, { status: 503, headers: private_ });
  }
}

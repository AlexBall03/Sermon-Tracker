import { getDb } from "@/db";
import { describeDatabaseError } from "@/db/types";
import { authorize } from "@/features/auth/access";
import { ideaHeading } from "@/features/ideas/ideas";
import { ideaIdSchema } from "@/features/ideas/schemas";

const headers = { "Cache-Control": "private, no-store" };

/** `GET /api/ideas/<id>/heading`: what the sermon editor reads back a title save against. */
export type IdeaHeadingResponse = { title: string; revision: number };

/**
 * An idea's title and revision, for the sermon editor's header (A4.3) to
 * settle a title save whose answer was lost. A plain GET, so the browser never
 * queues it behind a pending document save Server Action. The owner comes from
 * the session and is in the query's WHERE clause: another account's idea is
 * the same 404 as none. It only reads; nothing caches it, and the service
 * worker does not answer `/api`.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await authorize("active");
  if (!actor.ok) return Response.json({ message: actor.message }, { status: 401, headers });
  const id = ideaIdSchema.safeParse((await params).id);
  if (!id.success) return Response.json({ message: "invalid" }, { status: 400, headers });
  try {
    const heading = await ideaHeading(getDb(), actor.user.id, id.data);
    if (!heading) return Response.json({ message: "missing" }, { status: 404, headers });
    const body: IdeaHeadingResponse = heading;
    return Response.json(body, { status: 200, headers });
  } catch (error) {
    console.error("Idea heading read failed:", describeDatabaseError(error));
    return Response.json({ message: "Unavailable" }, { status: 503, headers });
  }
}

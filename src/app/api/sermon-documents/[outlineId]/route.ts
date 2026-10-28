import { failure } from "@/features/sermon-editor/persistence/failure";
import { readHeaders, statusOf } from "@/features/sermon-editor/persistence/read-route";
import { readCallerDocument } from "@/features/sermon-editor/persistence/reader";

/**
 * The caller's sermon document as the server holds it (A2.3B.2D): the
 * authoritative read the autosave coordinator reconciles against. A plain
 * GET, so the browser never queues it behind a pending save Server Action.
 *
 * It is `readCallerDocument`, the same read as `readOutlineDocument`: the
 * owner from the session, another account's outline the same 404 as none,
 * an unreadable document its revision without its content, and nothing ever
 * written. The body is that `DocumentReadResult`; the status says the same
 * (`read-route.ts`). Nothing caches it: every answer is `private, no-store`,
 * the route is dynamic (`authorize` asks for the connection), and the
 * service worker does not answer `/api`.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ outlineId: string }> },
) {
  try {
    const { outlineId } = await params;
    const result = await readCallerDocument(outlineId);
    return Response.json(result, { status: statusOf(result), headers: readHeaders });
  } catch (error) {
    // Something other than the database (which the reader answers itself): its kind only.
    console.error("Sermon document read failed:", failure(error));
    return Response.json(
      { ok: false, code: "failed", message: "Unavailable" },
      { status: 503, headers: readHeaders },
    );
  }
}

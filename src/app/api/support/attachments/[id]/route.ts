import { getDb } from "@/db";
import { describeDatabaseError } from "@/db/types";
import { authorize } from "@/features/auth/access";
import { readScreenshot } from "@/features/support/blob";
import { attachmentIdSchema } from "@/features/support/schemas";
import { attachmentForViewer } from "@/features/support/tickets";

const notFound = () =>
  new Response(null, { status: 404, headers: { "Cache-Control": "private, no-store" } });

/**
 * One screenshot, to the account that uploaded it or to an administrator, and
 * to nobody else: someone else's is answered exactly as one that does not
 * exist. It is served from here and never by a storage address, with the type
 * recorded when its bytes were checked, and is never kept by a shared cache.
 */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/support/attachments/[id]">,
) {
  const actor = await authorize("active");
  if (!actor.ok) return notFound();
  const id = attachmentIdSchema.safeParse((await params).id);
  if (!id.success) return notFound();

  try {
    const attachment = await attachmentForViewer(getDb(), actor.user, id.data);
    if (!attachment) return notFound();
    const stored = await readScreenshot(attachment.pathname);
    if (!stored) return notFound();
    return new Response(stored.stream, {
      headers: {
        "Content-Type": attachment.contentType,
        "Content-Disposition": "inline",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
      },
    });
  } catch (error) {
    console.error("Screenshot could not be read:", describeDatabaseError(error));
    return new Response(null, { status: 502, headers: { "Cache-Control": "private, no-store" } });
  }
}

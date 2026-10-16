import { getDb } from "@/db";
import { authorize } from "@/features/auth/access";
import { bellSize } from "@/features/notifications/model";
import { summary } from "@/features/notifications/notifications";

/** The bell's poll: the caller's unread count and latest notifications, never stored by anyone. */
export async function GET() {
  const caller = await authorize("active");
  if (!caller.ok) return Response.json({ error: caller.message }, { status: 401 });
  return Response.json(await summary(getDb(), caller.user.id, bellSize), {
    headers: { "Cache-Control": "private, no-store" },
  });
}

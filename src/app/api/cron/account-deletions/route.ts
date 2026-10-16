import { getDb } from "@/db";
import { isCronRequest } from "@/features/account/cron";
import { processPendingDeletions } from "@/features/account/deletion";
import { liveDeletionDeps } from "@/features/account/live";

/**
 * Vercel Cron's daily retry of account deletions that did not finish in the
 * request that asked for them (features/account/deletion.ts). Answers with
 * counts only.
 */
export async function GET(request: Request) {
  if (!isCronRequest(request)) return new Response("Unauthorized", { status: 401 });
  const outcomes = await processPendingDeletions(getDb(), liveDeletionDeps);
  return Response.json(outcomes, { headers: { "Cache-Control": "no-store" } });
}

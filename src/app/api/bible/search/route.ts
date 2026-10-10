import { getDb } from "@/db";
import { describeDatabaseError } from "@/db/types";
import { authorize } from "@/features/auth/access";
import { searchVerses } from "@/features/scripture/search-verses";
import { buildSearchQuery, parseScope, searchLimits } from "@/features/scripture/search";

const maxOffset = 5000;

/**
 * Word search over the King James Bible, for signed-in accounts. Returns one
 * page of matching verses, in canonical order, with the matched words marked.
 */
export async function GET(request: Request) {
  const actor = await authorize("active");
  if (!actor.ok) return Response.json({ message: actor.message }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const query = buildSearchQuery(params.get("q") ?? "");
  if (!query.ok) return Response.json({ message: query.message }, { status: 400 });

  const scope = parseScope(params.get("in"));
  const offsetParam = params.get("offset") ?? "0";
  const offset = /^\d{1,4}$/.test(offsetParam) ? Number(offsetParam) : -1;
  if (scope === null || offset < 0 || offset > maxOffset) {
    return Response.json({ message: "That request was not valid." }, { status: 400 });
  }

  try {
    const page = await searchVerses(getDb(), query.tsquery, scope, offset, searchLimits.pageSize);
    return Response.json(page, { headers: { "Cache-Control": "private, max-age=300" } });
  } catch (error) {
    console.error("Bible search failed:", describeDatabaseError(error));
    return Response.json({ message: "The search could not be run. Try again." }, { status: 503 });
  }
}

import { getDb } from "@/db";
import { describeDatabaseError } from "@/db/types";
import { authorize } from "@/features/auth/access";
import { getPreferences } from "@/features/preferences/current";
import { requestedTranslation } from "@/features/preferences/resolve";
import { translationParam } from "@/features/scripture/reader-location";
import { searchVerses } from "@/features/scripture/search-verses";
import { fallbackTranslation } from "@/features/scripture/translations";
import { buildSearchQuery, parseScope, searchLimits } from "@/features/scripture/search";
import { getLocale, getT } from "@/i18n/server";

const maxOffset = 5000;

/**
 * Word search over the Bible, for signed-in accounts, in the translation the
 * address names (`?t=`) or the account's own. Returns one page of matching
 * verses, in canonical order, with the matched words marked. A translation
 * that is not on offer is refused.
 */
export async function GET(request: Request) {
  const actor = await authorize("active");
  if (!actor.ok) return Response.json({ message: actor.message }, { status: 401 });
  const t = await getT("scripture");

  const params = new URL(request.url).searchParams;
  const query = buildSearchQuery(params.get("q") ?? "", await getLocale());
  if (!query.ok) return Response.json({ message: query.message }, { status: 400 });

  const scope = parseScope(params.get("in"));
  const offsetParam = params.get("offset") ?? "0";
  const offset = /^\d{1,4}$/.test(offsetParam) ? Number(offsetParam) : -1;
  if (scope === null || offset < 0 || offset > maxOffset) {
    return Response.json({ message: t.errors.invalidRequest }, { status: 400 });
  }
  const named = params.get(translationParam);
  const translation = requestedTranslation(named, await getPreferences());
  if (!translation) {
    return Response.json(
      { message: t.errors.translationUnavailable },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const page = await searchVerses(
      getDb(),
      translation,
      query.tsquery,
      scope,
      offset,
      searchLimits.pageSize,
    );
    // Kept by the browser for a while only where the address says which text it is and
    // that text cannot be switched off. Otherwise the same address could come to mean
    // another translation, or one that is no longer on offer.
    const keep = named === fallbackTranslation;
    return Response.json(page, {
      headers: { "Cache-Control": keep ? "private, max-age=300" : "no-store" },
    });
  } catch (error) {
    console.error("Bible search failed:", describeDatabaseError(error));
    return Response.json({ message: t.errors.searchFailed }, { status: 503 });
  }
}

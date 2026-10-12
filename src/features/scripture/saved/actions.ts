"use server";

import { revalidatePath } from "next/cache";

import { getDb } from "@/db";
import { describeDatabaseError } from "@/db/types";
import { authorize } from "@/features/auth/access";
import { getPreferences } from "@/features/preferences/current";
import { dictionary } from "@/i18n";
import type { ActionResult } from "@/lib/action-result";
import { routes } from "@/lib/site";
import * as service from "./favorites";
import { clearHighlights, setHighlights } from "./highlights";
import type { FavoriteSummary } from "./model";
import { favoriteIdSchema, savedSchemas } from "./schemas";

export type FavoriteActionResult = ActionResult & {
  favorite?: FavoriteSummary;
  /** True when the passage was already saved: `favorite` is the one there was, unchanged. */
  existing?: boolean;
  /** Another favorite that already holds the verses asked for. Nothing was changed. */
  conflictId?: string;
};

/** The messages, in the account's language, and the translations on offer to it. */
async function context() {
  const { locale, translations } = await getPreferences();
  return {
    t: dictionary(locale, "scripture").saved.actions,
    offered: translations,
    schemas: savedSchemas(locale),
  };
}

function firstIssue(error: { issues: { message: string }[] }, fallback: string): ActionResult {
  return { ok: false, message: error.issues[0]?.message ?? fallback };
}

/** Only what a surface shows: no dates, and nothing about the account. */
function summary({ id, translation, reference, label, notes, verses }: service.Favorite) {
  return { id, translation, reference, label, notes, verses };
}

/*
 * As with the idea and tag actions: each one authorises itself when it runs,
 * takes the owner from the session, and accepts nothing that could name
 * another. Reading is not an action: the Bible page, the library, and
 * /api/bible/<book>/<chapter>/marks read for themselves.
 *
 * A mark belongs to a translation, and one that is not on offer (the Spanish
 * text while an administrator has Spanish switched off) is refused here, on
 * the server. A favorite in it is answered as missing and left as it is; the
 * same answer as for one that does not exist or is someone else's.
 */

/**
 * Saves a passage as a favorite. A passage that is already saved is not
 * saved again: the answer is the favorite there was, marked `existing`.
 */
export async function saveFavorite(input: unknown): Promise<FavoriteActionResult> {
  const actor = await authorize("active");
  if (!actor.ok) return actor;

  const { t, offered, schemas } = await context();

  const parsed = schemas.favoriteInput.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error, t.couldNotSave);
  if (!offered.includes(parsed.data.translation)) {
    return { ok: false, message: t.translationUnavailable };
  }

  try {
    const saved = await service.createFavorite(getDb(), actor.user.id, parsed.data);
    if (!saved) return { ok: false, message: t.notSaved };
    const favorite = summary(saved.favorite);
    if (saved.existing) {
      return { ok: true, message: t.alreadySaved(favorite.reference), favorite, existing: true };
    }
    revalidatePath(routes.savedScripture);
    return { ok: true, message: t.saved(favorite.reference), favorite };
  } catch (error) {
    console.error("Favorite save failed:", describeDatabaseError(error));
    return { ok: false, message: t.notSaved };
  }
}

/** Changes a favorite's label, notes, or verses. What the change leaves out is left alone. */
export async function updateFavorite(id: unknown, change: unknown): Promise<FavoriteActionResult> {
  const actor = await authorize("active");
  if (!actor.ok) return actor;

  const { t, offered, schemas } = await context();

  const favoriteId = favoriteIdSchema.safeParse(id);
  if (!favoriteId.success) return { ok: false, message: t.invalid };
  const parsed = schemas.favoriteChange.safeParse(change);
  if (!parsed.success) return firstIssue(parsed.error, t.changesNotSaved);

  try {
    const result = await service.updateFavorite(
      getDb(),
      actor.user.id,
      favoriteId.data,
      parsed.data,
      offered,
    );
    if (!result.ok) {
      // The same answer whether the favorite is missing or belongs to someone else.
      if (result.reason === "missing") return { ok: false, message: t.missing };
      return { ok: false, message: t.conflict, conflictId: result.conflictId };
    }
    revalidatePath(routes.savedScripture);
    return { ok: true, message: t.changesSaved, favorite: summary(result.favorite) };
  } catch (error) {
    console.error("Favorite update failed:", describeDatabaseError(error));
    return { ok: false, message: t.yourChangesNotSaved };
  }
}

/** Deletes a favorite. Highlights, other favorites, and ideas are untouched. */
export async function deleteFavorite(id: unknown): Promise<ActionResult> {
  const actor = await authorize("active");
  if (!actor.ok) return actor;

  const { t, offered } = await context();

  const favoriteId = favoriteIdSchema.safeParse(id);
  if (!favoriteId.success) return { ok: false, message: t.invalid };

  try {
    if (!(await service.deleteFavorite(getDb(), actor.user.id, favoriteId.data, offered))) {
      return { ok: false, message: t.missing };
    }
  } catch (error) {
    console.error("Favorite delete failed:", describeDatabaseError(error));
    return { ok: false, message: t.notRemoved };
  }
  revalidatePath(routes.savedScripture);
  return { ok: true, message: t.removed };
}

/**
 * Highlights verses in one color, or with `color: null` takes their
 * highlight off. Every verse named changes together, and no other verse does.
 */
export async function setHighlight(input: unknown): Promise<ActionResult> {
  const actor = await authorize("active");
  if (!actor.ok) return actor;

  const { t, offered, schemas } = await context();

  const parsed = schemas.highlightInput.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error, t.highlightInvalid);
  const { translation, verses, color } = parsed.data;
  if (!offered.includes(translation)) return { ok: false, message: t.translationUnavailable };

  try {
    if (color) await setHighlights(getDb(), actor.user.id, translation, verses, color);
    else await clearHighlights(getDb(), actor.user.id, translation, verses);
  } catch (error) {
    console.error("Highlight change failed:", describeDatabaseError(error));
    return { ok: false, message: color ? t.highlightNotSaved : t.highlightNotRemoved };
  }
  // The library shows and filters by a passage's colors.
  revalidatePath(routes.savedScripture);
  return { ok: true, message: color ? t.highlighted(color) : t.highlightRemoved };
}

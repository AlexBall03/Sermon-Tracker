"use server";

import { revalidatePath } from "next/cache";

import { getDb } from "@/db";
import { describeDatabaseError } from "@/db/types";
import { authorize } from "@/features/auth/access";
import type { ActionResult } from "@/lib/action-result";
import { routes } from "@/lib/site";
import * as service from "./favorites";
import { clearHighlights, setHighlights } from "./highlights";
import { highlightColorLabels, type FavoriteSummary } from "./model";
import {
  favoriteChangeSchema,
  favoriteIdSchema,
  favoriteInputSchema,
  highlightInputSchema,
} from "./schemas";

export type FavoriteActionResult = ActionResult & {
  favorite?: FavoriteSummary;
  /** True when the passage was already saved: `favorite` is the one there was, unchanged. */
  existing?: boolean;
  /** Another favorite that already holds the verses asked for. Nothing was changed. */
  conflictId?: string;
};

const invalid: ActionResult = { ok: false, message: "That request was not valid." };
// The same answer whether the favorite is missing or belongs to someone else.
const missing: ActionResult = { ok: false, message: "That saved passage no longer exists." };

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
 */

/**
 * Saves a passage as a favorite. A passage that is already saved is not
 * saved again: the answer is the favorite there was, marked `existing`.
 */
export async function saveFavorite(input: unknown): Promise<FavoriteActionResult> {
  const actor = await authorize("active");
  if (!actor.ok) return actor;

  const parsed = favoriteInputSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error, "That passage could not be saved.");

  try {
    const saved = await service.createFavorite(getDb(), actor.user.id, parsed.data);
    if (!saved) return { ok: false, message: "The passage could not be saved. Try again." };
    const favorite = summary(saved.favorite);
    if (saved.existing) {
      return {
        ok: true,
        message: `${favorite.reference} is already saved.`,
        favorite,
        existing: true,
      };
    }
    revalidatePath(routes.savedScripture);
    return { ok: true, message: `Saved ${favorite.reference}.`, favorite };
  } catch (error) {
    console.error("Favorite save failed:", describeDatabaseError(error));
    return { ok: false, message: "The passage could not be saved. Try again." };
  }
}

/** Changes a favorite's label, notes, or verses. What the change leaves out is left alone. */
export async function updateFavorite(id: unknown, change: unknown): Promise<FavoriteActionResult> {
  const actor = await authorize("active");
  if (!actor.ok) return actor;

  const favoriteId = favoriteIdSchema.safeParse(id);
  if (!favoriteId.success) return invalid;
  const parsed = favoriteChangeSchema.safeParse(change);
  if (!parsed.success) return firstIssue(parsed.error, "Those changes could not be saved.");

  try {
    const result = await service.updateFavorite(
      getDb(),
      actor.user.id,
      favoriteId.data,
      parsed.data,
    );
    if (!result.ok) {
      if (result.reason === "missing") return missing;
      return {
        ok: false,
        message: "You have already saved that passage. Neither one was changed.",
        conflictId: result.conflictId,
      };
    }
    revalidatePath(routes.savedScripture);
    return { ok: true, message: "Changes saved.", favorite: summary(result.favorite) };
  } catch (error) {
    console.error("Favorite update failed:", describeDatabaseError(error));
    return { ok: false, message: "Your changes could not be saved. Try again." };
  }
}

/** Deletes a favorite. Highlights, other favorites, and ideas are untouched. */
export async function deleteFavorite(id: unknown): Promise<ActionResult> {
  const actor = await authorize("active");
  if (!actor.ok) return actor;

  const favoriteId = favoriteIdSchema.safeParse(id);
  if (!favoriteId.success) return invalid;

  try {
    if (!(await service.deleteFavorite(getDb(), actor.user.id, favoriteId.data))) return missing;
  } catch (error) {
    console.error("Favorite delete failed:", describeDatabaseError(error));
    return { ok: false, message: "The passage could not be removed. Try again." };
  }
  revalidatePath(routes.savedScripture);
  return { ok: true, message: "Removed from your saved Scripture." };
}

/**
 * Highlights verses in one color, or with `color: null` takes their
 * highlight off. Every verse named changes together, and no other verse does.
 */
export async function setHighlight(input: unknown): Promise<ActionResult> {
  const actor = await authorize("active");
  if (!actor.ok) return actor;

  const parsed = highlightInputSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error, "Those verses could not be highlighted.");
  const { translation, verses, color } = parsed.data;

  try {
    if (color) await setHighlights(getDb(), actor.user.id, translation, verses, color);
    else await clearHighlights(getDb(), actor.user.id, translation, verses);
  } catch (error) {
    console.error("Highlight change failed:", describeDatabaseError(error));
    return {
      ok: false,
      message: color
        ? "The highlight could not be saved. Try again."
        : "The highlight could not be removed. Try again.",
    };
  }
  // The library shows and filters by a passage's colors.
  revalidatePath(routes.savedScripture);
  return {
    ok: true,
    message: color
      ? `Highlighted ${highlightColorLabels[color].toLowerCase()}.`
      : "Highlight removed.",
  };
}

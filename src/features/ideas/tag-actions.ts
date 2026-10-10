"use server";

import { revalidatePath } from "next/cache";

import { getDb } from "@/db";
import { describeDatabaseError } from "@/db/types";
import { authorize } from "@/features/auth/access";
import type { ActionResult } from "@/lib/action-result";
import { routes } from "@/lib/site";
import { ideaIdSchema, tagIdSchema, tagIdsSchema, tagNameSchema } from "./schemas";
import * as service from "./tags";
import { UnknownTagError, type IdeaTag, type TagResult } from "./tags";

export type TagActionResult = ActionResult & { tag?: IdeaTag };
export type IdeaTagsActionResult = ActionResult & { tags?: IdeaTag[] };

const invalid: ActionResult = { ok: false, message: "That request was not valid." };
// The same answers whether the record is missing or belongs to someone else.
const missingTag: ActionResult = { ok: false, message: "That tag no longer exists." };
const missingIdea: ActionResult = { ok: false, message: "That idea no longer exists." };
const unknownTag: ActionResult = { ok: false, message: "One of those tags no longer exists." };
const duplicate: ActionResult = { ok: false, message: "You already have a tag with that name." };

function refresh(ideaId?: string) {
  revalidatePath(routes.library);
  revalidatePath(routes.dashboard);
  if (ideaId) revalidatePath(`${routes.library}/${ideaId}`);
}

function saved(result: TagResult, message: string): TagActionResult {
  if (!result.ok) return result.reason === "duplicate" ? duplicate : missingTag;
  refresh();
  return { ok: true, message, tag: { id: result.tag.id, name: result.tag.name } };
}

/*
 * As with the idea actions: each one authorises itself when it runs, takes
 * the owner from the session, and accepts nothing that could name another.
 * Reading tags is not an action; pages call `listTags` themselves.
 */

export async function createTag(name: unknown): Promise<TagActionResult> {
  const actor = await authorize("active");
  if (!actor.ok) return actor;

  const parsed = tagNameSchema.safeParse(name);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "" };

  try {
    return saved(await service.createTag(getDb(), actor.user.id, parsed.data), "Tag created.");
  } catch (error) {
    console.error("Tag create failed:", describeDatabaseError(error));
    return { ok: false, message: "The tag could not be created. Try again." };
  }
}

export async function renameTag(id: unknown, name: unknown): Promise<TagActionResult> {
  const actor = await authorize("active");
  if (!actor.ok) return actor;

  const tagId = tagIdSchema.safeParse(id);
  if (!tagId.success) return invalid;
  const parsed = tagNameSchema.safeParse(name);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "" };

  try {
    return saved(
      await service.renameTag(getDb(), actor.user.id, tagId.data, parsed.data),
      "Tag renamed.",
    );
  } catch (error) {
    console.error("Tag rename failed:", describeDatabaseError(error));
    return { ok: false, message: "The tag could not be renamed. Try again." };
  }
}

/** Deletes a tag. It comes off every idea that had it; the ideas are kept. */
export async function deleteTag(id: unknown): Promise<ActionResult> {
  const actor = await authorize("active");
  if (!actor.ok) return actor;

  const tagId = tagIdSchema.safeParse(id);
  if (!tagId.success) return invalid;

  try {
    if (!(await service.deleteTag(getDb(), actor.user.id, tagId.data))) return missingTag;
  } catch (error) {
    console.error("Tag delete failed:", describeDatabaseError(error));
    return { ok: false, message: "The tag could not be deleted. Try again." };
  }
  refresh();
  return { ok: true, message: "Tag deleted." };
}

type Change = typeof service.setIdeaTags;

async function changeIdeaTags(
  change: Change,
  ideaId: unknown,
  tagIds: unknown,
): Promise<IdeaTagsActionResult> {
  const actor = await authorize("active");
  if (!actor.ok) return actor;

  const idea = ideaIdSchema.safeParse(ideaId);
  if (!idea.success) return invalid;
  const parsed = tagIdsSchema.safeParse(tagIds);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "" };

  try {
    const tags = await change(getDb(), actor.user.id, idea.data, parsed.data);
    if (!tags) return missingIdea;
    refresh(idea.data);
    return { ok: true, message: "Tags updated.", tags };
  } catch (error) {
    if (error instanceof UnknownTagError) return unknownTag;
    console.error("Idea tag change failed:", describeDatabaseError(error));
    return { ok: false, message: "The tags could not be updated. Try again." };
  }
}

/** Makes these the idea's tags, removing any others. */
export async function setIdeaTags(ideaId: unknown, tagIds: unknown) {
  return changeIdeaTags(service.setIdeaTags, ideaId, tagIds);
}

/** Adds tags to an idea, keeping the ones it has. */
export async function addIdeaTags(ideaId: unknown, tagIds: unknown) {
  return changeIdeaTags(service.addIdeaTags, ideaId, tagIds);
}

/** Takes tags off an idea. */
export async function removeIdeaTags(ideaId: unknown, tagIds: unknown) {
  return changeIdeaTags(service.removeIdeaTags, ideaId, tagIds);
}

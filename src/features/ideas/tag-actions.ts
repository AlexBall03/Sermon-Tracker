"use server";

import { revalidatePath } from "next/cache";

import { getDb } from "@/db";
import { describeDatabaseError } from "@/db/types";
import { authorize } from "@/features/auth/access";
import { dictionary, type Dictionaries } from "@/i18n";
import { getLocale } from "@/i18n/server";
import type { ActionResult } from "@/lib/action-result";
import { routes } from "@/lib/site";
import { ideaIdSchema, ideaSchemas, tagIdSchema } from "./schemas";
import * as service from "./tags";
import { UnknownTagError, type IdeaTag, type TagResult } from "./tags";

export type TagActionResult = ActionResult & { tag?: IdeaTag };
export type IdeaTagsActionResult = ActionResult & { tags?: IdeaTag[] };

type Messages = Dictionaries["ideas"]["actions"];

/** The messages and the schemas, in the account's language. */
async function context() {
  const locale = await getLocale();
  return { t: dictionary(locale, "ideas").actions, schemas: ideaSchemas(locale) };
}

function refresh(ideaId?: string) {
  revalidatePath(routes.sermonIdeas);
  revalidatePath(routes.dashboard);
  if (ideaId) revalidatePath(`${routes.library}/${ideaId}`);
}

function saved(result: TagResult, message: string, t: Messages): TagActionResult {
  // The same answer whether the tag is missing or belongs to someone else.
  if (!result.ok) {
    return { ok: false, message: result.reason === "duplicate" ? t.duplicateTag : t.missingTag };
  }
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
  const { t, schemas } = await context();

  const parsed = schemas.tagName.safeParse(name);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "" };

  try {
    return saved(await service.createTag(getDb(), actor.user.id, parsed.data), t.tagCreated, t);
  } catch (error) {
    console.error("Tag create failed:", describeDatabaseError(error));
    return { ok: false, message: t.tagNotCreated };
  }
}

export async function renameTag(id: unknown, name: unknown): Promise<TagActionResult> {
  const actor = await authorize("active");
  if (!actor.ok) return actor;
  const { t, schemas } = await context();

  const tagId = tagIdSchema.safeParse(id);
  if (!tagId.success) return { ok: false, message: t.invalid };
  const parsed = schemas.tagName.safeParse(name);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "" };

  try {
    return saved(
      await service.renameTag(getDb(), actor.user.id, tagId.data, parsed.data),
      t.tagRenamed,
      t,
    );
  } catch (error) {
    console.error("Tag rename failed:", describeDatabaseError(error));
    return { ok: false, message: t.tagNotRenamed };
  }
}

/** Deletes a tag. It comes off every idea that had it; the ideas are kept. */
export async function deleteTag(id: unknown): Promise<ActionResult> {
  const actor = await authorize("active");
  if (!actor.ok) return actor;
  const { t } = await context();

  const tagId = tagIdSchema.safeParse(id);
  if (!tagId.success) return { ok: false, message: t.invalid };

  try {
    if (!(await service.deleteTag(getDb(), actor.user.id, tagId.data))) {
      return { ok: false, message: t.missingTag };
    }
  } catch (error) {
    console.error("Tag delete failed:", describeDatabaseError(error));
    return { ok: false, message: t.tagNotDeleted };
  }
  refresh();
  return { ok: true, message: t.tagDeleted };
}

type Change = typeof service.setIdeaTags;

async function changeIdeaTags(
  change: Change,
  ideaId: unknown,
  tagIds: unknown,
): Promise<IdeaTagsActionResult> {
  const actor = await authorize("active");
  if (!actor.ok) return actor;
  const { t, schemas } = await context();

  const idea = ideaIdSchema.safeParse(ideaId);
  if (!idea.success) return { ok: false, message: t.invalid };
  const parsed = schemas.tagIds.safeParse(tagIds);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "" };

  try {
    const tags = await change(getDb(), actor.user.id, idea.data, parsed.data);
    if (!tags) return { ok: false, message: t.missing };
    refresh(idea.data);
    return { ok: true, message: t.tagsUpdated, tags };
  } catch (error) {
    if (error instanceof UnknownTagError) return { ok: false, message: t.unknownTag };
    console.error("Idea tag change failed:", describeDatabaseError(error));
    return { ok: false, message: t.tagsNotUpdated };
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

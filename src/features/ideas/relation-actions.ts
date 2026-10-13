"use server";

import { revalidatePath } from "next/cache";

import { getDb } from "@/db";
import { describeDatabaseError } from "@/db/types";
import { authorize } from "@/features/auth/access";
import { dictionary } from "@/i18n";
import { getLocale } from "@/i18n/server";
import type { ActionResult } from "@/lib/action-result";
import { routes } from "@/lib/site";
import * as service from "./relations";
import { ideaIdSchema } from "./schemas";

async function messages() {
  return dictionary(await getLocale(), "ideas").actions;
}

/** Both ideas' pages show the relation, so both are read again. Nothing else shows one. */
function refresh(id: string, otherId: string) {
  revalidatePath(`${routes.library}/${id}`);
  revalidatePath(`${routes.library}/${otherId}`);
}

/*
 * As with the idea actions: each one authorises itself when it runs and takes
 * the owner from the session. An idea that is missing and one that belongs to
 * someone else are the same answer (`missing`), and nothing is written either
 * way. Neither action changes an idea: only the relation between two.
 */

/** Relates two of the caller's ideas: two sermons, or a sermon and a point. */
export async function relateIdeas(id: unknown, otherId: unknown): Promise<ActionResult> {
  const actor = await authorize("active");
  if (!actor.ok) return actor;
  const t = await messages();

  const one = ideaIdSchema.safeParse(id);
  const other = ideaIdSchema.safeParse(otherId);
  if (!one.success || !other.success) return { ok: false, message: t.invalid };

  let outcome: service.LinkOutcome;
  try {
    outcome = await service.linkIdeas(getDb(), actor.user.id, one.data, other.data);
  } catch (error) {
    console.error("Idea relation failed:", describeDatabaseError(error));
    return { ok: false, message: t.notRelated };
  }
  if (outcome === "missing") return { ok: false, message: t.missing };
  if (outcome === "self") return { ok: false, message: t.sameIdea };
  if (outcome === "kinds") return { ok: false, message: t.wrongKinds };
  refresh(one.data, other.data);
  // Asked for twice, it is there once, and that is what was wanted.
  return { ok: true, message: outcome === "already" ? t.alreadyRelated : t.related };
}

/** Takes away the relation between two of the caller's ideas. Both ideas are kept; doing it twice is doing it once. */
export async function unrelateIdeas(id: unknown, otherId: unknown): Promise<ActionResult> {
  const actor = await authorize("active");
  if (!actor.ok) return actor;
  const t = await messages();

  const one = ideaIdSchema.safeParse(id);
  const other = ideaIdSchema.safeParse(otherId);
  if (!one.success || !other.success) return { ok: false, message: t.invalid };

  try {
    await service.unlinkIdeas(getDb(), actor.user.id, one.data, other.data);
  } catch (error) {
    console.error("Idea relation removal failed:", describeDatabaseError(error));
    return { ok: false, message: t.notUnrelated };
  }
  refresh(one.data, other.data);
  return { ok: true, message: t.unrelated };
}

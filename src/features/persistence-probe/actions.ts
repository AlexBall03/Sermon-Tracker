"use server";

import { getDb } from "@/db";
import { authorize } from "@/features/auth/access";
import { labAvailable } from "@/features/editor-lab/availability";
import { createIdea, deleteIdea, getIdea } from "@/features/ideas/ideas";
import { ideaInputSchema } from "@/features/ideas/schemas";
import { createOutline } from "@/features/outlines/outlines";
import { outlineIdSchema } from "@/features/outlines/schemas";
import { convertOutline } from "@/features/sermon-editor/persistence/conversion";
import { isProbeFixture, probeFixtureTitle } from "./model";

/*
 * The persistence probe's fixtures (A2.3B.2D), development only. The probe
 * works on nothing but a sermon it made for the run: `createProbeFixture`
 * makes one (a sermon, its outline, the outline's document) for the signed-in
 * account, and `removeProbeFixture` deletes only such a sermon, which takes
 * its outline and document with it. Outside development both refuse before
 * anything else, and the proxy has already answered every /lab address 404.
 *
 * It is its own module, not part of `src/features/editor-lab`, whose
 * boundaries (no database, no Server Action) stay as they are: the probe is
 * the one /lab page that persists anything, and only this.
 */

export type ProbeFixture =
  { ok: true; sermonId: string; outlineId: string; revision: number } | { ok: false };

export async function createProbeFixture(): Promise<ProbeFixture> {
  if (!labAvailable()) return { ok: false };
  const actor = await authorize("active");
  if (!actor.ok) return { ok: false };
  const db = getDb();
  const owner = actor.user.id;

  const sermon = await createIdea(
    db,
    owner,
    ideaInputSchema.parse({ kind: "sermon", title: probeFixtureTitle(new Date()) }),
  );
  if (!sermon) return { ok: false };
  const outline = await createOutline(db, owner, sermon.id);
  if (outline.status !== "created") return { ok: false };
  const document = await convertOutline(db, owner, outline.outline.id);
  if (document.status !== "converted") return { ok: false };
  return {
    ok: true,
    sermonId: sermon.id,
    outlineId: outline.outline.id,
    revision: document.document.revision,
  };
}

/** Deletes a probe fixture of the signed-in account's, and refuses any other sermon. */
export async function removeProbeFixture(sermonId: unknown): Promise<{ ok: boolean }> {
  if (!labAvailable()) return { ok: false };
  const actor = await authorize("active");
  if (!actor.ok) return { ok: false };
  const id = outlineIdSchema.safeParse(sermonId);
  if (!id.success) return { ok: false };
  const db = getDb();
  const sermon = await getIdea(db, actor.user.id, id.data);
  if (!sermon || !isProbeFixture(sermon)) return { ok: false };
  return { ok: (await deleteIdea(db, actor.user.id, id.data)) === "deleted" };
}

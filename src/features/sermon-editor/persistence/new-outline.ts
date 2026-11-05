import { startForNewOutline } from "@/features/appearance-presets/defaults";
import type { OutlineInitializer } from "@/features/outlines/outlines";
import { insertPreparedDocument } from "./documents";
import { initialDocument } from "./initialization";

/*
 * A genuinely new outline's first sermon document (A4.2C), given inside
 * `createOutline`'s transaction while conversion is on (the owner's decision:
 * with it off, an outline is made exactly as before, with no document and no
 * default). The lock order is the creating transaction's:
 *
 *   ideas (the sermon, FOR UPDATE, taken by createOutline)
 *     → users (FOR SHARE, `startForNewOutline`)
 *     → the default's preset (FOR KEY SHARE)
 *     → sermon_outlines (the insert)
 *     → sermon_outline_documents (the insert).
 *
 * Account deletion takes ideas before users, and every preset or default
 * change takes users before its preset, so this order waits on both and
 * deadlocks with neither (tested on real PostgreSQL connections).
 *
 * Any failure after the outline's insert throws, so the outline is never
 * kept without its document. Nothing here calls `markDeveloped`: an empty
 * outline is not yet work on the sermon.
 */

export type NewOutlineRefusal = "default_unreadable" | "account_unavailable";

export class InitializationFailed extends Error {
  constructor(readonly status: "invalid" | "too_large" | "exists") {
    super(`New outline document not made: ${status}`);
    this.name = "InitializationFailed";
  }
}

export function newOutlineDocument(
  ownerId: string,
  choice: "default" | "balanced",
): OutlineInitializer<NewOutlineRefusal> {
  return {
    async prepare(tx) {
      const resolved = await startForNewOutline(tx, ownerId, choice);
      if (resolved.status !== "start") return { ok: false, reason: resolved.status };
      return {
        ok: true,
        async build(inner, outline) {
          const made = initialDocument(outline, resolved.start);
          if (!made.ok) throw new InitializationFailed(made.status);
          const stored = await insertPreparedDocument(inner, ownerId, outline.id, made.content);
          // A new outline cannot have a document already; if it ever did, keep neither.
          if (!stored) throw new InitializationFailed("exists");
        },
      };
    },
  };
}

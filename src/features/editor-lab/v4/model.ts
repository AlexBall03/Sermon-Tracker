import { sectionRoles } from "../schema/model";

/*
 * Schema v4: the canonical sermon document. It began as the lab's
 * architecture-validation prototype; since A1 it is the document of
 * `SermonWorkspace`, and since A2.0 server and persistence code reach it only
 * through `src/features/sermon-editor/document`. It is not yet stored.
 *
 * The document is a flat sequence of ordinary blocks. A sermon point is one
 * textblock (`point`), not a container, and every top-level block carries a
 * semantic `depth`. Who owns what is worked out from the order and the
 * depths alone (`ownership.ts`); nothing stores a parent. Notes and scripts
 * stay bounded containers; lists and quotations keep their usual structure.
 * The introduction and the conclusion are roles on a main point.
 *
 * v3 (`schema/nodes.ts`) is untouched and stays the lab's baseline.
 */

export const v4SchemaVersion = 4;

/** The deepest a block may be. Generous: only a bound against nonsense, not a limit on outlines. */
export const maxDepth = 32;

/** The roles a main point may play. The same two as v3's sections. */
export const pointRoles = sectionRoles;
export type PointRole = (typeof pointRoles)[number];

/** The block types that carry a depth at the top level, besides `point`. */
export const depthTypes = [
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "blockquote",
  "scripturePassage",
  "preacherNote",
  "script",
  "pageBreak",
] as const;

/**
 * A transaction that changes structure on purpose (a v4 command): the
 * integrity guard and the depth carry (`plugins.ts`) leave it alone.
 */
export const structuralMeta = "v4Structural";

/**
 * What the editor tells the person after a structural change with
 * consequences (`plugins.ts`). `points_deleted.reparented` counts the blocks
 * the deletion left standing that now belong to another point.
 * `change_refused` is the guard's: a change that would have broken a point
 * was not made (a fallback; the editing commands never meet it).
 */
export type V4Notice =
  | { code: "point_converted"; linked: boolean }
  | { code: "point_removed"; linked: boolean }
  | { code: "points_deleted"; count: number; linked: boolean; reparented: number }
  | { code: "ownership_changed"; count: number }
  | { code: "role_dropped"; role: PointRole }
  | { code: "change_refused" };

export const noticeMeta = "v4Notice";

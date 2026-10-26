import { restoreV4, type RestoredV4 } from "@/features/editor-lab/v4/validate";
import { v4Schema } from "@/features/editor-lab/v4/schema";

/*
 * The sermon document core (A2.0): the one way server and persistence code
 * reach a Preacher Studio sermon document. It is schema v4, whose canonical
 * implementation stays in `src/features/editor-lab` (to be moved here later,
 * the owner's decision); this file only names what may be used.
 *
 * Everything here runs without a browser and without an editor: no DOM, no
 * React, no node view, no editor plugin, no offline storage. The boundary is
 * held by `core.node.test.ts`, which imports this file under Node and walks
 * its imports. Add an export only from a module that keeps it so.
 */

/** Schema v4, built once, without an editor. The same schema `SermonWorkspace`'s editor holds. */
export const sermonDocumentSchema = v4Schema;

/**
 * Checks stored or received JSON as a sermon document: an older one is
 * checked as v3 and migrated, a v4 one is checked as it is. A refused
 * document says why and is never repaired.
 */
export const restoreSermonDocument = (json: unknown): RestoredV4 => restoreV4(json, v4Schema());

export type { RestoredV4 };
export type { DocumentProblem, ProblemCode } from "@/features/editor-lab/validate";

export { v4SchemaExtensions } from "@/features/editor-lab/v4/schema";
export {
  depthTypes,
  maxDepth,
  pointRoles,
  v4SchemaVersion,
  type PointRole,
} from "@/features/editor-lab/v4/model";

// Who owns what, worked out from order and depth alone.
export {
  analyze,
  analyzeShapes,
  ownerKeys,
  reparented,
  type Analysis,
  type Shape,
  type Structure,
} from "@/features/editor-lab/v4/ownership";

// Identity: which nodes carry an `id`, and which IDs appear twice.
export { identifiedTypes } from "@/features/editor-lab/schema/nodes";
export { duplicateIds } from "@/features/editor-lab/identity";

// Older documents and legacy outlines.
export { toV3, v3ToV4, type BackToV3 } from "@/features/editor-lab/v4/migrate";
export {
  legacyToDocument,
  type ConversionIssue,
  type ConversionResult,
  type LegacyEntry,
  type LegacyOutline,
} from "@/features/editor-lab/legacy";

// Contracts a stored document keeps.
export { documentStylesSchema } from "@/features/editor-lab/styles/model";
export { referenceFrom } from "@/features/editor-lab/schema/scripture";

import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import { findComponent } from "./component-node";
import {
  appearanceSchemas,
  componentKinds,
  documentStylesSchema,
  namedStyles,
  userPresetIds,
  type ComponentKind,
  type ComponentStyle,
  type DocumentStyles,
  type NamedStyle,
  type UserPresetId,
} from "./model";

/*
 * The Appearance panel's draft (A1-UI.2B.2): what a person has changed and
 * not yet applied, across all three scopes at once (the outline, a kind of
 * component, single components).
 *
 * A draft is a set of edits, one property each, never a copy of the styles.
 * Each edit keeps the value it sets and the value that was committed when it
 * was first made (its base). So:
 *
 *   - what is shown (`mergeStyles`, `mergeAppearance`) is always the
 *     committed document with the edits laid over it: an Undo, or another
 *     control's change, shows through at once, and nothing else is replaced;
 *   - a property that changed underneath an edit since it was made is a
 *     conflict (`conflicts`), never silently overwritten;
 *   - an edit to a single component names it by ID and by the kind it was
 *     when chosen; if it is gone or became another kind, its edits are
 *     orphans (`orphans`) and are never sent to another component.
 *
 * A value is a concrete value, `null` (a color turned off, or the theme's
 * text color), or `UNSET`: "use the inherited setting", which removes the
 * property from its layer. The three are always kept apart.
 *
 * Resets are edits too: each sets `UNSET` on every property its layer sets
 * at that moment, with the same bases, so a property set meanwhile by
 * something else is left alone.
 *
 * Nothing here touches the editor: the plugin previews a draft (`plugin.ts`)
 * and `applyAppearanceDraft` writes the plan worked out here.
 */

export const UNSET = Symbol("unset");
export type Value = unknown;

export type Path =
  | { layer: "preset" }
  | { layer: "defaults"; field: string }
  | { layer: "named"; name: NamedStyle; field: string }
  | { layer: "component"; kind: ComponentKind; field: string }
  | { layer: "runningHeader"; field: string }
  | { layer: "instance"; id: string; kind: ComponentKind; field: string };

export type Edit = { path: Path; value: Value; base: Value };
/** Immutable: every change is a new draft, so the editor can compare by identity. */
export type Draft = { readonly edits: ReadonlyMap<string, Edit> };

export const emptyDraft: Draft = { edits: new Map() };

export function keyOf(path: Path): string {
  switch (path.layer) {
    case "preset":
      return "preset";
    case "defaults":
      return `defaults|${path.field}`;
    case "named":
      return `named|${path.name}|${path.field}`;
    case "component":
      return `component|${path.kind}|${path.field}`;
    case "runningHeader":
      return `runningHeader|${path.field}`;
    case "instance":
      return `instance|${path.id}|${path.field}`;
  }
}

/** Whether two values are the same: `UNSET`, `null`, and a value are never equal. */
export function same(a: Value, b: Value): boolean {
  if (a === b) return true;
  if (a === UNSET || b === UNSET || a === null || b === null) return false;
  if (typeof a !== "object" || typeof b !== "object") return false;
  const keysA = Object.keys(a as object);
  const keysB = Object.keys(b as object);
  return (
    keysA.length === keysB.length &&
    keysA.every((key) =>
      same((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
    )
  );
}

const orUnset = (value: unknown): Value => (value === undefined ? UNSET : value);

/** The layer of the committed styles a path is in (not an instance's). */
function layerOf(styles: DocumentStyles | null, path: Path): Record<string, unknown> | undefined {
  switch (path.layer) {
    case "defaults":
      return styles?.defaults as Record<string, unknown> | undefined;
    case "named":
      return styles?.named?.[path.name] as Record<string, unknown> | undefined;
    case "component":
      return styles?.components?.[path.kind] as Record<string, unknown> | undefined;
    case "runningHeader":
      return styles?.runningHeader as Record<string, unknown> | undefined;
    default:
      return undefined;
  }
}

/** What is committed at a path now. A gone component reads as unset. */
export function committedAt(
  styles: DocumentStyles | null,
  doc: ProseMirrorNode,
  path: Path,
): Value {
  if (path.layer === "preset") return orUnset(styles?.preset);
  if (path.layer === "instance") {
    const appearance = findComponent(doc, path.id)?.node.attrs.appearance as
      Record<string, unknown> | null | undefined;
    return orUnset(appearance?.[path.field]);
  }
  return orUnset(layerOf(styles, path)?.[path.field]);
}

/**
 * The draft with `path` set to `value`. An edit already there keeps its base;
 * an edit that comes back to its base is no longer an edit.
 */
export function setEdit(draft: Draft, path: Path, value: Value, committed: Value): Draft {
  const key = keyOf(path);
  const existing = draft.edits.get(key);
  const base = existing ? existing.base : committed;
  const edits = new Map(draft.edits);
  if (same(value, base)) edits.delete(key);
  else edits.set(key, { path, value, base });
  return { edits };
}

/** A layer of properties: a style, the defaults, or one component's own appearance. */
export type LayerPath =
  | { layer: "defaults" }
  | { layer: "named"; name: NamedStyle }
  | { layer: "component"; kind: ComponentKind }
  | { layer: "runningHeader" }
  | { layer: "instance"; id: string; kind: ComponentKind };

const fieldPath = (layer: LayerPath, field: string): Path => ({ ...layer, field }) as Path;

const belongs = (path: Path, layer: LayerPath): boolean =>
  path.layer === layer.layer &&
  (layer.layer === "defaults" ||
    layer.layer === "runningHeader" ||
    (layer.layer === "named" && path.layer === "named" && path.name === layer.name) ||
    (layer.layer === "component" && path.layer === "component" && path.kind === layer.kind) ||
    (layer.layer === "instance" && path.layer === "instance" && path.id === layer.id));

/** The properties a layer sets, as committed now. */
function committedLayer(
  styles: DocumentStyles | null,
  doc: ProseMirrorNode,
  layer: LayerPath,
): Record<string, unknown> {
  if (layer.layer === "instance") {
    return (findComponent(doc, layer.id)?.node.attrs.appearance ?? {}) as Record<string, unknown>;
  }
  return layerOf(styles, fieldPath(layer, "")) ?? {};
}

/**
 * Every property of a layer back to inherited: `UNSET` on each property it
 * sets, committed or drafted. A property something else sets later is not
 * named, so it is not touched.
 */
export function resetLayer(
  draft: Draft,
  styles: DocumentStyles | null,
  doc: ProseMirrorNode,
  layer: LayerPath,
): Draft {
  const fields = new Set(Object.keys(committedLayer(styles, doc, layer)));
  for (const edit of draft.edits.values()) {
    if (belongs(edit.path, layer)) fields.add((edit.path as { field: string }).field);
  }
  let next = draft;
  for (const field of fields) {
    const path = fieldPath(layer, field);
    next = setEdit(next, path, UNSET, committedAt(styles, doc, path));
  }
  return next;
}

/**
 * "Restore the outline to its preset", as `resetOutlineToPreset` does it:
 * every outline-wide style back to the preset's, the chosen preset kept, and
 * every single component's own appearance kept.
 */
export function restoreOutline(
  draft: Draft,
  styles: DocumentStyles | null,
  doc: ProseMirrorNode,
): Draft {
  let next = resetLayer(draft, styles, doc, { layer: "defaults" });
  for (const name of namedStyles) next = resetLayer(next, styles, doc, { layer: "named", name });
  for (const kind of componentKinds) {
    next = resetLayer(next, styles, doc, { layer: "component", kind });
  }
  // Outline-wide too, though not drawn yet (the header is UI.2C): the command clears it, so this does.
  return resetLayer(next, styles, doc, { layer: "runningHeader" });
}

/** A layer with its edits laid over it, kept sparse: undefined when nothing is left. */
function overlay(
  base: Record<string, unknown> | null | undefined,
  edits: Edit[],
): Record<string, unknown> | undefined {
  const next: Record<string, unknown> = { ...(base ?? {}) };
  for (const edit of edits) {
    const field = (edit.path as { field: string }).field;
    if (edit.value === UNSET) delete next[field];
    else next[field] = edit.value;
  }
  return Object.keys(next).length ? next : undefined;
}

const editsWhere = (draft: Draft, test: (path: Path) => boolean) =>
  [...draft.edits.values()].filter((edit) => test(edit.path));

/**
 * The outline's styles with the draft's outline and component edits laid
 * over them, as the schema stores them: an empty layer is left out, and
 * nothing but the version left is null.
 */
export function mergeStyles(stored: DocumentStyles | null, draft: Draft): DocumentStyles | null {
  const next: Record<string, unknown> = { ...(stored ?? { version: 1 }) };
  const preset = draft.edits.get("preset");
  if (preset) {
    if (preset.value === UNSET) delete next.preset;
    else next.preset = preset.value as UserPresetId;
  }

  const defaults = overlay(
    stored?.defaults,
    editsWhere(draft, (path) => path.layer === "defaults"),
  );
  if (defaults) next.defaults = defaults;
  else delete next.defaults;

  const named: Record<string, unknown> = { ...(stored?.named ?? {}) };
  for (const name of namedStyles) {
    const layer = overlay(
      stored?.named?.[name],
      editsWhere(draft, (path) => path.layer === "named" && path.name === name),
    );
    if (layer) named[name] = layer;
    else delete named[name];
  }
  if (Object.keys(named).length) next.named = named;
  else delete next.named;

  const header = overlay(
    stored?.runningHeader,
    editsWhere(draft, (path) => path.layer === "runningHeader"),
  );
  if (header) next.runningHeader = header;
  else delete next.runningHeader;

  const components: Record<string, unknown> = { ...(stored?.components ?? {}) };
  for (const kind of componentKinds) {
    const layer = overlay(
      stored?.components?.[kind],
      editsWhere(draft, (path) => path.layer === "component" && path.kind === kind),
    );
    if (layer) components[kind] = layer;
    else delete components[kind];
  }
  if (Object.keys(components).length) next.components = components;
  else delete next.components;

  const { version: _version, ...rest } = next;
  void _version;
  return Object.keys(rest).length ? (next as DocumentStyles) : null;
}

/** One component's own appearance with the draft's edits for it laid over it (null: none). */
export function mergeAppearance(
  appearance: ComponentStyle | null | undefined,
  draft: Draft,
  id: string,
): ComponentStyle | null {
  const edits = editsWhere(draft, (path) => path.layer === "instance" && path.id === id);
  if (!edits.length) return appearance ?? null;
  return (overlay(appearance as Record<string, unknown> | null, edits) ??
    null) as ComponentStyle | null;
}

/** Whether the draft changes this component. */
export const touches = (draft: Draft, id: string): boolean =>
  editsWhere(draft, (path) => path.layer === "instance" && path.id === id).length > 0;

/** The edits whose property was changed by something else since they were made. */
export function conflicts(
  draft: Draft,
  styles: DocumentStyles | null,
  doc: ProseMirrorNode,
): Edit[] {
  return [...draft.edits.values()].filter(
    (edit) => !orphaned(edit, doc) && !same(committedAt(styles, doc, edit.path), edit.base),
  );
}

function orphaned(edit: Edit, doc: ProseMirrorNode): boolean {
  if (edit.path.layer !== "instance") return false;
  const found = findComponent(doc, edit.path.id);
  return !found || found.kind !== edit.path.kind;
}

/** The edits for components that are gone, or are now another kind of component. */
export function orphans(draft: Draft, doc: ProseMirrorNode): Edit[] {
  return [...draft.edits.values()].filter((edit) => orphaned(edit, doc));
}

/** The draft without some of its edits. */
export function withoutEdits(draft: Draft, edits: Edit[]): Draft {
  const next = new Map(draft.edits);
  for (const edit of edits) next.delete(keyOf(edit.path));
  return { edits: next };
}

/** The draft with a conflicted edit's base moved to what is committed now: "keep my change". */
export function rebaseEdit(
  draft: Draft,
  edit: Edit,
  styles: DocumentStyles | null,
  doc: ProseMirrorNode,
): Draft {
  const next = new Map(draft.edits);
  const committed = committedAt(styles, doc, edit.path);
  if (same(edit.value, committed)) next.delete(keyOf(edit.path));
  else next.set(keyOf(edit.path), { ...edit, base: committed });
  return { edits: next };
}

export type ApplyPlan =
  | {
      ok: true;
      /** The outline's styles to write, or undefined to leave them. */
      styles?: DocumentStyles | null;
      instances: { pos: number; appearance: ComponentStyle | null }[];
    }
  | { ok: false; reason: "conflict" | "orphan" | "invalid" };

/**
 * Everything the draft would write, checked whole before anything is
 * written: no conflict, no orphan, the styles valid for the schema, and every
 * component's appearance valid for its kind. Positions are found by ID now.
 */
export function applyPlan(
  draft: Draft,
  stored: DocumentStyles | null,
  doc: ProseMirrorNode,
): ApplyPlan {
  if (orphans(draft, doc).length) return { ok: false, reason: "orphan" };
  if (conflicts(draft, stored, doc).length) return { ok: false, reason: "conflict" };
  const outlineEdits = editsWhere(draft, (path) => path.layer !== "instance");
  let styles: DocumentStyles | null | undefined;
  if (outlineEdits.length) {
    styles = mergeStyles(stored, draft);
    if (styles !== null && !documentStylesSchema.safeParse(styles).success) {
      return { ok: false, reason: "invalid" };
    }
    if (styles?.preset !== undefined && !userPresetIds.includes(styles.preset)) {
      return { ok: false, reason: "invalid" };
    }
  }
  const ids = new Set(
    editsWhere(draft, (path) => path.layer === "instance").map(
      (edit) => (edit.path as { id: string }).id,
    ),
  );
  const instances: { pos: number; appearance: ComponentStyle | null }[] = [];
  for (const id of ids) {
    const found = findComponent(doc, id)!;
    const appearance = mergeAppearance(
      found.node.attrs.appearance as ComponentStyle | null,
      draft,
      id,
    );
    if (appearance !== null && !appearanceSchemas[found.kind].safeParse(appearance).success) {
      return { ok: false, reason: "invalid" };
    }
    instances.push({ pos: found.pos, appearance });
  }
  return { ok: true, styles, instances };
}

/** Whether the draft holds anything to apply. */
export const isDirty = (draft: Draft): boolean => draft.edits.size > 0;

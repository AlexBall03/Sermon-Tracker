import type { JSONContent } from "@tiptap/core";

import { outlineLimits, type EntryType } from "@/features/outlines/model";
import { numberingConfigSchema, type NumberingConfig } from "@/features/outlines/numbering";
import { orderEntries, type Placed } from "@/features/outlines/tree";
import type { ScriptureReference } from "@/features/scripture/reference";

/*
 * Legacy outline ⇄ candidate document (PS-1A experiment; no production use).
 *
 * `legacyToDocument` walks the entries in the order `orderEntries` shows them
 * and nests each point under the point it is shown under. Every node takes its
 * entry's ID and records it as `legacyEntryId`, with the entry's revision. An
 * entry's notes become one paragraph per line, so the text, its blank lines,
 * and its leading and trailing spaces come back exactly (tested); its passages
 * become `entryPassages` in their stored order.
 *
 * `documentToLegacy` reads the document back into entries and says, in
 * `losses`, everything a legacy entry cannot hold. Nothing is dropped without
 * being reported.
 */

/** An outline entry as the outline editor receives it (`OutlineSnapshot`). */
export type LegacyEntry = {
  id: string;
  parentId: string | null;
  type: EntryType;
  position: number;
  title: string;
  notes: string | null;
  revision: number;
  references: ScriptureReference[];
  sourcePointId: string | null;
};

export type LegacyOutline = {
  id: string;
  /** The outline's shape revision. */
  revision: number;
  numbering: NumberingConfig;
  entries: LegacyEntry[];
};

export type ConversionIssue = {
  code:
    | "duplicate_section"
    | "orphan_parent"
    | "section_parent"
    | "cycle"
    | "section_with_parent"
    | "duplicate_position"
    | "invalid_numbering"
    | "too_many_entries";
  entryId?: string;
  detail?: string;
};

export type ConversionResult =
  | { ok: true; doc: JSONContent; issues: ConversionIssue[] }
  | { ok: false; issues: ConversionIssue[] };

const nodeTypeOf: Record<EntryType, string> = {
  introduction: "sermonIntroduction",
  point: "outlinePoint",
  conclusion: "sermonConclusion",
};

/** The ID of a passage converted from an entry: stable, so conversion is repeatable. */
export const referenceId = (entryId: string, index: number) => `${entryId}#ref${index + 1}`;

/** Notes as paragraphs: one per line, an empty line as an empty paragraph. */
export function notesToContent(notes: string | null): JSONContent[] {
  if (notes === null) return [];
  return notes
    .split("\n")
    .map((line) =>
      line ? { type: "paragraph", content: [{ type: "text", text: line }] } : { type: "paragraph" },
    );
}

function entryNode(entry: LegacyEntry, legacyParentId: string | null): JSONContent {
  const content: JSONContent[] = [
    entry.title
      ? { type: "entryTitle", content: [{ type: "text", text: entry.title }] }
      : { type: "entryTitle" },
  ];
  if (entry.references.length > 0) {
    content.push({
      type: "entryPassages",
      content: entry.references.map((reference, index) => ({
        type: "scriptureReference",
        attrs: { id: referenceId(entry.id, index), ...reference },
      })),
    });
  }
  content.push(...notesToContent(entry.notes));
  const attrs: Record<string, unknown> = {
    id: entry.id,
    legacyEntryId: entry.id,
    legacyRevision: entry.revision,
    derivedFrom: null,
  };
  if (entry.type === "point") {
    attrs.sourcePointId = entry.sourcePointId;
    attrs.legacyParentId = legacyParentId;
  }
  return { type: nodeTypeOf[entry.type], attrs, content };
}

export function legacyToDocument(outline: LegacyOutline): ConversionResult {
  const issues: ConversionIssue[] = [];
  const { entries } = outline;
  const byId = new Map(entries.map((entry) => [entry.id, entry]));

  // Two of a section cannot be shown: `orderEntries` shows the first. Refuse rather than drop one.
  for (const type of ["introduction", "conclusion"] as const) {
    const sections = entries.filter((entry) => entry.type === type);
    for (const extra of sections.slice(1)) {
      issues.push({ code: "duplicate_section", entryId: extra.id, detail: type });
    }
  }
  if (issues.length > 0) return { ok: false, issues };

  const numbering = numberingConfigSchema.safeParse(outline.numbering);
  if (!numbering.success) issues.push({ code: "invalid_numbering" });
  if (entries.length > outlineLimits.entries) {
    issues.push({ code: "too_many_entries", detail: String(entries.length) });
  }

  // Positions shared by two siblings: the order falls back to the IDs.
  const places = new Set<string>();
  for (const entry of entries) {
    if (entry.type !== "point") continue;
    const key = `${entry.parentId}\u0000${entry.position}`;
    if (places.has(key)) issues.push({ code: "duplicate_position", entryId: entry.id });
    places.add(key);
  }

  const placed = orderEntries(entries);
  const doc: JSONContent = {
    type: "doc",
    attrs: {
      schemaVersion: 1,
      numbering: numbering.success ? numbering.data : outline.numbering,
      legacyOutlineId: outline.id,
      legacyRevision: outline.revision,
    },
    content: [],
  };

  // The point each depth is under, as shown.
  const stack: { entry: Placed<LegacyEntry>; node: JSONContent }[] = [];
  for (const entry of placed) {
    if (entry.type !== "point") {
      if (entry.parentId !== null) {
        issues.push({ code: "section_with_parent", entryId: entry.id, detail: entry.parentId });
      }
      doc.content!.push(entryNode(entry, null));
      stack.length = 0;
      continue;
    }
    stack.length = Math.min(stack.length, entry.depth);
    const shownUnder = stack.at(-1)?.entry.id ?? null;
    let legacyParentId: string | null = null;
    if (shownUnder !== entry.parentId) {
      // The row names a parent it cannot be shown under; keep what it named.
      legacyParentId = entry.parentId;
      const named = entry.parentId === null ? undefined : byId.get(entry.parentId);
      issues.push({
        code: !named ? "orphan_parent" : named.type !== "point" ? "section_parent" : "cycle",
        entryId: entry.id,
        detail: entry.parentId ?? undefined,
      });
    }
    const node = entryNode(entry, legacyParentId);
    if (stack.length === 0) doc.content!.push(node);
    else stack.at(-1)!.node.content!.push(node);
    stack.push({ entry, node });
  }
  return { ok: true, doc, issues };
}

/** What a legacy entry cannot hold, found in a document. */
export type Loss = {
  code:
    | "formatting"
    | "unsupported_block"
    | "top_level_block"
    | "inline_scripture"
    | "hard_break"
    | "interleaved_prose"
    | "over_limit"
    | "duplicate_legacy_id"
    | "unknown_node";
  /** The entry it belongs to, when it belongs to one. */
  entryId?: string;
  /** The node type, the field, or the limit. */
  detail?: string;
  /** The words it held, so nothing is dropped unseen. */
  text?: string;
};

/** The plain text of a node, with no marks. */
function plainText(node: JSONContent): string {
  let text = "";
  const pending: JSONContent[] = [node];
  while (pending.length > 0) {
    const next = pending.pop()!;
    if (next.type === "text") text += next.text ?? "";
    const children = next.content ?? [];
    for (let index = children.length - 1; index >= 0; index -= 1) pending.push(children[index]);
  }
  return text;
}

const referenceFields = ["book", "chapterStart", "verseStart", "chapterEnd", "verseEnd"] as const;

function referenceOf(attrs: Record<string, unknown> = {}): ScriptureReference {
  return Object.fromEntries(
    referenceFields.map((field) => [field, (attrs[field] as number | null | undefined) ?? null]),
  ) as unknown as ScriptureReference;
}

const entryTypeOf: Record<string, EntryType> = {
  sermonIntroduction: "introduction",
  outlinePoint: "point",
  sermonConclusion: "conclusion",
};

export type BackResult = { outline: LegacyOutline; losses: Loss[] };

export function documentToLegacy(doc: JSONContent): BackResult {
  const losses: Loss[] = [];
  const entries: LegacyEntry[] = [];
  const usedIds = new Set<string>();
  const attrs = doc.attrs ?? {};

  const entryId = (node: JSONContent) => {
    const legacy = node.attrs?.legacyEntryId;
    const own = node.attrs?.id;
    let id = typeof legacy === "string" && legacy ? legacy : String(own ?? "");
    if (usedIds.has(id)) {
      losses.push({ code: "duplicate_legacy_id", entryId: id });
      id = String(own ?? "");
    }
    usedIds.add(id);
    return id;
  };

  // Each entry node, with the entry it is under and its place there. Depth first, in order.
  type Pending = { node: JSONContent; parentId: string | null; position: number };
  const pending: Pending[] = [];
  let topPoints = 0;
  for (const node of doc.content ?? []) {
    const type = entryTypeOf[node.type ?? ""];
    if (type) {
      pending.push({ node, parentId: null, position: type === "point" ? topPoints++ : 0 });
    } else if (node.type === "paragraph" && !node.content?.length) {
      // An empty paragraph between entries holds nothing: no words and no marks.
      continue;
    } else {
      losses.push({ code: "top_level_block", detail: node.type, text: plainText(node) });
    }
  }
  pending.reverse();

  while (pending.length > 0) {
    const { node, parentId, position } = pending.pop()!;
    const type = entryTypeOf[node.type!];
    const id = entryId(node);
    let title = "";
    const references: ScriptureReference[] = [];
    const lines: string[] = [];
    const children: Pending[] = [];
    let sawChild = false;

    for (const child of node.content ?? []) {
      switch (child.type) {
        case "entryTitle":
          title = plainText(child);
          break;
        case "entryPassages":
          for (const reference of child.content ?? [])
            references.push(referenceOf(reference.attrs));
          break;
        case "paragraph": {
          if (sawChild)
            losses.push({ code: "interleaved_prose", entryId: id, text: plainText(child) });
          let line = "";
          for (const inline of child.content ?? []) {
            if (inline.type === "text") {
              line += inline.text ?? "";
              if (inline.marks?.length) {
                losses.push({
                  code: "formatting",
                  entryId: id,
                  detail: inline.marks.map((mark) => mark.type).join(","),
                  text: inline.text,
                });
              }
            } else if (inline.type === "hardBreak") {
              losses.push({ code: "hard_break", entryId: id });
              line += "\n";
            } else if (inline.type === "scriptureReference") {
              losses.push({
                code: "inline_scripture",
                entryId: id,
                detail: JSON.stringify(referenceOf(inline.attrs)),
              });
            } else {
              losses.push({ code: "unknown_node", entryId: id, detail: inline.type });
            }
          }
          lines.push(line);
          break;
        }
        case "outlinePoint":
          sawChild = true;
          children.push({ node: child, parentId: id, position: children.length });
          break;
        default:
          losses.push({
            code: "unsupported_block",
            entryId: id,
            detail: child.type,
            text: plainText(child),
          });
      }
    }

    const notes = lines.length > 0 ? lines.join("\n") : null;
    if (title.length > outlineLimits.title) {
      losses.push({ code: "over_limit", entryId: id, detail: "title" });
    }
    if (notes && notes.length > outlineLimits.notes) {
      losses.push({ code: "over_limit", entryId: id, detail: "notes" });
    }
    if (references.length > outlineLimits.references) {
      losses.push({ code: "over_limit", entryId: id, detail: "references" });
    }
    entries.push({
      id,
      parentId,
      type,
      position,
      title,
      notes,
      revision: typeof node.attrs?.legacyRevision === "number" ? node.attrs.legacyRevision : 0,
      references,
      sourcePointId:
        type === "point" ? ((node.attrs?.sourcePointId as string | null) ?? null) : null,
    });
    for (let index = children.length - 1; index >= 0; index -= 1) pending.push(children[index]);
  }

  if (entries.length > outlineLimits.entries) {
    losses.push({ code: "over_limit", detail: "entries" });
  }
  return {
    outline: {
      id: typeof attrs.legacyOutlineId === "string" ? attrs.legacyOutlineId : "",
      revision: typeof attrs.legacyRevision === "number" ? attrs.legacyRevision : 0,
      numbering: attrs.numbering as NumberingConfig,
      entries,
    },
    losses,
  };
}

/**
 * An outline as it is shown, for comparing two: the entries in order with
 * their depth and path, and each one's place among its siblings in place of
 * its stored position (which may have gaps).
 */
export function shownOutline(outline: LegacyOutline) {
  return orderEntries(outline.entries).map((entry) => {
    const { position: _position, ...rest } = entry;
    void _position;
    return rest;
  });
}

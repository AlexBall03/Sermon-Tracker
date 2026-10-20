import type { JSONContent } from "@tiptap/core";

import { outlineLimits, type EntryType } from "@/features/outlines/model";
import { numberingConfigSchema, type NumberingConfig } from "@/features/outlines/numbering";
import { orderEntries, type Placed } from "@/features/outlines/tree";
import { formatReference, type ScriptureReference } from "@/features/scripture/reference";
import { defaultLocale, type Locale } from "@/i18n/locales";
import { layoutBeyondNumbering, layoutFromNumbering } from "./layout";
import { currentSchemaVersion } from "./schema/model";

/*
 * Legacy outline ⇄ canonical document, schema v3 (PS-1B.1 §E.2; lab only, no
 * production use).
 *
 * `legacyToDocument` is exact. It walks the entries in the order
 * `orderEntries` shows them and nests each point under the point it is shown
 * under. Every node takes its entry's ID and records it as `legacyEntryId`,
 * with the entry's revision. The introduction and conclusion become
 * `sermonSection` nodes, where `orderEntries` shows them (first and last),
 * which v2 allows but no longer requires. An entry's passages become
 * `scripturePassage` blocks straight after its title, in their stored order,
 * printed as references (so a converted outline prints as it reads today)
 * with no translation override. Its notes become one paragraph per line, so
 * the text, its blank lines, and its leading and trailing spaces come back
 * exactly (tested). The numbering becomes `layout.numbering`, verbatim.
 *
 * `documentToLegacy` is a reporting projection, for the compatibility window
 * only: it writes nothing, and says in `losses` everything a legacy entry
 * cannot hold. A document that reports a loss is not forced into legacy shape.
 * Nothing is dropped without being reported.
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

/** A passage block as conversion makes it. */
export const passageBlock = (
  id: string,
  reference: ScriptureReference,
  print: "full" | "reference" = "reference",
): JSONContent => ({
  type: "scripturePassage",
  attrs: { id, ...reference, translation: null, print },
});

function entryNode(entry: LegacyEntry, legacyParentId: string | null): JSONContent {
  const titleType = entry.type === "point" ? "pointTitle" : "sectionTitle";
  const content: JSONContent[] = [
    entry.title
      ? { type: titleType, content: [{ type: "text", text: entry.title }] }
      : { type: titleType },
  ];
  entry.references.forEach((reference, index) =>
    content.push(passageBlock(referenceId(entry.id, index), reference)),
  );
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
    attrs.presentation = null;
    return { type: "outlinePoint", attrs, content };
  }
  attrs.role = entry.type;
  return { type: "sermonSection", attrs, content };
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

  if (!numberingConfigSchema.safeParse(outline.numbering).success) {
    issues.push({ code: "invalid_numbering" });
  }
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
  const content: JSONContent[] = [];
  const doc: JSONContent = {
    type: "doc",
    attrs: {
      schemaVersion: currentSchemaVersion,
      // Verbatim, even when it does not parse: reported above, never replaced.
      layout: layoutFromNumbering(outline.numbering),
      translation: null,
      legacyOutlineId: outline.id,
      legacyRevision: outline.revision,
    },
    content,
  };

  // The point each depth is under, as shown.
  const stack: { entry: Placed<LegacyEntry>; node: JSONContent }[] = [];
  for (const entry of placed) {
    if (entry.type !== "point") {
      if (entry.parentId !== null) {
        issues.push({ code: "section_with_parent", entryId: entry.id, detail: entry.parentId });
      }
      content.push(entryNode(entry, null));
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
    if (stack.length === 0) content.push(node);
    else stack.at(-1)!.node.content!.push(node);
    stack.push({ entry, node });
  }
  // A document holds at least one block; an empty paragraph holds nothing.
  if (content.length === 0) content.push({ type: "paragraph" });
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
    | "unknown_node"
    | "title_marks"
    | "title_reference"
    | "passage_print"
    | "passage_translation"
    | "passage_position"
    | "section_position"
    | "note"
    | "page_break"
    | "layout"
    | "color"
    | "alignment"
    | "translation"
    | "presentation"
    // Schema v3 (PS-1B.2B.2): a legacy entry has no Script, style, font, or page settings.
    | "script"
    | "styles"
    | "subtitle"
    | "page"
    | "text_style"
    | "paragraph_format"
    | "appearance"
    | "font";
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

const colorMarks = new Set(["textStyle", "highlight"]);

type MarkJson = NonNullable<JSONContent["marks"]>[number];
/** A highlight, or a text style that sets a color (a text style may set only a font, schema v3). */
const hasColor = (marks: MarkJson[]) =>
  marks.some(
    (mark) =>
      mark.type === "highlight" ||
      (mark.type === "textStyle" && mark.attrs?.color !== null && mark.attrs?.color !== undefined),
  );
/** A text style that sets a font family or size (schema v3). */
const hasFont = (marks: MarkJson[]) =>
  marks.some(
    (mark) =>
      mark.type === "textStyle" &&
      ((mark.attrs?.fontFamily ?? null) !== null || (mark.attrs?.fontSize ?? null) !== null),
  );

/** The type of entry a node stands for, if it stands for one. */
function entryTypeOf(node: JSONContent): EntryType | null {
  if (node.type === "outlinePoint") return "point";
  if (node.type === "sermonSection") {
    return node.attrs?.role === "conclusion" ? "conclusion" : "introduction";
  }
  return null;
}

export type BackResult = { outline: LegacyOutline; losses: Loss[] };

export function documentToLegacy(doc: JSONContent, locale: Locale = defaultLocale): BackResult {
  const losses: Loss[] = [];
  const entries: LegacyEntry[] = [];
  const usedIds = new Set<string>();
  const attrs = doc.attrs ?? {};
  const layout = attrs.layout as { numbering?: NumberingConfig } | undefined;

  if (layoutBeyondNumbering(layout)) losses.push({ code: "layout" });
  if (attrs.translation !== null && attrs.translation !== undefined) {
    losses.push({ code: "translation", detail: String(attrs.translation) });
  }
  for (const field of ["styles", "subtitle", "page"] as const) {
    if (attrs[field] !== null && attrs[field] !== undefined) {
      losses.push({
        code: field,
        ...(field === "subtitle" ? { text: String(attrs.subtitle) } : {}),
      });
    }
  }

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
  const top = doc.content ?? [];
  let topPoints = 0;
  top.forEach((node, index) => {
    const type = entryTypeOf(node);
    if (type) {
      if (type !== "point") {
        // Legacy shows the introduction first and the conclusion last, whatever surrounds them.
        const points = (from: number, to: number) =>
          top.slice(from, to).some((other) => other.type === "outlinePoint");
        const moved = type === "introduction" ? points(0, index) : points(index + 1, top.length);
        if (moved) losses.push({ code: "section_position", entryId: node.attrs?.id, detail: type });
      }
      pending.push({ node, parentId: null, position: type === "point" ? topPoints++ : 0 });
    } else if (node.type === "paragraph" && !node.content?.length) {
      // An empty paragraph between entries holds nothing: no words and no marks.
    } else if (node.type === "pageBreak") {
      losses.push({ code: "page_break" });
    } else if (node.type === "preacherNote") {
      losses.push({ code: "note", detail: node.attrs?.kind, text: plainText(node) });
    } else if (node.type === "script") {
      losses.push({ code: "script", text: plainText(node) });
    } else {
      losses.push({ code: "top_level_block", detail: node.type, text: plainText(node) });
    }
  });
  pending.reverse();

  while (pending.length > 0) {
    const { node, parentId, position } = pending.pop()!;
    const type = entryTypeOf(node)!;
    const id = entryId(node);
    let title = "";
    const references: ScriptureReference[] = [];
    const lines: string[] = [];
    const children: Pending[] = [];
    let sawChild = false;
    let sawBody = false;

    if (type === "point" && node.attrs?.presentation) {
      losses.push({ code: "presentation", entryId: id });
    }
    if (node.attrs?.appearance) losses.push({ code: "appearance", entryId: id });

    for (const child of node.content ?? []) {
      switch (child.type) {
        case "pointTitle":
        case "sectionTitle":
          for (const inline of child.content ?? []) {
            if (inline.type === "text") {
              title += inline.text ?? "";
              const marks = inline.marks ?? [];
              if (hasColor(marks)) {
                losses.push({ code: "color", entryId: id, text: inline.text });
              }
              if (hasFont(marks)) {
                losses.push({ code: "font", entryId: id, text: inline.text });
              }
              if (marks.some((mark) => !colorMarks.has(mark.type))) {
                losses.push({
                  code: "title_marks",
                  entryId: id,
                  detail: marks.map((mark) => mark.type).join(","),
                  text: inline.text,
                });
              }
            } else if (inline.type === "scriptureReference") {
              const label = formatReference(referenceOf(inline.attrs), locale);
              title += label;
              losses.push({ code: "title_reference", entryId: id, text: label });
            } else {
              losses.push({ code: "unknown_node", entryId: id, detail: inline.type });
            }
          }
          break;
        case "scripturePassage":
          references.push(referenceOf(child.attrs));
          if (sawBody) losses.push({ code: "passage_position", entryId: id });
          if (child.attrs?.print !== "reference") {
            losses.push({ code: "passage_print", entryId: id, detail: String(child.attrs?.print) });
          }
          if (child.attrs?.translation !== null && child.attrs?.translation !== undefined) {
            losses.push({
              code: "passage_translation",
              entryId: id,
              detail: String(child.attrs.translation),
            });
          }
          if (child.attrs?.appearance) losses.push({ code: "appearance", entryId: id });
          break;
        case "paragraph": {
          sawBody = true;
          if (sawChild)
            losses.push({ code: "interleaved_prose", entryId: id, text: plainText(child) });
          if (child.attrs?.textAlign) {
            losses.push({ code: "alignment", entryId: id, detail: String(child.attrs.textAlign) });
          }
          if (child.attrs?.styleName) {
            losses.push({ code: "text_style", entryId: id, detail: String(child.attrs.styleName) });
          }
          if (child.attrs?.format) losses.push({ code: "paragraph_format", entryId: id });
          let line = "";
          for (const inline of child.content ?? []) {
            if (inline.type === "text") {
              line += inline.text ?? "";
              const marks = inline.marks ?? [];
              if (hasColor(marks)) {
                losses.push({ code: "color", entryId: id, text: inline.text });
              }
              if (hasFont(marks)) {
                losses.push({ code: "font", entryId: id, text: inline.text });
              }
              const plain = marks.filter((mark) => !colorMarks.has(mark.type));
              if (plain.length) {
                losses.push({
                  code: "formatting",
                  entryId: id,
                  detail: plain.map((mark) => mark.type).join(","),
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
          sawBody = true;
          sawChild = true;
          children.push({ node: child, parentId: id, position: children.length });
          break;
        case "script":
          sawBody = true;
          losses.push({ code: "script", entryId: id, text: plainText(child) });
          break;
        case "preacherNote":
          sawBody = true;
          losses.push({
            code: "note",
            entryId: id,
            detail: child.attrs?.kind,
            text: plainText(child),
          });
          break;
        default:
          sawBody = true;
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
      numbering: layout?.numbering as NumberingConfig,
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

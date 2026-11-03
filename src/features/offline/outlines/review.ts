import type { EntryType } from "@/features/outlines/model";
import { numberOutline, type NumberingConfig } from "@/features/outlines/numbering";
import { orderEntries } from "@/features/outlines/tree";
import { formatReference, type ScriptureReference } from "@/features/scripture/reference";
import type { Locale } from "@/i18n/locales";

/*
 * A legacy outline kept on this device, as it is reviewed once the outline is
 * a sermon document (A2.3D): read only, in its order, with its numbers, so it
 * can be read and copied. No React and no storage: the converted outline's
 * view (offline/components/converted-outline.tsx) draws it, and copying takes
 * its plain text. Nothing here turns it into a document or merges it.
 */

/** What an entry needs to be reviewed: the editor's rows and the device's entries both fit. */
export type ReviewSource = {
  id: string;
  parentId: string | null;
  type: EntryType;
  position: number;
  title: string;
  notes: string | null;
  references: readonly ScriptureReference[];
};

export type ReviewEntry = {
  id: string;
  type: EntryType;
  /** Its number ("I.", "A."), empty for the introduction and the conclusion. */
  label: string;
  /** 0 for the introduction, the conclusion, and a main point. */
  depth: number;
  title: string;
  notes: string;
  passages: string[];
};

/** The entries in outline order, each with its number and its passages as they are written. */
export function reviewEntries(
  entries: readonly ReviewSource[],
  numbering: NumberingConfig,
  locale: Locale,
): ReviewEntry[] {
  const placed = orderEntries(entries.map((entry) => ({ ...entry })));
  const labels = numberOutline(placed, numbering);
  return placed.map((entry) => ({
    id: entry.id,
    type: entry.type,
    label: labels.get(entry.id) ?? "",
    depth: entry.depth,
    title: entry.title,
    notes: entry.notes ?? "",
    passages: entry.references.map((reference) => formatReference(reference, locale)),
  }));
}

export type ReviewWords = {
  introduction: string;
  conclusion: string;
  untitled: string;
};

/** One entry as plain text: its heading line, its notes, and its passages, indented by depth. */
export function entryAsText(entry: ReviewEntry, words: ReviewWords): string {
  const indent = "  ".repeat(entry.depth);
  const heading =
    entry.type === "introduction"
      ? `${words.introduction}${entry.title ? `: ${entry.title}` : ""}`
      : entry.type === "conclusion"
        ? `${words.conclusion}${entry.title ? `: ${entry.title}` : ""}`
        : `${entry.label ? `${entry.label} ` : ""}${entry.title || words.untitled}`;
  const lines = [indent + heading];
  for (const line of entry.notes ? entry.notes.split("\n") : []) lines.push(`${indent}  ${line}`);
  if (entry.passages.length > 0) lines.push(`${indent}  ${entry.passages.join("; ")}`);
  return lines.join("\n");
}

/** The whole outline as plain text, under its sermon's title. */
export function outlineAsText(title: string, entries: readonly ReviewEntry[], words: ReviewWords) {
  return [title, "", ...entries.map((entry) => entryAsText(entry, words))].join("\n");
}

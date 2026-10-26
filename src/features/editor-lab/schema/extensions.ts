import { getSchema, type Extensions } from "@tiptap/core";

import { defaultLocale, type Locale } from "@/i18n/locales";
import { DocumentClipboard, type ClipboardNotice } from "../clipboard";
import { NodeIdentity, type IdFactory } from "../identity";
import { OutlineNumbering } from "../numbering";
import { OutlineKeymap } from "../outline-commands";
import { PassageExpansion } from "../pagination/expansion";
import { PrintLayout, type PrintLayoutOptions } from "../pagination/plugin";
import { DocumentStylesExtension } from "../styles/plugin";
import { GapCaret } from "../gap-caret";
import { ClickPlacement } from "../click-placement";
import { v3SchemaExtensions } from "./document-schema";
import { ScripturePassageNodeView } from "./scripture-view";

export type LabExtensionOptions = {
  locale?: Locale;
  newId?: IdFactory;
  onNotice?: (notice: ClipboardNotice) => void;
  /** Where Print Layout starts, and who hears of the page count (PS-1B.2B.1). Regular Layout by default. */
  printLayout?: Partial<PrintLayoutOptions>;
};

/**
 * Everything the lab's editor is made of: schema v3 (PS-1B.1 §B.2, PS-1B.2B.2). StarterKit
 * gives the manuscript (paragraphs, headings 1–4, lists, quotations, bold,
 * italic, underline, hard breaks, undo and redo); the approved Tiptap
 * extensions give color, highlight, and alignment; the sermon's own nodes,
 * identity, numbering, clipboard, and structure commands are the lab's, and
 * so are Print Layout and the passages' expansion (view state only).
 *
 * The schema is `v3SchemaExtensions` (`document-schema.ts`), with the
 * passage's node view; everything after it is behaviour and adds nothing to
 * the schema.
 */
export function labExtensions({
  locale = defaultLocale,
  newId,
  onNotice,
  printLayout,
}: LabExtensionOptions = {}): Extensions {
  const ids = newId ?? (() => crypto.randomUUID());
  return [
    ...v3SchemaExtensions({ locale, passage: ScripturePassageNodeView }),
    DocumentStylesExtension,
    OutlineNumbering,
    NodeIdentity.configure({ newId: ids }),
    DocumentClipboard.configure({ newId: ids, onNotice }),
    OutlineKeymap,
    GapCaret,
    ClickPlacement,
    PassageExpansion,
    printLayout ? PrintLayout.configure(printLayout) : PrintLayout,
  ];
}

/** The lab editor's whole schema; the same as `v3Schema()` (`document-schema.ts`), which needs no editor. */
export const labSchema = () => getSchema(labExtensions());

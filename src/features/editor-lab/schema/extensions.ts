import { getSchema, type Extensions } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";

import { defaultLocale, type Locale } from "@/i18n/locales";
import { DocumentClipboard, type ClipboardNotice } from "../clipboard";
import { NodeIdentity, type IdFactory } from "../identity";
import { OutlineNumbering } from "../numbering";
import { OutlineKeymap } from "../outline-commands";
import { PassageExpansion } from "../pagination/expansion";
import { PrintLayout, type PrintLayoutOptions } from "../pagination/plugin";
import { StyleAttributes } from "../styles/attributes";
import { formattingExtensions } from "./formatting";
import {
  LabDocument,
  OutlinePoint,
  PageBreak,
  PointTitle,
  PreacherNote,
  Script,
  SectionTitle,
  SermonSection,
} from "./nodes";
import { ScripturePassageNode, ScriptureReferenceNode } from "./scripture";

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
 */
export function labExtensions({
  locale = defaultLocale,
  newId,
  onNotice,
  printLayout,
}: LabExtensionOptions = {}): Extensions {
  const ids = newId ?? (() => crypto.randomUUID());
  return [
    StarterKit.configure({
      document: false,
      heading: { levels: [1, 2, 3, 4] },
      code: false,
      codeBlock: false,
      horizontalRule: false,
      link: false,
      strike: false,
      // No paragraph is forced at the end: a document may end with a section or a point.
      trailingNode: false,
    }),
    ...formattingExtensions,
    LabDocument,
    SermonSection,
    SectionTitle,
    OutlinePoint,
    PointTitle,
    PreacherNote,
    Script,
    StyleAttributes,
    PageBreak,
    ScriptureReferenceNode.configure({ locale }),
    ScripturePassageNode.configure({ locale }),
    OutlineNumbering,
    NodeIdentity.configure({ newId: ids }),
    DocumentClipboard.configure({ newId: ids, onNotice }),
    OutlineKeymap,
    PassageExpansion,
    printLayout ? PrintLayout.configure(printLayout) : PrintLayout,
  ];
}

/** The document schema alone, for checking JSON without an editor. */
export const labSchema = () => getSchema(labExtensions());

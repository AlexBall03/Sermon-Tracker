import { getSchema, type Extensions } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";

import { defaultLocale, type Locale } from "@/i18n/locales";
import { NodeIdentity, type IdFactory } from "../identity";
import { OutlineNumbering } from "../numbering";
import { OutlineKeymap } from "../outline-commands";
import {
  EntryPassages,
  EntryTitle,
  LabDocument,
  OutlinePoint,
  SermonConclusion,
  SermonIntroduction,
} from "./nodes";
import { ScriptureReferenceNode } from "./scripture";

export type LabExtensionOptions = { locale?: Locale; newId?: IdFactory };

/**
 * Everything the lab's editor is made of. StarterKit gives the manuscript
 * (paragraphs, headings, lists, quotations, bold, italic, underline, hard
 * breaks, undo and redo); what an outline needs beyond it is the lab's own.
 */
export function labExtensions({
  locale = defaultLocale,
  newId,
}: LabExtensionOptions = {}): Extensions {
  return [
    StarterKit.configure({
      document: false,
      heading: { levels: [2, 3, 4] },
      code: false,
      codeBlock: false,
      horizontalRule: false,
      link: false,
      strike: false,
      // The schema allows nothing after the conclusion, so no trailing paragraph is forced.
      trailingNode: false,
    }),
    LabDocument,
    SermonIntroduction,
    SermonConclusion,
    OutlinePoint,
    EntryTitle,
    EntryPassages,
    ScriptureReferenceNode.configure({ locale }),
    OutlineNumbering,
    newId ? NodeIdentity.configure({ newId }) : NodeIdentity,
    OutlineKeymap,
  ];
}

/** The document schema alone, for checking JSON without an editor. */
export const labSchema = () => getSchema(labExtensions());

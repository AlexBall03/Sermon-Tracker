import { getSchema, type Extensions } from "@tiptap/core";
import type { Schema } from "@tiptap/pm/model";
import StarterKit from "@tiptap/starter-kit";

import { defaultLocale, type Locale } from "@/i18n/locales";
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

/*
 * What a sermon document's schema is made of, and nothing else (A2.0). Only
 * these extensions shape the schema; an editor adds its behaviour (plugins,
 * keys, decorations, node views) after them, so the schema an editor holds
 * is exactly the one built here. None of this touches the DOM, so the
 * schema can be built on a server.
 */

/** StarterKit as every sermon document has it: no code, link, strike, or rule, headings 1–4. */
export const documentStarterKit = () =>
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
  });

export type SchemaExtensionOptions = {
  locale?: Locale;
  /** The passage node; an editor passes the one with its node view (`scripture-view.ts`). */
  passage?: typeof ScripturePassageNode;
};

/** Schema v3's extensions (the lab's baseline, and what older documents are checked against). */
export function v3SchemaExtensions({
  locale = defaultLocale,
  passage = ScripturePassageNode,
}: SchemaExtensionOptions = {}): Extensions {
  return [
    documentStarterKit(),
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
    passage.configure({ locale }),
  ];
}

let v3: Schema | undefined;

/** Schema v3, built once. */
export const v3Schema = (): Schema => (v3 ??= getSchema(v3SchemaExtensions()));

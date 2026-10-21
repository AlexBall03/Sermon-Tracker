import { getSchema, type Editor, type Extensions, type JSONContent } from "@tiptap/core";
import { EditorState } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";

import { defaultLocale, type Locale } from "@/i18n/locales";
import { ClickPlacement } from "../click-placement";
import { DocumentClipboard, type ClipboardNotice } from "../clipboard";
import { GapCaret } from "../gap-caret";
import { NodeIdentity, type IdFactory } from "../identity";
import { PassageExpansion } from "../pagination/expansion";
import { PrintLayout, type PrintLayoutOptions } from "../pagination/plugin";
import { formattingExtensions, LabTextAlign } from "../schema/formatting";
import { PageBreak, Script } from "../schema/nodes";
import { ScripturePassageNode, ScriptureReferenceNode } from "../schema/scripture";
import { StyleAttributes } from "../styles/attributes";
import { DocumentStylesExtension } from "../styles/plugin";
import type { PresetId } from "../styles/presets";
import { CaretSync } from "./caret-sync";
import { V4Keymap } from "./keymap";
import { ComponentLabelsV4, type ComponentLabels } from "./labels";
import { PaperV4 } from "./paper";
import type { V4Notice } from "./model";
import { NumberingV4, type RoleNumbering } from "./numbering";
import { V4Plugins } from "./plugins";
import { DepthAttribute, DocumentV4, PointNode, PreacherNoteV4, TextAlignV4 } from "./schema";
import { restoreV4, type RestoredV4 } from "./validate";

export type V4ExtensionOptions = {
  locale?: Locale;
  newId?: IdFactory;
  onNotice?: (notice: V4Notice) => void;
  onClipboardNotice?: (notice: ClipboardNotice) => void;
  printLayout?: Partial<PrintLayoutOptions>;
  roles?: RoleNumbering;
  /** The presentation preset (A1-UI.1); Balanced unless another is named. */
  preset?: PresetId;
  /** The words that say what a note or a script is (drawn and given to assistive technology); none when left out. */
  componentLabels?: ComponentLabels;
};

/**
 * The v4 prototype editor. Reused from v3 unchanged: StarterKit as v3
 * configures it, the formatting marks, Scripture, scripts, page breaks,
 * the style attributes and document styles, node identity, the clipboard's
 * document stamp and re-keying, Print Layout, passage expansion, the gap
 * caret, and click placement. New: the flat point, depth, the ownership
 * engine's numbering, the v4 keys, and the guards (`plugins.ts`). Gone:
 * v3's sections and nested points, their titles, and the commands that
 * existed to edit at their edges.
 */
export function labV4Extensions({
  locale = defaultLocale,
  newId,
  onNotice,
  onClipboardNotice,
  printLayout,
  roles,
  preset = "balanced",
  componentLabels,
}: V4ExtensionOptions = {}): Extensions {
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
      trailingNode: false,
    }),
    ...formattingExtensions.filter((extension) => extension !== LabTextAlign),
    TextAlignV4,
    DocumentV4,
    PointNode,
    DepthAttribute,
    PreacherNoteV4,
    Script,
    StyleAttributes,
    DocumentStylesExtension.configure({ preset }),
    PageBreak,
    ScriptureReferenceNode.configure({ locale }),
    ScripturePassageNode.configure({ locale }),
    NumberingV4.configure({ roles: roles ?? "subpoints" }),
    NodeIdentity.configure({ newId: ids }),
    DocumentClipboard.configure({ newId: ids, onNotice: onClipboardNotice }),
    V4Plugins.configure({ onNotice }),
    CaretSync,
    V4Keymap,
    ComponentLabelsV4.configure({ labels: componentLabels ?? null }),
    PaperV4,
    GapCaret,
    ClickPlacement,
    PassageExpansion,
    printLayout ? PrintLayout.configure(printLayout) : PrintLayout,
  ];
}

export const labV4Schema = () => getSchema(labV4Extensions());

/** Loads JSON as a fresh v4 document (validated, migrated from v3 when older), with empty history. */
export function loadV4(editor: Editor, json: unknown, documentKey?: string): RestoredV4 {
  const restored = restoreV4(json, editor.schema);
  if (!restored.ok) return restored;
  editor.view.updateState(EditorState.create({ doc: restored.doc, plugins: editor.state.plugins }));
  if (documentKey !== undefined) editor.storage.documentClipboard.documentKey = documentKey;
  editor.view.dispatch(editor.state.tr.setMeta("addToHistory", false));
  return restored;
}

export type { JSONContent };

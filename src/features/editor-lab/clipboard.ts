import { Extension } from "@tiptap/core";
import {
  DOMSerializer,
  Fragment,
  type Node as ProseMirrorNode,
  type Schema,
  Slice,
} from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";

import { rekeyForeign, type IdFactory } from "./identity";
import type { SectionRole } from "./schema/model";

/*
 * Copy and paste between documents (PS-1B.1 §B.6, Proposed).
 *
 * The editor knows which document it holds by a key that is never part of the
 * document (`documentKey`: in the lab, the fixture opened and when; in PS-2,
 * the stored document's ID). Copied HTML carries it on each top-level element
 * (`data-ps-document`). A paste whose HTML names another document, or names
 * none (another application, plain text), is foreign: everything in it gets
 * new IDs and loses its lineage before it arrives, and keeps only its source
 * point (`rekeyForeign`). A paste from the same document is left to the
 * identity step, which tells a copy (re-keyed, with `derivedFrom`) from a cut
 * and paste (which keeps its IDs).
 *
 * A pasted introduction or conclusion the document already has (or a second
 * one in the same paste) cannot be a second section (§B.2 invariant 1). It
 * becomes a heading with the section's title followed by its content, and the
 * editor is told (`onNotice`). Nothing is dropped.
 */

export type ClipboardNotice = { code: "section_to_heading"; role: SectionRole };

export type ClipboardOptions = {
  newId: IdFactory;
  onNotice?: (notice: ClipboardNotice) => void;
};

export type ClipboardStorage = { documentKey: string | null };

declare module "@tiptap/core" {
  interface Storage {
    documentClipboard: ClipboardStorage;
  }
}

const stamp = "data-ps-document";

/** Copied HTML that says which document it came from. */
class StampedSerializer extends DOMSerializer {
  constructor(
    schema: Schema,
    private readonly key: () => string | null,
  ) {
    const base = DOMSerializer.fromSchema(schema);
    super(base.nodes, base.marks);
  }

  serializeFragment(
    fragment: Fragment,
    options?: { document?: Document },
    target?: HTMLElement | DocumentFragment,
  ) {
    const result = super.serializeFragment(fragment, options, target);
    const key = this.key();
    if (key !== null) {
      for (const child of Array.from(result.childNodes)) {
        if (child.nodeType === 1) (child as HTMLElement).setAttribute(stamp, key);
      }
    }
    return result;
  }
}

const sourcePattern = new RegExp(`${stamp}="([^"]*)"`);

/** A section turned into a heading with its title, followed by its content. */
function sectionAsBlocks(section: ProseMirrorNode, schema: Schema): ProseMirrorNode[] {
  const blocks = [schema.nodes.heading.create({ level: 2 }, section.firstChild?.content)];
  section.forEach((child, _offset, index) => {
    if (index > 0) blocks.push(child);
  });
  return blocks;
}

export const clipboardKey = new PluginKey("labClipboard");

export const DocumentClipboard = Extension.create<ClipboardOptions, ClipboardStorage>({
  name: "documentClipboard",

  addOptions() {
    return { newId: () => crypto.randomUUID(), onNotice: undefined };
  },

  addStorage() {
    return { documentKey: null };
  },

  addProseMirrorPlugins() {
    const storage = this.storage;
    const options = this.options;
    const schema = this.editor.schema;
    // The source named by the HTML of the paste under way: undefined when the paste had no HTML.
    let source: string | null | undefined;

    return [
      new Plugin({
        key: clipboardKey,
        props: {
          clipboardSerializer: new StampedSerializer(schema, () => storage.documentKey),

          transformPastedHTML(html) {
            const match = sourcePattern.exec(html);
            source = match ? match[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&") : null;
            return html;
          },

          transformPasted(slice, view) {
            const from = source;
            source = undefined;
            const own = storage.documentKey;
            const foreign = from === undefined || from === null || from !== own;
            let result = foreign ? rekeyForeign(slice, options.newId) : slice;

            // A second introduction or conclusion becomes a heading and its content.
            const taken = new Set<string>();
            view.state.doc.forEach((child) => {
              if (child.type.name === "sermonSection") taken.add(child.attrs.role);
            });
            const nodes: ProseMirrorNode[] = [];
            let converted = false;
            let openStart = result.openStart;
            let openEnd = result.openEnd;
            const last = result.content.childCount - 1;
            result.content.forEach((child, _offset, index) => {
              if (child.type.name !== "sermonSection") {
                nodes.push(child);
                return;
              }
              const role = child.attrs.role as SectionRole;
              if (!taken.has(role)) {
                taken.add(role);
                nodes.push(child);
                return;
              }
              converted = true;
              if (index === 0) openStart = 0;
              if (index === last) openEnd = 0;
              nodes.push(...sectionAsBlocks(child, schema));
              options.onNotice?.({ code: "section_to_heading", role });
            });
            if (converted) result = new Slice(Fragment.fromArray(nodes), openStart, openEnd);
            return result;
          },
        },
      }),
    ];
  },
});

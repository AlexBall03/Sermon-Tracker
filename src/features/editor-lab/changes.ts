import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";
import { AddMarkStep, RemoveMarkStep, ReplaceStep } from "@tiptap/pm/transform";

import { identifiedTypes } from "./schema/nodes";

/*
 * Whether a change only touched text: typing, deleting characters, or marks.
 * Such a change cannot add, remove, or move a point, a section, or any node
 * with an identity, so the work that follows structure (identity, numbering,
 * the section guard) can skip it instead of walking the whole document on
 * every keystroke. Anything this cannot prove is treated as structural.
 */

const identified = new Set<string>(identifiedTypes);

function holdsIdentified(fragment: { forEach(f: (node: ProseMirrorNode) => void): void }) {
  let found = false;
  fragment.forEach((node) => {
    if (found) return;
    if (identified.has(node.type.name)) found = true;
    else if (node.content.size > 0) found = holdsIdentified(node.content);
  });
  return found;
}

export function isTextOnly(transactions: readonly Transaction[]): boolean {
  for (const tr of transactions) {
    for (let index = 0; index < tr.steps.length; index += 1) {
      const step = tr.steps[index];
      if (step instanceof AddMarkStep || step instanceof RemoveMarkStep) continue;
      if (!(step instanceof ReplaceStep)) return false;
      const before = tr.docs[index];
      const { from, to, slice } = step as unknown as {
        from: number;
        to: number;
        slice: { openStart: number; openEnd: number; content: ProseMirrorNode["content"] };
      };
      if (slice.openStart !== 0 || slice.openEnd !== 0) return false;
      const $from = before.resolve(from);
      const $to = before.resolve(to);
      // Inside one textblock, and replacing nothing that has an identity.
      if (!$from.parent.isTextblock || !$from.sameParent($to)) return false;
      let removesIdentified = false;
      before.nodesBetween(from, to, (node) => {
        if (identified.has(node.type.name) && node.isInline) removesIdentified = true;
        return !removesIdentified;
      });
      if (removesIdentified) return false;
      let inline = true;
      slice.content.forEach((node) => {
        if (!node.isInline) inline = false;
      });
      if (!inline || holdsIdentified(slice.content)) return false;
    }
  }
  return true;
}

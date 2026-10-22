"use client";

import type { EditorState } from "@tiptap/pm/state";
import { NodeSelection } from "@tiptap/pm/state";
import { useEditorState, type Editor } from "@tiptap/react";

import { componentOfNode, findComponent } from "@/features/editor-lab/styles/component-node";
import { referenceFrom } from "@/features/editor-lab/schema/scripture";
import type { ComponentKind } from "@/features/editor-lab/styles/model";
import { formatReference } from "@/features/scripture/reference";
import { useLocale } from "@/i18n/client";

/*
 * The component Component Appearance customizes (A1-UI.2B.2), by ID and by
 * the kind it was when chosen: never by position.
 *
 *   - A selected passage, note, or script is itself: a click on a passage
 *     selects it (an atom), and a caret anywhere in a note or a script's
 *     writing is in that note or script, never its point.
 *   - A caret in a point's heading is that point (or its section).
 *   - Ordinary writing, a selection across components, or the title chooses
 *     nothing, so nothing is opened: writing under a point never means the point.
 *
 * Once opened, the target is fixed. If the component is removed or becomes
 * another kind, it is reported as such and nothing is sent to anything else.
 */

export type Target = { id: string; kind: ComponentKind };

/** The component the selection is in, or null when it is in none (or spans more than one). */
export function componentAtSelection(state: EditorState): Target | null {
  const { selection } = state;
  if (selection instanceof NodeSelection) {
    const kind = componentOfNode(selection.node);
    const id = selection.node.attrs.id as string | null;
    if (kind && id) return { id, kind };
  }
  const at = (side: "from" | "to") => {
    const $pos = side === "from" ? selection.$from : selection.$to;
    for (let depth = $pos.depth; depth > 0; depth -= 1) {
      const node = $pos.node(depth);
      const kind = componentOfNode(node);
      const id = node.attrs.id as string | null;
      if (kind && id) return { id, kind };
    }
    return null;
  };
  const from = at("from");
  const to = at("to");
  return from && to && from.id === to.id ? from : null;
}

export type TargetStatus =
  | { state: "ready"; target: Target; text: string }
  | { state: "gone"; target: Target }
  | { state: "changed"; target: Target };

/** A fixed target's status and the words that name it, followed as the document changes. */
export function useComponentTarget(editor: Editor, target: Target): TargetStatus {
  const locale = useLocale();
  const found = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const component = findComponent(current.state.doc, target.id);
      if (!component) return { kind: null, text: "" };
      // What names it to a person: a passage its reference, anything else its first words.
      const reference = component.kind === "scripture" ? referenceFrom(component.node.attrs) : null;
      const words = component.node.textContent.trim();
      const text = reference
        ? formatReference(reference, locale)
        : words.length > 60
          ? `${words.slice(0, 59).trimEnd()}…`
          : words;
      return { kind: component.kind, text };
    },
    equalityFn: (a, b) => a?.kind === b?.kind && a?.text === b?.text,
  });
  if (!found || found.kind === null) return { state: "gone", target };
  if (found.kind !== target.kind) return { state: "changed", target };
  return { state: "ready", target, text: found.text };
}

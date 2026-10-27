import "fake-indexeddb/auto";

import type { Editor } from "@tiptap/core";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { documentV4, pointV4, proseV4 } from "@/features/editor-lab/v4/fixtures";
import { setPresentation } from "@/features/editor-lab/v4/plugins";
import { caret, testEditorV4 } from "@/features/editor-lab/v4/testing";
import { resetAccountMemory } from "@/features/offline/account";
import { closeOfflineDb } from "@/features/offline/db";
import type { JsonValue } from "../json";
import { readDraft } from "../recovery/store";
import { prepareSave } from "../saving";
import { createAutosaveController, type DraftStorage } from "./controller";
import { editorSource, SourceGone } from "./editor-adapter";
import { autosaveStatus, jsonEqual } from "./model";

/*
 * The editor adapter (A2.3B.1) on a real v4 editor: which transactions are
 * changes, unsubscribing, and the editor's end; and the controller on top of
 * it, against the real recovery store in fake-indexeddb.
 */

const owner = "4f1c2d3e-0000-4000-8000-00000000a11c";
const outlineId = "0b6a3c1e-9d54-4c7e-8a55-1f1f6d3b2a10";

const sermon = () =>
  documentV4([pointV4("p-1", "Grace", 1), proseV4("Mercy endures", 1), pointV4("p-2", "Hope", 1)]);

let editors: Editor[] = [];
function editor() {
  const made = testEditorV4(sermon());
  editors.push(made);
  return made;
}

function type(target: Editor, text: string, at = "p-1") {
  caret(target, at, 0);
  target.view.dispatch(target.state.tr.insertText(text));
}

function watch(target: Editor) {
  const onChange = vi.fn();
  const onEnd = vi.fn();
  const stop = editorSource(target).subscribe(onChange, onEnd);
  return { onChange, onEnd, stop };
}

beforeEach(async () => {
  await closeOfflineDb();
  globalThis.indexedDB = new IDBFactory();
  resetAccountMemory();
});
afterEach(async () => {
  for (const made of editors) if (!made.isDestroyed) made.destroy();
  editors = [];
  vi.restoreAllMocks();
  await closeOfflineDb();
});

describe("editorSource", () => {
  it("reports typing as a change", () => {
    const target = editor();
    const { onChange } = watch(target);
    type(target, "Amazing ");
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("does not report selection, focus, or view state", () => {
    const target = editor();
    const { onChange } = watch(target);
    caret(target, "p-2", 2);
    caret(target, "Mercy endures", 3);
    target.commands.focus();
    target.commands.blur();
    target.commands.setPassagesExpanded(true);
    target.commands.setLayout("print");
    target.commands.setStylesPreview(null);
    target.commands.setAppearanceTarget("p-1");
    setPresentation(target.view, "manuscript");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("reports document attributes, the preset, structure, Undo, and Redo", () => {
    const target = editor();
    const { onChange } = watch(target);
    target.view.dispatch(target.state.tr.setDocAttribute("subtitle", "Psalm 23"));
    expect(onChange).toHaveBeenCalledTimes(1);
    target.commands.setOutlinePreset("expressive");
    expect(onChange).toHaveBeenCalledTimes(2);
    const end = target.state.doc.content.size;
    target.view.dispatch(target.state.tr.insert(end, target.schema.nodes.pageBreak.create()));
    expect(onChange).toHaveBeenCalledTimes(3);
    expect(target.commands.undo()).toBe(true);
    expect(onChange).toHaveBeenCalledTimes(4);
    expect(target.commands.redo()).toBe(true);
    expect(onChange).toHaveBeenCalledTimes(5);
  });

  it("calls nothing after unsubscribing, and each subscription stops on its own", () => {
    const target = editor();
    const first = watch(target);
    const second = watch(target);
    first.stop();
    first.stop();
    type(target, "A");
    expect(first.onChange).not.toHaveBeenCalled();
    expect(second.onChange).toHaveBeenCalledTimes(1);
    second.stop();
    type(target, "B");
    target.destroy();
    expect(second.onChange).toHaveBeenCalledTimes(1);
    expect(first.onEnd).not.toHaveBeenCalled();
    expect(second.onEnd).not.toHaveBeenCalled();
  });

  it("ends once when the editor is destroyed, while the document can still be read", () => {
    const target = editor();
    const source = editorSource(target);
    let readAtEnd: unknown = null;
    const onEnd = vi.fn(() => {
      readAtEnd = source.read();
    });
    source.subscribe(vi.fn(), onEnd);
    type(target, "Last words ");
    target.destroy();
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(readAtEnd)).toContain("Last words ");
    expect(() => source.read()).toThrow(SourceGone);
  });
});

describe("the controller on the editor", () => {
  const counting = () => {
    const storage: DraftStorage = {
      writeDraft: vi.fn(async () => "written" as const),
      confirmDraft: vi.fn(async () => "cleared" as const),
      refuseDraft: vi.fn(async () => "refused" as const),
    };
    return storage;
  };

  it("writes nothing for an edit undone before its snapshot", async () => {
    const target = editor();
    const storage = counting();
    const controller = createAutosaveController({
      owner,
      outlineId,
      revision: 1,
      source: editorSource(target),
      storage,
    });
    type(target, "Wrong ");
    expect(autosaveStatus(controller.getState())).toBe("pending");
    target.commands.undo();
    const state = await controller.flush();
    expect(storage.writeDraft).not.toHaveBeenCalled();
    expect(state.sequence).toBe(0);
    expect(autosaveStatus(state)).toBe("unchanged");
    await controller.dispose();
  });

  it("keeps Spanish and emoji exactly, as the editor holds them", async () => {
    const target = editor();
    const controller = createAutosaveController({
      owner,
      outlineId,
      revision: 4,
      source: editorSource(target),
    });
    type(target, "¿Dónde está, oh muerte, tu aguijón? 🙏🏽👨‍👩‍👧 ");
    const state = await controller.flush();
    expect(autosaveStatus(state)).toBe("local");
    const read = await readDraft(owner, { outlineId, draftId: controller.draftId });
    if (read?.status !== "ok") throw new Error("expected a draft");
    const expected = prepareSave(target.getJSON());
    if (!expected.ok) throw new Error("expected a plain document");
    expect(jsonEqual(read.draft.content as JsonValue, expected.content as JsonValue)).toBe(true);
    expect(JSON.stringify(read.draft.content)).toContain(
      "¿Dónde está, oh muerte, tu aguijón? 🙏🏽👨‍👩‍👧 ",
    );
    expect(read.draft).toMatchObject({ sequence: 1, baseRevision: 4, confirmedSequence: 0 });
    await controller.dispose();
  });

  it("keeps the last words when the editor is destroyed before the snapshot was due", async () => {
    const target = editor();
    const controller = createAutosaveController({
      owner,
      outlineId,
      revision: 2,
      source: editorSource(target),
    });
    type(target, "Unsaved ending ");
    target.destroy();
    expect(controller.getState().disposed).toBe(true);
    const state = await controller.flush();
    expect(state.localSequence).toBe(1);
    const read = await readDraft(owner, { outlineId, draftId: controller.draftId });
    if (read?.status !== "ok") throw new Error("expected a draft");
    expect(JSON.stringify(read.draft.content)).toContain("Unsaved ending ");
  });
});

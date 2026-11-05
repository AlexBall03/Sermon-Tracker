import { Editor, type JSONContent } from "@tiptap/core";
import { undoDepth } from "@tiptap/pm/history";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ref } from "@/features/editor-lab/fixtures";
import { findComponent } from "@/features/editor-lab/styles/component-node";
import { documentStylesKey } from "@/features/editor-lab/styles/plugin";
import { readStyles } from "@/features/editor-lab/styles/resolve";
import type { AppearanceSnapshot } from "@/features/editor-lab/styles/snapshot";
import { labV4Extensions, loadV4 } from "@/features/editor-lab/v4/extensions";
import { documentV4, passageV4, pointV4, proseV4 } from "@/features/editor-lab/v4/fixtures";
import {
  AppearanceDialogsProvider,
  useAppearanceDialogs,
  type AppearanceDialogs,
} from "@/features/sermon-editor/appearance/dialogs";
import { I18nProvider } from "@/i18n/client";

// The server actions are never reached from here: the library is given to the provider.
vi.mock("../actions", () => {
  const unused = () => {
    throw new Error("not reached in these tests");
  };
  return Object.fromEntries(
    [
      "createAppearancePreset",
      "deleteAppearancePreset",
      "duplicateAppearancePreset",
      "getAppearanceDefault",
      "getAppearancePreset",
      "listAppearancePresets",
      "renameAppearancePreset",
      "replaceAppearancePresetAppearance",
      "setAppearanceDefault",
    ].map((name) => [name, unused]),
  );
});

import { PresetLibraryProvider, type PresetLibrary } from "./preset-library";

/*
 * Personal presets in Outline Settings (A4.2C), as a person uses them, over
 * the one Appearance session: Preview is a draft, Apply is one undo step,
 * Cancel leaves the outline as it was, single components are kept, and Save
 * and Update take the previewed appearance without touching the outline.
 */

const editors: Editor[] = [];
afterEach(() => {
  while (editors.length) {
    const editor = editors.pop()!;
    editor.view.dom.parentElement?.remove();
    editor.destroy();
  }
});

const mine: AppearanceSnapshot = {
  version: 1,
  preset: "expressive",
  presetRevision: 2,
  defaults: { fontSize: 13 },
  numbering: { version: 1, preset: "decimal" },
};
const meta = (revision = 1, name = "Sunday") => ({
  id: "11111111-1111-4111-8111-111111111111",
  name,
  revision,
  basePreset: "expressive" as const,
  createdAt: new Date("2026-11-01"),
  updatedAt: new Date("2026-11-01"),
});

function library(overrides: Partial<PresetLibrary> = {}): PresetLibrary {
  return {
    list: vi.fn(async () => ({
      ok: true,
      message: "",
      page: { items: [meta()], total: 1, page: 1, pageSize: 25 },
    })),
    get: vi.fn(async () => ({ ok: true, message: "", preset: meta(), appearance: mine })),
    create: vi.fn(async () => ({
      ok: true,
      message: "",
      id: "x",
      preset: meta(1, "New"),
      replayed: false,
    })),
    duplicate: vi.fn(),
    rename: vi.fn(),
    replace: vi.fn(async () => ({ ok: true, message: "", preset: meta(2) })),
    remove: vi.fn(),
    getDefault: vi.fn(),
    setDefault: vi.fn(),
    ...overrides,
  } as PresetLibrary;
}

function open() {
  const element = document.createElement("div");
  document.body.append(element);
  const editor = new Editor({
    element,
    extensions: labV4Extensions({ preset: "balanced" }),
    editorProps: { attributes: { class: "lab-editor" } },
  });
  const content: JSONContent = documentV4([
    pointV4("p-1", "The lamp", 1),
    proseV4("Light for the next step.", 1),
    passageV4("s-1", ref(19, 119, 105), 1),
    pointV4("p-2", "One step at a time", 2),
  ]);
  const loaded = loadV4(editor, content, "doc-a");
  if (!loaded.ok) throw new Error(JSON.stringify(loaded.problems));
  // A single component's own committed appearance, which a preset must keep.
  const { pos } = findComponent(editor.state.doc, "p-1")!;
  editor.view.dispatch(
    editor.state.tr
      .setNodeAttribute(pos, "appearance", { italic: true })
      .setMeta("addToHistory", false),
  );
  editors.push(editor);
  return editor;
}

let api: AppearanceDialogs;
function Keep() {
  const dialogs = useAppearanceDialogs();
  useEffect(() => {
    api = dialogs;
  }, [dialogs]);
  return null;
}
function show(editor: Editor, presets: PresetLibrary | null) {
  const tree = (
    <AppearanceDialogsProvider editor={editor}>
      <Keep />
    </AppearanceDialogsProvider>
  );
  return render(
    <I18nProvider locale="en">
      {presets ? <PresetLibraryProvider library={presets}>{tree}</PresetLibraryProvider> : tree}
    </I18nProvider>,
  );
}

const previewing = (editor: Editor) => Boolean(documentStylesKey.getState(editor.state)?.preview);
const appearanceOf = (editor: Editor, id: string) =>
  findComponent(editor.state.doc, id)?.node.attrs.appearance ?? null;
const presetRow = async () => screen.findByRole("button", { name: "Preview Sunday" });

describe("My presets in Outline Settings", () => {
  it("is not offered where the host provides no library (the labs)", () => {
    const editor = open();
    show(editor, null);
    act(() => api.openOutlineSettings());
    expect(screen.queryByTestId("outline-presets")).toBeNull();
    expect(screen.getByRole("radio", { name: /Balanced/ })).toBeChecked();
  });

  it("previews a preset as a draft, applies it in one undo step, and Undo gives it all back", async () => {
    const editor = open();
    const presets = library();
    show(editor, presets);
    act(() => api.openOutlineSettings());
    fireEvent.click(await presetRow());
    await waitFor(() => expect(previewing(editor)).toBe(true));
    // A preview only: nothing in the document yet.
    expect(readStyles(editor.state.doc.attrs.styles)).toBeNull();
    expect(screen.getByText(/Previewing “Sunday”/)).toBeInTheDocument();
    const before = editor.state.doc.toJSON();
    const depth = undoDepth(editor.state);

    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(undoDepth(editor.state)).toBe(depth + 1);
    expect(readStyles(editor.state.doc.attrs.styles)).toMatchObject({
      preset: "expressive",
      presetRevision: 2,
      defaults: { fontSize: 13 },
    });
    expect(editor.state.doc.attrs.layout.numbering).toEqual(mine.numbering);
    // The single component's own appearance and the sermon's words are kept.
    expect(appearanceOf(editor, "p-1")).toEqual({ italic: true });
    expect(editor.state.doc.textContent).toBe(editor.schema.nodeFromJSON(before).textContent);
    // Nothing in the document names the preset.
    expect(JSON.stringify(editor.state.doc.toJSON())).not.toContain(meta().id);

    act(() => {
      editor.commands.undo();
    });
    expect(editor.state.doc.toJSON()).toEqual(before);
    expect(presets.replace).not.toHaveBeenCalled();
    expect(presets.create).not.toHaveBeenCalled();
  });

  it("Cancel leaves the outline exactly as it was", async () => {
    const editor = open();
    show(editor, library());
    act(() => api.openOutlineSettings());
    const before = editor.state.doc.toJSON();
    fireEvent.click(await presetRow());
    await waitFor(() => expect(previewing(editor)).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    // Closing with a draft asks first; discard.
    const discard = screen.queryByRole("button", { name: /Discard/ });
    if (discard) fireEvent.click(discard);
    expect(editor.state.doc.toJSON()).toEqual(before);
    expect(previewing(editor)).toBe(false);
  });

  it("asks before replacing pending outline-wide edits, and keeping them keeps them", async () => {
    const editor = open();
    show(editor, library());
    act(() => api.openOutlineSettings());
    fireEvent.click(screen.getByRole("radio", { name: /Minimal/ }));
    fireEvent.click(await presetRow());
    const asking = await screen.findByRole("alertdialog", {
      name: "Replace your unapplied changes?",
    });
    fireEvent.click(within(asking).getByRole("button", { name: "Keep my changes" }));
    expect(screen.getByRole("radio", { name: /Minimal/ })).toBeChecked();

    fireEvent.click(await presetRow());
    const again = await screen.findByRole("alertdialog");
    fireEvent.click(within(again).getByRole("button", { name: "Preview preset" }));
    await waitFor(() => expect(screen.getByRole("radio", { name: /Expressive/ })).toBeChecked());
  });

  it("keeps a single component's pending edit when a preset replaces the outline-wide ones", async () => {
    const editor = open();
    show(editor, library());
    act(() => api.openOutlineSettings());
    // A pending instance edit: every component's own appearance taken away.
    fireEvent.click(screen.getByTestId("outline-resets"));
    fireEvent.click(
      screen.getByRole("menuitem", { name: "Reset all components to outline defaults" }),
    );
    fireEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Reset" }),
    );
    // Only instance edits are pending: no question.
    fireEvent.click(await presetRow());
    await waitFor(() => expect(screen.getByRole("radio", { name: /Expressive/ })).toBeChecked());
    expect(screen.queryByRole("alertdialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(appearanceOf(editor, "p-1")).toBeNull();
    expect(readStyles(editor.state.doc.attrs.styles)?.preset).toBe("expressive");
  });

  it("says an unreadable preset cannot be applied, and changes nothing", async () => {
    const editor = open();
    show(
      editor,
      library({
        get: vi.fn(async () => ({
          ok: false,
          code: "unreadable",
          message: "",
          preset: meta(),
        })) as never,
      }),
    );
    act(() => api.openOutlineSettings());
    fireEvent.click(await presetRow());
    expect(
      await screen.findByText("That preset can't be read, so it can't be applied."),
    ).toBeInTheDocument();
    expect(previewing(editor)).toBe(false);
  });
});

describe("Save as preset and Update a preset", () => {
  it("saves the previewed appearance, pending numbering included, and leaves the outline and draft alone", async () => {
    const editor = open();
    const presets = library();
    show(editor, presets);
    act(() => api.openOutlineSettings());
    fireEvent.click(screen.getByRole("radio", { name: /Minimal/ }));
    fireEvent.click(screen.getByRole("button", { name: "Numbering" }));
    fireEvent.click(screen.getByRole("radio", { name: /Decimal/ }));
    fireEvent.click(screen.getByRole("button", { name: "Appearance" }));
    const before = editor.state.doc.toJSON();

    const form = await screen.findByTestId("save-preset");
    fireEvent.change(within(form).getByRole("textbox", { name: "Preset name" }), {
      target: { value: "Evening" },
    });
    fireEvent.click(within(form).getByRole("button", { name: "Save preset" }));
    await waitFor(() => expect(presets.create).toHaveBeenCalledTimes(1));
    const sent = (presets.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(sent).toMatchObject({
      name: "Evening",
      appearance: { preset: "minimal", numbering: { version: 1, preset: "decimal" } },
    });
    expect(sent.operationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.stringify(sent)).not.toMatch(/italic|p-1|lamp/);
    // Not applied, not discarded.
    expect(editor.state.doc.toJSON()).toEqual(before);
    expect(previewing(editor)).toBe(true);
    expect(await within(form).findByText("Preset saved.")).toBeInTheDocument();
  });

  it("after a lost answer, Try again sends the very same request", async () => {
    const editor = open();
    let calls = 0;
    const create = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new TypeError("Failed to fetch");
      return { ok: true, message: "", id: "x", preset: meta(1, "Evening"), replayed: true };
    });
    show(editor, library({ create: create as never }));
    act(() => api.openOutlineSettings());
    const form = await screen.findByTestId("save-preset");
    fireEvent.change(within(form).getByRole("textbox", { name: "Preset name" }), {
      target: { value: "Evening" },
    });
    fireEvent.click(within(form).getByRole("button", { name: "Save preset" }));
    const retry = await within(form).findByRole("button", { name: "Try again" });
    expect(within(form).getByText(/couldn't confirm/)).toBeInTheDocument();
    fireEvent.click(retry);
    await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
    const [[first], [second]] = create.mock.calls as unknown as [[unknown], [unknown]];
    expect(second).toBe(first);
  });

  it("refuses to save a draft Apply would refuse, saying why", async () => {
    const editor = open();
    const presets = library();
    show(editor, presets);
    act(() => api.openOutlineSettings({ category: "numbering" }));
    // The outline's layout becomes unreadable underneath the open window.
    act(() => {
      editor.view.dispatch(editor.state.tr.setDocAttribute("layout", { version: 9 }));
    });
    fireEvent.click(screen.getByRole("button", { name: "Appearance" }));
    const form = await screen.findByTestId("save-preset");
    fireEvent.change(within(form).getByRole("textbox", { name: "Preset name" }), {
      target: { value: "Evening" },
    });
    fireEvent.click(within(form).getByRole("button", { name: "Save preset" }));
    expect(await within(form).findByText(/numbering can't be read/)).toBeInTheDocument();
    expect(presets.create).not.toHaveBeenCalled();
  });

  it("names the preset it replaces, sends its revision, and keeps the appearance after a conflict", async () => {
    const editor = open();
    const replace = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, code: "conflict", message: "", revision: 2 })
      .mockResolvedValueOnce({ ok: true, message: "", preset: meta(3) });
    const get = vi.fn(async () => ({ ok: true, message: "", preset: meta(2), appearance: mine }));
    const presets = library({ replace: replace as never, get: get as never });
    show(editor, presets);
    act(() => api.openOutlineSettings());
    fireEvent.click(screen.getByRole("radio", { name: /Minimal/ }));
    const update = await screen.findByTestId("update-preset");
    // Choose "Sunday" in the preset select.
    fireEvent.click(within(update).getByRole("combobox"));
    fireEvent.click(await screen.findByRole("option", { name: "Sunday" }));
    fireEvent.click(within(update).getByRole("button", { name: "Update preset…" }));
    const confirm = await screen.findByRole("alertdialog", {
      name: "Replace the appearance of “Sunday”?",
    });
    fireEvent.click(within(confirm).getByRole("button", { name: "Replace appearance" }));
    await waitFor(() => expect(replace).toHaveBeenCalledTimes(1));
    expect(replace.mock.calls[0][0]).toMatchObject({
      id: meta().id,
      expectedRevision: 1,
      appearance: { preset: "minimal" },
    });
    expect(
      await within(update).findByText(/changed somewhere else since you chose it/),
    ).toBeInTheDocument();

    // Replace again: read as it is now, asked again, sent at the new revision with the same appearance.
    fireEvent.click(within(update).getByRole("button", { name: "Replace again" }));
    const again = await screen.findByRole("alertdialog");
    fireEvent.click(within(again).getByRole("button", { name: "Replace appearance" }));
    await waitFor(() => expect(replace).toHaveBeenCalledTimes(2));
    expect(replace.mock.calls[1][0]).toMatchObject({
      expectedRevision: 2,
      appearance: { preset: "minimal" },
    });
    // The outline itself is never changed by the library.
    expect(readStyles(editor.state.doc.attrs.styles)).toBeNull();
  });
});

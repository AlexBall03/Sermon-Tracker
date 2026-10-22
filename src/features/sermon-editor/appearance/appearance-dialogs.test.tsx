import { Editor, type JSONContent } from "@tiptap/core";
import { undoDepth } from "@tiptap/pm/history";
import { TextSelection } from "@tiptap/pm/state";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { ref } from "@/features/editor-lab/fixtures";
import { findComponent } from "@/features/editor-lab/styles/component-node";
import type { ComponentKind, DocumentStyles } from "@/features/editor-lab/styles/model";
import { appearanceTargetKey, documentStylesKey } from "@/features/editor-lab/styles/plugin";
import { readStyles } from "@/features/editor-lab/styles/resolve";
import { labV4Extensions, loadV4 } from "@/features/editor-lab/v4/extensions";
import { documentV4, noteV4, passageV4, pointV4, proseV4 } from "@/features/editor-lab/v4/fixtures";
import { I18nProvider } from "@/i18n/client";
import { editorLab } from "@/i18n/dictionaries/en/editorLab";
import type { Locale } from "@/i18n/locales";
import { AppearanceDialogsProvider, useAppearanceDialogs, type AppearanceDialogs } from "./dialogs";
import { componentExcerpt, sampleIds, sampleOutline } from "./preview";

/*
 * Outline Settings and Component Appearance (A1-UI.2B.2 final) as a person
 * uses them: opened through the workspace's API, modal, with their own
 * preview, Apply and Cancel over one draft, the resets, and a close that never
 * applies and never silently loses a change.
 */

const editors: Editor[] = [];
afterEach(() => {
  while (editors.length) {
    const editor = editors.pop()!;
    editor.view.dom.parentElement?.remove();
    editor.destroy();
  }
});

const sermon = (styles?: DocumentStyles): JSONContent => {
  const content = documentV4([
    pointV4("intro", "Introduction", 1, { role: "introduction" }),
    proseV4("Why this psalm.", 1),
    pointV4("p-1", "The lamp", 1),
    proseV4("Light for the next step.", 1),
    passageV4("s-1", ref(19, 119, 105), 1),
    pointV4("p-2", "One step at a time", 2),
    noteV4("n-1", "Ask who walked in the dark.", 2),
  ]);
  if (styles) content.attrs = { ...content.attrs, styles };
  return content;
};

function open(styles?: DocumentStyles) {
  const element = document.createElement("div");
  document.body.append(element);
  const editor = new Editor({
    element,
    extensions: labV4Extensions({ preset: "balanced" }),
    editorProps: { attributes: { class: "lab-editor" } },
  });
  const loaded = loadV4(editor, sermon(styles), "doc-a");
  if (!loaded.ok) throw new Error(JSON.stringify(loaded.problems));
  editors.push(editor);
  return editor;
}

let api: AppearanceDialogs;
const keep = (dialogs: AppearanceDialogs) => {
  api = dialogs;
};
function Capture() {
  const dialogs = useAppearanceDialogs();
  useEffect(() => keep(dialogs), [dialogs]);
  return null;
}
function show(editor: Editor, locale: Locale = "en") {
  return render(
    <I18nProvider locale={locale}>
      <AppearanceDialogsProvider editor={editor}>
        <Capture />
      </AppearanceDialogsProvider>
    </I18nProvider>,
  );
}

const previewing = (editor: Editor) => Boolean(documentStylesKey.getState(editor.state)?.preview);
const appearanceOf = (editor: Editor, id: string) =>
  findComponent(editor.state.doc, id)?.node.attrs.appearance ?? null;
function caretIn(editor: Editor, id: string, offset = 1) {
  const { pos } = findComponent(editor.state.doc, id)!;
  editor.view.dispatch(
    editor.state.tr.setSelection(TextSelection.create(editor.state.doc, pos + offset)),
  );
}
const setNumber = (name: string, value: string) => {
  const field = screen.getByRole("textbox", { name });
  fireEvent.change(field, { target: { value } });
  fireEvent.blur(field);
};
const previewEditor = () =>
  screen.getByTestId("appearance-preview").querySelector<HTMLElement>(".lab-editor")!;
/** An editor's generated style sheet, with its scope taken out so two can be compared. */
const sheetOf = (root: HTMLElement) => {
  const id = root.getAttribute("data-sheet")!;
  const style = document.head.querySelector(`style[data-lab-sheet="${id}"]`)!;
  return style.textContent!.replaceAll(`[data-sheet="${id}"]`, "[data-sheet]");
};

describe("Outline Settings", () => {
  it("is a modal window with Appearance and its Outline and Components tabs, in both languages", () => {
    const editor = open();
    const { unmount } = show(editor);
    act(() => api.openOutlineSettings());
    const settings = screen.getByRole("dialog", { name: "Outline Settings" });
    expect(within(settings).getByRole("button", { name: "Appearance" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    for (const name of ["Outline", "Components"]) {
      expect(within(settings).getByRole("radio", { name })).toBeInTheDocument();
    }
    // Only the one component's window says "this component": no Selected scope here.
    expect(within(settings).queryByRole("radio", { name: "Selected" })).toBeNull();
    expect(within(settings).getByRole("radio", { name: /Balanced/ })).toBeChecked();
    unmount();
    show(editor, "es");
    act(() => api.openOutlineSettings());
    const spanish = screen.getByRole("dialog", { name: "Ajustes del bosquejo" });
    for (const name of ["Bosquejo", "Componentes"]) {
      expect(within(spanish).getByRole("radio", { name })).toBeInTheDocument();
    }
    expect(within(spanish).getByRole("button", { name: "Apariencia" })).toBeInTheDocument();
  });

  it("previews a change, applies it in one step, and Cancel throws a draft away", () => {
    const editor = open();
    show(editor);
    act(() => api.openOutlineSettings());
    fireEvent.click(screen.getByRole("radio", { name: /Minimal/ }));
    expect(previewing(editor)).toBe(true);
    expect(readStyles(editor.state.doc.attrs.styles)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(previewing(editor)).toBe(false);
    expect(screen.getByRole("radio", { name: /Balanced/ })).toBeChecked();

    fireEvent.click(screen.getByRole("radio", { name: /Expressive/ }));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(readStyles(editor.state.doc.attrs.styles)).toEqual({ version: 1, preset: "expressive" });
    expect(undoDepth(editor.state)).toBe(1);
    expect(screen.getByRole("status")).toHaveTextContent("Applied");
  });

  it("customizes a component type, keeping one draft across the tabs", () => {
    const editor = open();
    show(editor);
    act(() => api.openOutlineSettings());
    fireEvent.click(screen.getByRole("radio", { name: /Minimal/ }));
    fireEvent.click(screen.getByRole("radio", { name: "Components" }));
    setNumber("Size (pt)", "15");
    fireEvent.click(screen.getByRole("radio", { name: "Outline" }));
    expect(screen.getByRole("radio", { name: /Minimal/ })).toBeChecked();
    expect(screen.getByRole("status")).toHaveTextContent("outline, 1 component type");
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(readStyles(editor.state.doc.attrs.styles)).toEqual({
      version: 1,
      preset: "minimal",
      components: { point: { fontSize: 15 } },
    });
  });

  it("opens on a tab and a component type when asked", () => {
    const editor = open({ version: 1, components: { point: { fontSize: 15, italic: true } } });
    show(editor);
    act(() => api.openOutlineSettings({ tab: "components", kind: "point" }));
    const row = screen.getByText("Size (pt)").closest("[data-field]") as HTMLElement;
    expect(within(row).getByText("Customized")).toBeInTheDocument();
    fireEvent.click(
      within(row).getByRole("button", { name: "Use inherited setting for Size (pt)" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(readStyles(editor.state.doc.attrs.styles)?.components).toEqual({
      point: { italic: true },
    });
  });

  it("closes at once with nothing pending, and asks before discarding a draft", () => {
    const editor = open();
    show(editor);
    act(() => api.openOutlineSettings());
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog", { name: "Outline Settings" })).toBeNull();

    act(() => api.openOutlineSettings());
    fireEvent.click(screen.getByRole("radio", { name: /Minimal/ }));
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Outline Settings" }), {
      key: "Escape",
    });
    const ask = screen.getByRole("alertdialog", { name: "Discard appearance changes?" });
    fireEvent.click(within(ask).getByRole("button", { name: "Keep editing" }));
    expect(screen.getByRole("radio", { name: /Minimal/ })).toBeChecked();
    expect(previewing(editor)).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(screen.queryByRole("dialog", { name: "Outline Settings" })).toBeNull();
    expect(previewing(editor)).toBe(false);
    expect(readStyles(editor.state.doc.attrs.styles)).toBeNull();
  });

  it("restores original defaults only after confirming, as a draft to review", () => {
    const editor = open({
      version: 1,
      preset: "expressive",
      components: { scripture: { radius: 4 } },
    });
    const { pos } = findComponent(editor.state.doc, "n-1")!;
    editor.commands.setComponentAppearance(pos, { borderWidth: 2 });
    show(editor);
    act(() => api.openOutlineSettings());
    fireEvent.click(screen.getByTestId("outline-resets"));
    fireEvent.click(
      screen.getByRole("menuitem", { name: "Restore original Preacher Studio defaults" }),
    );
    const ask = screen.getByRole("alertdialog", {
      name: "Restore original Preacher Studio defaults?",
    });
    fireEvent.click(within(ask).getByRole("button", { name: "Cancel" }));
    expect(previewing(editor)).toBe(false);

    fireEvent.click(screen.getByTestId("outline-resets"));
    fireEvent.click(
      screen.getByRole("menuitem", { name: "Restore original Preacher Studio defaults" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(previewing(editor)).toBe(true);
    expect(screen.getByRole("radio", { name: /Balanced/ })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(readStyles(editor.state.doc.attrs.styles)).toEqual({ version: 1, preset: "balanced" });
    expect(appearanceOf(editor, "n-1")).toBeNull();
  });

  it("offers the current preset's restore, named for it, beside the other outline resets", () => {
    const editor = open({ version: 1, preset: "minimal" });
    show(editor);
    act(() => api.openOutlineSettings());
    fireEvent.click(screen.getByTestId("outline-resets"));
    expect(
      screen.getByRole("menuitem", { name: "Restore current preset (Minimal)" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Reset all components to outline defaults" }),
    ).toBeInTheDocument();
  });
});

describe("Component Appearance", () => {
  it("opens on the component the selection is in, alone, and changes only it", () => {
    const editor = open();
    show(editor);
    caretIn(editor, "n-1", 3);
    let opened = false;
    act(() => {
      opened = api.openComponentAppearance();
    });
    expect(opened).toBe(true);
    const window = screen.getByRole("dialog", { name: "Customize Appearance" });
    expect(within(window).getByTestId("appearance-target")).toHaveTextContent("Preacher note");
    expect(within(window).getByTestId("appearance-target")).toHaveTextContent(
      "Ask who walked in the dark.",
    );
    // Nothing of the outline's other settings is here.
    for (const name of ["Outline", "Components", "Appearance"]) {
      expect(within(window).queryByRole("radio", { name })).toBeNull();
    }
    expect(appearanceTargetKey.getState(editor.state)).toBe("n-1");
    setNumber("Border width (pt)", "2");
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(appearanceOf(editor, "n-1")).toEqual({ borderWidth: 2 });
    expect(appearanceOf(editor, "p-2")).toBeNull();
    expect(readStyles(editor.state.doc.attrs.styles)).toBeNull();
  });

  it("opens nothing for ordinary writing, and never takes the owning point for it", () => {
    const editor = open();
    show(editor);
    const prose = findComponent(editor.state.doc, "p-1")!;
    editor.view.dispatch(
      editor.state.tr.setSelection(
        TextSelection.create(editor.state.doc, prose.pos + prose.node.nodeSize + 2),
      ),
    );
    let opened = true;
    act(() => {
      opened = api.openComponentAppearance();
    });
    expect(opened).toBe(false);
    expect(screen.queryByRole("dialog")).toBeNull();
    act(() => {
      opened = api.openComponentAppearance("missing");
    });
    expect(opened).toBe(false);
  });

  it("opens by ID (the call UI.3's context menu will make) on that component, not its parent", () => {
    const editor = open();
    show(editor);
    act(() => {
      api.openComponentAppearance("p-2");
    });
    expect(screen.getByTestId("appearance-target")).toHaveTextContent("Subpoint");
    setNumber("Size (pt)", "16");
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(appearanceOf(editor, "p-2")).toEqual({ fontSize: 16 });
    expect(appearanceOf(editor, "p-1")).toBeNull();
  });

  it("resets this component to its type's style, which it then follows", () => {
    const editor = open({ version: 1, components: { scripture: { radius: 4 } } });
    const { pos } = findComponent(editor.state.doc, "s-1")!;
    editor.commands.setComponentAppearance(pos, { fill: "blue", radius: 8 });
    show(editor);
    act(() => {
      api.openComponentAppearance("s-1");
    });
    fireEvent.click(screen.getByRole("button", { name: "Reset this component" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(appearanceOf(editor, "s-1")).toBeNull();
    expect(readStyles(editor.state.doc.attrs.styles)?.components).toEqual({
      scripture: { radius: 4 },
    });
  });

  it("offers the whole-outline resets apart, without the current-preset one", () => {
    const editor = open();
    show(editor);
    act(() => {
      api.openComponentAppearance("p-1");
    });
    fireEvent.click(screen.getByTestId("outline-resets"));
    expect(
      screen.getByRole("menuitem", { name: "Reset all components to outline defaults" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Restore original Preacher Studio defaults" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /Restore current preset/ })).toBeNull();
  });

  it("says when its component is gone, and applies none of its changes", () => {
    const editor = open();
    show(editor);
    act(() => {
      api.openComponentAppearance("n-1");
    });
    setNumber("Border width (pt)", "2");
    act(() => {
      const { pos, node } = findComponent(editor.state.doc, "n-1")!;
      editor.view.dispatch(editor.state.tr.delete(pos, pos + node.nodeSize));
    });
    expect(screen.getByText(/This component was removed/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Discard those changes" }));
    expect(previewing(editor)).toBe(false);
  });

  it("keeps focus inside while open and gives it back to the outline when it closes", async () => {
    const editor = open();
    show(editor);
    act(() => editor.view.focus());
    act(() => {
      api.openComponentAppearance("p-1");
    });
    const window = screen.getByRole("dialog", { name: "Customize Appearance" });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(window.contains(document.activeElement)).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(document.activeElement).toBe(editor.view.dom);
  });

  it("leaves no preview and no mark behind when it closes", () => {
    const editor = open();
    show(editor);
    act(() => {
      api.openComponentAppearance("p-1");
    });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(appearanceTargetKey.getState(editor.state)).toBeNull();
    expect(previewing(editor)).toBe(false);
  });
});

describe("the preview", () => {
  it("is drawn by the same style sheet as the outline, following the draft", () => {
    const editor = open({ version: 1, defaults: { fontSize: 12 } });
    show(editor);
    act(() => api.openOutlineSettings({ tab: "components", kind: "point" }));
    const root = previewEditor();
    expect(root).toHaveAttribute("contenteditable", "false");
    expect(root.closest("[inert]")).not.toBeNull();
    // Only the picture is inert: its box still scrolls, and can be reached by keyboard.
    const scroller = screen.getByTestId("appearance-preview-scroller");
    expect(scroller.closest("[inert]")).toBeNull();
    expect(scroller).toHaveAttribute("tabindex", "0");
    expect(sheetOf(root)).toBe(sheetOf(editor.view.dom));
    setNumber("Size (pt)", "23");
    expect(sheetOf(root)).toContain("23pt");
    expect(sheetOf(root)).toBe(sheetOf(editor.view.dom));
    // The outline's document and history are untouched by the preview.
    expect(readStyles(editor.state.doc.attrs.styles)).toEqual({
      version: 1,
      defaults: { fontSize: 12 },
    });
    expect(undoDepth(editor.state)).toBe(0);
  });

  it("follows an Undo made underneath it", () => {
    const editor = open();
    editor.commands.applyDocumentStyles({ version: 1, defaults: { fontSize: 14 } });
    show(editor);
    act(() => api.openOutlineSettings());
    const root = previewEditor();
    expect(sheetOf(root)).toContain("font-size: 14pt");
    act(() => {
      editor.commands.undo();
    });
    expect(sheetOf(root)).toBe(sheetOf(editor.view.dom));
    expect(sheetOf(root)).not.toContain("font-size: 14pt");
  });

  it("marks the component type chosen on the Components tab", () => {
    const editor = open();
    show(editor);
    act(() => api.openOutlineSettings({ tab: "components", kind: "preacherNote" }));
    const marked = previewEditor().querySelector("[data-appearance-target]");
    expect(marked).toHaveAttribute("data-id", sampleIds.preacherNote);
  });

  it("shows a single component with its own draft drawn as on the outline", () => {
    const editor = open();
    show(editor);
    act(() => {
      api.openComponentAppearance("n-1");
    });
    setNumber("Border width (pt)", "3");
    const live = editor.view.nodeDOM(findComponent(editor.state.doc, "n-1")!.pos) as HTMLElement;
    const shown = previewEditor().querySelector<HTMLElement>('[data-id="n-1"]')!;
    expect(shown.getAttribute("style")).toBe(live.getAttribute("style"));
    expect(shown.getAttribute("style")).toContain("--ps-note-border-w: 3pt");
    expect(appearanceOf(editor, "n-1")).toBeNull();
  });
});

describe("the preview's documents", () => {
  const editorFor = (content: JSONContent[], attrs?: Record<string, unknown>) => {
    const editor = new Editor({
      element: document.createElement("div"),
      extensions: labV4Extensions(),
    });
    editors.push(editor);
    return loadV4(editor, { type: "doc", attrs: attrs ?? documentV4([]).attrs, content });
  };

  it("hold a sample with every kind of component, in each language, that loads as a v4 outline", async () => {
    const spanish = (await import("@/i18n/dictionaries/es/editorLab"))
      .editorLab as typeof editorLab;
    for (const words of [editorLab.appearance.sample, spanish.appearance.sample]) {
      const loaded = editorFor(sampleOutline(words));
      expect(loaded.ok).toBe(true);
      if (!loaded.ok) continue;
      for (const [kind, id] of Object.entries(sampleIds)) {
        expect(findComponent(loaded.doc, id)?.kind).toBe(kind as ComponentKind);
      }
    }
  });

  it("copy one component with the headings that own it, for every kind", () => {
    const editor = open();
    const { doc } = editor.state;
    for (const id of ["intro", "p-1", "s-1", "p-2", "n-1"]) {
      const excerpt = componentExcerpt(doc, id)!;
      const loaded = editorFor(excerpt, editor.state.doc.toJSON().attrs);
      expect(loaded.ok).toBe(true);
      if (!loaded.ok) continue;
      expect(findComponent(loaded.doc, id)?.kind).toBe(findComponent(doc, id)?.kind);
    }
    // A subpoint keeps its main point above it; a note under it keeps both.
    expect(componentExcerpt(doc, "p-2")!.map((node) => node.attrs?.id)).toEqual(["p-1", "p-2"]);
    expect(componentExcerpt(doc, "n-1")!.map((node) => node.attrs?.id)).toEqual([
      "p-1",
      "p-2",
      "n-1",
    ]);
    expect(componentExcerpt(doc, "missing")).toBeNull();
  });
});

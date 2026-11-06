import { Editor } from "@tiptap/core";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { labV4Extensions, loadV4 } from "@/features/editor-lab/v4/extensions";
import { documentV4, passageV4, pointV4, proseV4 } from "@/features/editor-lab/v4/fixtures";
import { foldingOf } from "@/features/editor-lab/v4/folding";
import { expansionKey } from "@/features/editor-lab/pagination/expansion";
import { printLayoutOf } from "@/features/editor-lab/pagination/plugin";
import { I18nProvider } from "@/i18n/client";
import type { Locale } from "@/i18n/locales";
import { readPaper, resetHeldPreferences } from "./presentation/preferences";
import { useEditorPaper } from "./presentation/use-presentation";
import { ViewMenu } from "./view-menu";

/*
 * The View menu (A3.1): points and Scripture as separate controls, each item
 * resting when it would do nothing, in both languages.
 */

const open: Editor[] = [];
afterEach(() => {
  for (const editor of open.splice(0)) editor.destroy();
});

const john = { book: 43, chapterStart: 3, verseStart: 16, chapterEnd: null, verseEnd: null };

function make(
  content = documentV4([
    pointV4("p-1", "Grace", 1),
    proseV4("Under", 1),
    passageV4("s-1", john, 1),
  ]),
) {
  const editor = new Editor({
    element: document.createElement("div"),
    extensions: labV4Extensions({}),
  });
  open.push(editor);
  expect(loadV4(editor, content, "doc").ok).toBe(true);
  return editor;
}

function show(editor: Editor, locale: Locale = "en") {
  render(
    <I18nProvider locale={locale}>
      <ViewMenu editor={editor} />
    </I18nProvider>,
  );
  fireEvent.click(screen.getByTestId("view-menu"));
}

const item = (name: string) => screen.getByTestId(`view-${name}`);
const disabled = (name: string) => item(name).hasAttribute("data-disabled");

describe("ViewMenu", () => {
  it("folds points and expands Scripture separately, each item resting when it would do nothing", async () => {
    const editor = make();
    show(editor);
    expect(disabled("expand-points")).toBe(true);
    expect(disabled("collapse-points")).toBe(false);
    expect(disabled("expand-scripture")).toBe(false);
    expect(disabled("collapse-scripture")).toBe(true);

    await act(async () => fireEvent.click(item("collapse-points")));
    expect(foldingOf(editor.state)).toEqual({ foldable: 1, folded: 1 });
    expect(expansionKey.getState(editor.state)?.ids.size).toBe(0);

    fireEvent.click(screen.getByTestId("view-menu"));
    await act(async () => fireEvent.click(item("expand-scripture")));
    expect(expansionKey.getState(editor.state)?.ids.has("s-1")).toBe(true);
    // Expanding Scripture unfolded nothing.
    expect(foldingOf(editor.state).folded).toBe(1);
  });

  it("in Print Layout, collapses Scripture on screen only, leaving Regular's expansion alone", async () => {
    const editor = make();
    editor.commands.setLayout("print");
    show(editor);
    expect(disabled("expand-scripture")).toBe(true);
    await act(async () => fireEvent.click(item("collapse-scripture")));
    const state = expansionKey.getState(editor.state)!;
    expect(state.collapsed.has("s-1")).toBe(true);
    expect(state.ids.size).toBe(0);
  });

  it("rests entirely where there is nothing to fold or expand", () => {
    show(make(documentV4([proseV4("Only writing", 0)])));
    for (const name of [
      "expand-points",
      "collapse-points",
      "expand-scripture",
      "collapse-scripture",
    ]) {
      expect(disabled(name)).toBe(true);
    }
  });

  it("speaks Spanish", () => {
    show(make(), "es");
    expect(screen.getByTestId("view-menu").getAttribute("aria-label")).toBe("Opciones de vista");
    expect(item("collapse-points").textContent).toContain("Contraer todos los puntos");
    expect(item("expand-scripture").textContent).toContain("Expandir todos los pasajes");
  });
});

/** The workspace's part (A4.4): the editor follows this device's paper. */
function Follow({ editor }: { editor: Editor }) {
  useEditorPaper(editor);
  return null;
}

describe("ViewMenu: paper (A4.4)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetHeldPreferences();
  });

  function showWithPaper(editor: Editor, locale: Locale = "en") {
    render(
      <I18nProvider locale={locale}>
        <Follow editor={editor} />
        <ViewMenu editor={editor} />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByTestId("view-menu"));
  }

  it("offers Automatic, Light, and Dark paper, the current one checked, in a labelled group", () => {
    showWithPaper(make());
    const group = screen.getByRole("group", { name: "Paper" });
    const radios = within(group).getAllByRole("menuitemradio");
    expect(radios.map((radio) => radio.textContent)).toEqual([
      "Automatic",
      "Light paper",
      "Dark paper",
    ]);
    expect(item("paper-automatic")).toHaveAttribute("aria-checked", "true");
    expect(group).toHaveAccessibleDescription(
      "Paper on this device. Printing is always on white paper.",
    );
  });

  it("changes only the paper: never the document, the selection, the history, or the layout", async () => {
    const editor = make();
    editor.commands.setTextSelection(3);
    editor.commands.insertContent("x");
    const json = JSON.stringify(editor.getJSON());
    const { from } = editor.state.selection;
    showWithPaper(editor);
    await act(async () => fireEvent.click(item("paper-dark")));
    expect(readPaper()).toBe("dark");
    expect(editor.view.dom.getAttribute("data-paper")).toBe("dark");
    expect(JSON.stringify(editor.getJSON())).toBe(json);
    expect(editor.state.selection.from).toBe(from);
    expect(printLayoutOf(editor.state)?.layout).toBe("regular");
    editor.commands.undo();
    expect(editor.can().undo()).toBe(false);
    // Another tab chooses light: this editor follows.
    await act(async () => {
      window.localStorage.setItem("sermon-paper", "light");
      window.dispatchEvent(new StorageEvent("storage", { key: "sermon-paper" }));
    });
    expect(editor.view.dom.getAttribute("data-paper")).toBe("light");
  });

  it("works in a read-only editor, which stays read-only", async () => {
    const editor = make();
    editor.setEditable(false);
    showWithPaper(editor);
    await act(async () => fireEvent.click(item("paper-dark")));
    expect(editor.view.dom.getAttribute("data-paper")).toBe("dark");
    expect(editor.isEditable).toBe(false);
  });

  it("is chosen with the keyboard", async () => {
    showWithPaper(make());
    const light = item("paper-light");
    light.focus();
    await act(async () => fireEvent.keyDown(light, { key: "Enter" }));
    await act(async () => fireEvent.click(light));
    expect(readPaper()).toBe("light");
  });

  it("speaks Spanish", () => {
    showWithPaper(make(), "es");
    expect(screen.getByRole("group", { name: "Papel" })).toBeInTheDocument();
    expect(item("paper-dark").textContent).toContain("Papel oscuro");
  });
});

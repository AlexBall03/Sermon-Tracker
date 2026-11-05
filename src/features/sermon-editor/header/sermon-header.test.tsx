import { Editor } from "@tiptap/core";
import { undo, undoDepth } from "@tiptap/pm/history";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { newDocumentPage } from "@/features/editor-lab/pagination/page-config";
import { printLayoutOf } from "@/features/editor-lab/pagination/plugin";
import { labV4Extensions, loadV4 } from "@/features/editor-lab/v4/extensions";
import { documentV4, pointV4 } from "@/features/editor-lab/v4/fixtures";
import { I18nProvider } from "@/i18n/client";
import type { Locale } from "@/i18n/locales";
import { SermonHeader, type TitleControl } from "./sermon-header";

/*
 * A4.3: the semantic sermon header. The title is handed to its owner (the
 * sermon), never written into the document; the subtitle is the document's,
 * one undoable change when the field is left, never per keystroke.
 */

const editors: Editor[] = [];
afterEach(() => {
  while (editors.length) {
    const editor = editors.pop()!;
    editor.view.dom.parentElement?.remove();
    editor.destroy();
  }
});

function open(attrs: Record<string, unknown> = {}) {
  const element = document.createElement("div");
  document.body.append(element);
  const editor = new Editor({ element, extensions: labV4Extensions({ preset: "balanced" }) });
  const doc = documentV4([pointV4("p-1", "The lamp", 1)]);
  loadV4(editor, { ...doc, attrs: { ...doc.attrs, page: newDocumentPage(), ...attrs } }, "doc-a");
  editors.push(editor);
  return editor;
}

function show(
  editor: Editor,
  title: Partial<TitleControl> = {},
  { editable = true, locale = "en" as Locale } = {},
) {
  const control: TitleControl = { value: "The Lamp", editable: true, commit: vi.fn(), ...title };
  render(
    <I18nProvider locale={locale}>
      <SermonHeader editor={editor} title={control} editable={editable} />
    </I18nProvider>,
  );
  return control;
}

describe("the sermon header (A4.3)", () => {
  it("shows the sermon's title, centred by default, and hands a new one to its owner", () => {
    const editor = open();
    const control = show(editor);
    const header = screen.getByTestId("sermon-header");
    expect(header).toHaveAttribute("data-align", "center");
    const field = screen.getByRole("textbox", { name: "Sermon title" });
    expect(field).toHaveValue("The Lamp");
    const before = editor.state.doc;
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: "  The Lamp and the Light  " } });
    expect(control.commit).not.toHaveBeenCalled();
    fireEvent.keyDown(field, { key: "Enter" });
    fireEvent.blur(field);
    expect(control.commit).toHaveBeenCalledWith("The Lamp and the Light");
    // The title is never the document's.
    expect(editor.state.doc).toBe(before);
    expect(JSON.stringify(editor.getJSON())).not.toContain("The Lamp and the Light");
  });

  it("leaves the title as it was on Escape, and never sends a blank one", () => {
    const editor = open();
    const control = show(editor);
    const field = screen.getByRole("textbox", { name: "Sermon title" });
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: "Not this" } });
    fireEvent.keyDown(field, { key: "Escape" });
    fireEvent.blur(field);
    expect(control.commit).not.toHaveBeenCalled();
    expect(field).toHaveValue("The Lamp");
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: "   " } });
    fireEvent.blur(field);
    expect(control.commit).not.toHaveBeenCalled();
    expect(field).toHaveValue("The Lamp");
  });

  it("keeps the title read-only where it cannot be changed, and says why", () => {
    const editor = open();
    show(editor, { editable: false, reason: "Another tab is editing." });
    const field = screen.getByRole("textbox", { name: "Sermon title" });
    expect(field).toHaveAttribute("readonly");
    expect(field).toHaveAccessibleDescription(/Another tab is editing\./);
  });

  it("writes the subtitle once, when the field is left, as one undoable change", () => {
    const editor = open();
    show(editor);
    fireEvent.click(screen.getByRole("button", { name: "Add subtitle" }));
    const field = screen.getByRole("textbox", { name: "Subtitle" });
    const depth = undoDepth(editor.state);
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: "P" } });
    fireEvent.change(field, { target: { value: "Psalm 119" } });
    expect(editor.state.doc.attrs.subtitle).toBeNull();
    fireEvent.blur(field);
    expect(editor.state.doc.attrs.subtitle).toBe("Psalm 119");
    expect(undoDepth(editor.state)).toBe(depth + 1);
    undo(editor.state, editor.view.dispatch);
    expect(editor.state.doc.attrs.subtitle).toBeNull();
  });

  it("stores a blank subtitle as none, and refuses one it cannot keep", () => {
    const editor = open({ subtitle: "Psalm 119" });
    show(editor);
    const field = screen.getByRole("textbox", { name: "Subtitle" });
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: "<b>" } });
    fireEvent.blur(field);
    expect(screen.getByRole("alert")).toHaveTextContent("can't contain");
    expect(editor.state.doc.attrs.subtitle).toBe("Psalm 119");
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: "   " } });
    fireEvent.blur(field);
    expect(editor.state.doc.attrs.subtitle).toBeNull();
  });

  it("offers no subtitle to add where the document cannot be changed", () => {
    const editor = open();
    show(editor, {}, { editable: false });
    expect(screen.queryByRole("button", { name: "Add subtitle" })).toBeNull();
  });

  it("follows the page's alignment and tells the running header the title", () => {
    const page = { ...newDocumentPage(), header: { titleAlign: "right" } };
    const editor = open({ page });
    show(editor, { value: "Shown" });
    expect(screen.getByTestId("sermon-header")).toHaveAttribute("data-align", "right");
    expect(printLayoutOf(editor.state)?.title).toBe("Shown");
  });

  it("speaks Spanish", () => {
    const editor = open();
    show(editor, {}, { locale: "es" });
    expect(screen.getByRole("textbox", { name: "Título del sermón" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Añadir subtítulo" })).toBeInTheDocument();
  });
});

import { Editor, type JSONContent } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ref } from "@/features/editor-lab/fixtures";
import { findComponent } from "@/features/editor-lab/styles/component-node";
import type { DocumentStyles } from "@/features/editor-lab/styles/model";
import { appearanceTargetKey, documentStylesKey } from "@/features/editor-lab/styles/plugin";
import { readStyles } from "@/features/editor-lab/styles/resolve";
import { labV4Extensions, loadV4 } from "@/features/editor-lab/v4/extensions";
import { documentV4, noteV4, passageV4, pointV4, proseV4 } from "@/features/editor-lab/v4/fixtures";
import { I18nProvider } from "@/i18n/client";
import type { Locale } from "@/i18n/locales";
import { AppearancePanel, type AppearanceScope, type OutlineTarget } from "./appearance-panel";

/*
 * The Appearance panel (A1-UI.2B.2) as a person uses it: its scopes and
 * words, a property set back to inherited, the selected component held while
 * a control has focus, and the three ways out (Escape keeps the draft;
 * Cancel and Close discard it).
 */

const editors: Editor[] = [];
afterEach(() => {
  while (editors.length) {
    const editor = editors.pop()!;
    editor.view.dom.parentElement?.remove();
    editor.destroy();
  }
});

function open(styles?: DocumentStyles) {
  const element = document.createElement("div");
  document.body.append(element);
  const editor = new Editor({ element, extensions: labV4Extensions({ preset: "balanced" }) });
  const content: JSONContent = documentV4([
    pointV4("p-1", "The lamp", 1),
    proseV4("Why this psalm.", 1),
    passageV4("s-1", ref(19, 119, 105), 1),
    noteV4("n-1", "Ask who walked in the dark.", 1),
  ]);
  if (styles) content.attrs = { ...content.attrs, styles };
  const loaded = loadV4(editor, content, "doc-a");
  if (!loaded.ok) throw new Error(JSON.stringify(loaded.problems));
  editors.push(editor);
  return editor;
}

function Harness({
  editor,
  initial = "outline",
  onClose = () => {},
}: {
  editor: Editor;
  initial?: AppearanceScope;
  onClose?: () => void;
}) {
  const [scope, setScope] = useState<AppearanceScope>(initial);
  const [target, setTarget] = useState<OutlineTarget>("normal");
  return (
    <AppearancePanel
      editor={editor}
      scope={scope}
      onScope={setScope}
      outlineTarget={target}
      onOutlineTarget={setTarget}
      onClose={onClose}
    />
  );
}

function show(
  editor: Editor,
  props: Partial<Parameters<typeof Harness>[0]> = {},
  locale: Locale = "en",
) {
  return render(
    <I18nProvider locale={locale}>
      <Harness editor={editor} {...props} />
    </I18nProvider>,
  );
}

const previewing = (editor: Editor) => Boolean(documentStylesKey.getState(editor.state)?.preview);

function caretIn(editor: Editor, id: string, offset = 1) {
  const { pos } = findComponent(editor.state.doc, id)!;
  editor.view.dispatch(
    editor.state.tr.setSelection(TextSelection.create(editor.state.doc, pos + offset)),
  );
}

describe("AppearancePanel", () => {
  it("offers three scopes, in English and in Spanish", () => {
    const editor = open();
    const { unmount } = show(editor);
    const panel = screen.getByRole("dialog", { name: "Appearance" });
    for (const name of ["Outline", "Components", "Selected"]) {
      expect(within(panel).getByRole("radio", { name })).toBeInTheDocument();
    }
    expect(within(panel).getByRole("radio", { name: /Balanced/ })).toBeChecked();
    unmount();
    show(editor, {}, "es");
    const spanish = screen.getByRole("dialog", { name: "Apariencia" });
    for (const name of ["Bosquejo", "Componentes", "Seleccionado"]) {
      expect(within(spanish).getByRole("radio", { name })).toBeInTheDocument();
    }
  });

  it("previews a change and applies it in one step; Cancel throws a draft away", () => {
    const editor = open();
    show(editor);
    fireEvent.click(screen.getByRole("radio", { name: /Minimal/ }));
    expect(previewing(editor)).toBe(true);
    expect(readStyles(editor.state.doc.attrs.styles)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(previewing(editor)).toBe(false);
    expect(screen.getByRole("radio", { name: /Balanced/ })).toBeChecked();

    fireEvent.click(screen.getByRole("radio", { name: /Expressive/ }));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(readStyles(editor.state.doc.attrs.styles)).toEqual({ version: 1, preset: "expressive" });
    expect(previewing(editor)).toBe(false);
    expect(screen.getByRole("status")).toHaveTextContent("Applied");
  });

  it("keeps the draft across scopes and presets", () => {
    const editor = open();
    show(editor);
    fireEvent.click(screen.getByRole("radio", { name: /Minimal/ }));
    fireEvent.click(screen.getByRole("radio", { name: "Components" }));
    const size = screen.getByRole("textbox", { name: "Size (pt)" });
    fireEvent.change(size, { target: { value: "15" } });
    fireEvent.blur(size);
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

  it("sets one property back to inherited and leaves the rest", () => {
    const editor = open({ version: 1, components: { point: { fontSize: 15, italic: true } } });
    show(editor, { initial: "components" });
    const row = screen.getByText("Size (pt)").closest("[data-field]") as HTMLElement;
    expect(within(row).getByText("Customized")).toBeInTheDocument();
    fireEvent.click(
      within(row).getByRole("button", { name: "Use inherited setting for Size (pt)" }),
    );
    expect(within(row).getByText(/From/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(readStyles(editor.state.doc.attrs.styles)?.components).toEqual({
      point: { italic: true },
    });
  });

  it("customizes the selected component, held while a control has focus", () => {
    const editor = open();
    caretIn(editor, "n-1", 3);
    show(editor, { initial: "selected" });
    const card = screen.getByTestId("appearance-target");
    expect(card).toHaveTextContent("Preacher note");
    expect(appearanceTargetKey.getState(editor.state)).toBe("n-1");
    const width = screen.getByRole("textbox", { name: "Border width (pt)" });
    act(() => width.focus());
    fireEvent.change(width, { target: { value: "2" } });
    fireEvent.blur(width);
    expect(screen.getByTestId("appearance-target")).toHaveTextContent("Preacher note");
    // Ordinary writing under a point does not take the target away.
    act(() => {
      const prose = findComponent(editor.state.doc, "p-1")!;
      const at = prose.pos + prose.node.nodeSize + 2;
      editor.view.dispatch(
        editor.state.tr.setSelection(TextSelection.create(editor.state.doc, at)),
      );
    });
    expect(screen.getByTestId("appearance-target")).toHaveTextContent("Preacher note");
    expect(screen.getByTestId("appearance-target")).toHaveTextContent("Still customizing");
    // Another component chosen in the outline is the new target; the note's edit stays its own.
    act(() => caretIn(editor, "p-1", 1));
    expect(screen.getByTestId("appearance-target")).toHaveTextContent("Main point");
    expect(appearanceTargetKey.getState(editor.state)).toBe("p-1");
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(findComponent(editor.state.doc, "n-1")?.node.attrs.appearance).toEqual({
      borderWidth: 2,
    });
    expect(findComponent(editor.state.doc, "p-1")?.node.attrs.appearance).toBeNull();
  });

  it("says when the selected component is gone, and applies none of its changes", () => {
    const editor = open();
    caretIn(editor, "n-1", 3);
    show(editor, { initial: "selected" });
    const width = screen.getByRole("textbox", { name: "Border width (pt)" });
    fireEvent.change(width, { target: { value: "2" } });
    fireEvent.blur(width);
    act(() => {
      const { pos, node } = findComponent(editor.state.doc, "n-1")!;
      editor.view.dispatch(editor.state.tr.delete(pos, pos + node.nodeSize));
    });
    expect(screen.getByText(/was removed/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Discard those changes" }));
    expect(previewing(editor)).toBe(false);
  });

  it("goes back to the outline on Escape, keeping the panel and the draft", () => {
    const editor = open();
    show(editor);
    fireEvent.click(screen.getByRole("radio", { name: /Minimal/ }));
    const preset = screen.getByRole("radio", { name: /Minimal/ });
    act(() => preset.focus());
    fireEvent.keyDown(preset, { key: "Escape" });
    expect(document.activeElement).toBe(editor.view.dom);
    expect(screen.getByRole("dialog", { name: "Appearance" })).toBeInTheDocument();
    expect(previewing(editor)).toBe(true);
  });

  it("leaves an Escape a popup already handled to the popup", () => {
    const editor = open();
    show(editor);
    const preset = screen.getByRole("radio", { name: /Minimal/ });
    act(() => preset.focus());
    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    event.preventDefault();
    act(() => {
      preset.dispatchEvent(event);
    });
    expect(document.activeElement).toBe(preset);
  });

  it("discards the draft on Close", () => {
    const editor = open();
    const onClose = vi.fn();
    const { unmount } = show(editor, { onClose });
    fireEvent.click(screen.getByRole("radio", { name: /Minimal/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "Close Appearance and discard changes not applied" }),
    );
    expect(onClose).toHaveBeenCalledOnce();
    unmount();
    expect(previewing(editor)).toBe(false);
    expect(appearanceTargetKey.getState(editor.state)).toBeNull();
    expect(readStyles(editor.state.doc.attrs.styles)).toBeNull();
  });
});

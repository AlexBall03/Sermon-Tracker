import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@/components/ui/toast";
import { I18nProvider } from "@/i18n/client";
import type { Locale } from "@/i18n/locales";
import type { OutlineSnapshot, SnapshotEntry } from "../editor/store";

// The server actions and the router are mocked: this covers what the editor does
// with them. The store's own rules are tested in editor/store.test.ts.
const state = vi.hoisted(() => ({
  addEntry: vi.fn(),
  updateEntry: vi.fn(),
  moveEntry: vi.fn(),
  removeEntry: vi.fn(),
  setOutlineNumbering: vi.fn(),
  deleteOutline: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("../actions", () => ({
  addEntry: state.addEntry,
  updateEntry: state.updateEntry,
  moveEntry: state.moveEntry,
  removeEntry: state.removeEntry,
  setOutlineNumbering: state.setOutlineNumbering,
  deleteOutline: state.deleteOutline,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: state.push, replace: state.replace, refresh: state.refresh }),
}));

import { OutlineEditor } from "./outline-editor";

const entry = (
  id: string,
  type: SnapshotEntry["type"],
  title: string,
  position = 0,
  parentId: string | null = null,
  notes: string | null = null,
): SnapshotEntry => ({ id, parentId, type, position, title, notes, revision: 1 });

/**
 * I. Grace
 *    A. Unearned
 *       1. By faith
 *    B. Unending
 * II. Peace
 */
const outline = (entries?: SnapshotEntry[]): OutlineSnapshot => ({
  id: "outline-1",
  revision: 7,
  numbering: { version: 1, preset: "traditional" },
  entries: entries ?? [
    entry("grace", "point", "Grace", 0),
    entry("unearned", "point", "Unearned", 0, "grace", "Not of works."),
    entry("faith", "point", "By faith", 0, "unearned"),
    entry("unending", "point", "Unending", 1, "grace"),
    entry("peace", "point", "Peace", 1),
  ],
});

const sermon = { id: "sermon-1", title: "It is Well" };

function open(snapshot = outline(), locale: Locale = "en") {
  return render(
    <I18nProvider locale={locale}>
      <ToastProvider>
        <OutlineEditor snapshot={snapshot} sermon={sermon} />
      </ToastProvider>
    </I18nProvider>,
  );
}

/** The outline as it is drawn: each point's number and heading, indented by its level. */
function drawn() {
  return [...document.querySelectorAll<HTMLElement>("li[data-entry-id]")].map((row) => {
    const label = row.querySelector("[data-label]")?.textContent ?? "";
    const title = row.querySelector<HTMLInputElement>('[data-field="title"]')!.value;
    return `${"  ".repeat(Number(row.dataset.depth))}${label} ${title}`.trimEnd();
  });
}

const heading = (label: string) => screen.getByRole("textbox", { name: `Heading, ${label}` });
const saved = () => screen.getByText("Saved");
const pause = (ms = 1000) => act(() => vi.advanceTimersByTimeAsync(ms));

async function menu(name: string, item: string) {
  fireEvent.click(screen.getByRole("button", { name: `Actions for ${name}` }));
  fireEvent.click(await screen.findByRole("menuitem", { name: new RegExp(`^${item}`) }));
}

let revision: number;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.clearAllMocks();
  window.localStorage.clear();
  revision = 7;
  const shape = async () => ({ ok: true, message: "", revision: (revision += 1) });
  state.addEntry.mockImplementation(async (input: { title: string }, id: string) => ({
    ...(await shape()),
    entry: { id, title: input.title, notes: null, revision: 0 },
  }));
  state.moveEntry.mockImplementation(shape);
  state.removeEntry.mockImplementation(shape);
  state.setOutlineNumbering.mockImplementation(async () => ({ ok: true, message: "", revision }));
  state.updateEntry.mockImplementation(
    async (id: string, input: { title?: string; notes?: string; expectedRevision: number }) => ({
      ok: true,
      message: "",
      entry: {
        id,
        title: input.title ?? "",
        notes: input.notes ?? null,
        revision: input.expectedRevision + 1,
      },
    }),
  );
  state.deleteOutline.mockResolvedValue({ ok: true, message: "Outline deleted." });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the outline editor", () => {
  it("draws the hierarchy with its numbers, and says each point's level", () => {
    open();
    expect(drawn()).toEqual([
      "I. Grace",
      "  A. Unearned",
      "    1. By faith",
      "  B. Unending",
      "II. Peace",
    ]);
    expect(screen.getByRole("group", { name: "1. By faith, Level 3" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Notes for A. Unearned" })).toHaveValue(
      "Not of works.",
    );
    expect(saved()).toBeInTheDocument();
  });

  it("saves a heading and notes a moment after the typing stops, not on every key", async () => {
    open();
    fireEvent.change(heading("II."), { target: { value: "Peace with" } });
    fireEvent.change(heading("II."), { target: { value: "Peace with God" } });
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    expect(state.updateEntry).not.toHaveBeenCalled();

    await pause();
    expect(state.updateEntry).toHaveBeenCalledTimes(1);
    expect(state.updateEntry).toHaveBeenCalledWith("peace", {
      title: "Peace with God",
      expectedRevision: 1,
    });
    expect(saved()).toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "Notes for A. Unearned" }), {
      target: { value: "Ephesians 2." },
    });
    await pause();
    expect(state.updateEntry).toHaveBeenLastCalledWith("unearned", {
      notes: "Ephesians 2.",
      expectedRevision: 1,
    });
  });

  it("says a save failed, keeps the text, and saves it when asked again", async () => {
    open();
    state.updateEntry.mockRejectedValueOnce(new Error("network"));
    fireEvent.change(heading("II."), { target: { value: "Kept" } });
    await pause();
    expect(screen.getByText("Save failed")).toBeInTheDocument();
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
    expect(heading("II.")).toHaveValue("Kept");

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await pause(0);
    expect(state.updateEntry).toHaveBeenCalledTimes(2);
    expect(saved()).toBeInTheDocument();
  });

  it("adds a point below with Enter and a subpoint with Ctrl+Enter, and puts the cursor in it", async () => {
    open();
    fireEvent.keyDown(heading("A."), { key: "Enter" });
    expect(drawn()).toEqual([
      "I. Grace",
      "  A. Unearned",
      "    1. By faith",
      "  B.",
      "  C. Unending",
      "II. Peace",
    ]);
    expect(heading("B.")).toHaveFocus();
    expect(heading("B.")).toHaveAttribute("placeholder", "Heading");
    await pause(0);
    expect(state.addEntry.mock.calls[0][0]).toMatchObject({
      outlineId: "outline-1",
      type: "point",
      parentId: "grace",
      position: 1,
      expectedRevision: 7,
    });

    fireEvent.keyDown(heading("II."), { key: "Enter", ctrlKey: true });
    expect(drawn().slice(-2)).toEqual(["II. Peace", "  A."]);
    await pause(0);
    expect(state.addEntry.mock.calls[1][0]).toMatchObject({
      parentId: "peace",
      position: 0,
      expectedRevision: 8,
    });
  });

  it("adds a main point from the button, and from an empty outline", async () => {
    open(outline([]));
    expect(screen.getByText(/No points yet/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add point" }));
    expect(drawn()).toEqual(["I."]);
    expect(heading("I.")).toHaveFocus();
  });

  it("offers one introduction and one conclusion, unnumbered and with no way to move them", async () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Add introduction" }));
    expect(screen.queryByRole("button", { name: "Add introduction" })).not.toBeInTheDocument();
    const introduction = screen.getByRole("region", { name: "Introduction" });
    expect(
      within(introduction).getByRole("textbox", { name: "Introduction: Heading" }),
    ).toHaveFocus();
    expect(introduction.querySelector("[data-grip]")).toBeNull();
    expect(within(introduction).queryByRole("button", { name: /Actions for/ })).toBeNull();
    // The points are numbered as before: a section is not counted.
    expect(drawn()[0]).toBe("I. Grace");

    fireEvent.click(screen.getByRole("button", { name: "Add conclusion" }));
    await pause(0);
    expect(state.addEntry.mock.calls.map(([input]) => input.type)).toEqual([
      "introduction",
      "conclusion",
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Delete: Introduction" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    await pause(0);
    expect(screen.getByRole("button", { name: "Add introduction" })).toBeInTheDocument();
    expect(state.removeEntry).toHaveBeenCalledTimes(1);
  });

  it("moves a point with the menu, taking what is under it, and renumbers", async () => {
    open();
    await menu("II. Peace", "Move up");
    expect(drawn()).toEqual([
      "I. Peace",
      "II. Grace",
      "  A. Unearned",
      "    1. By faith",
      "  B. Unending",
    ]);
    await pause(0);
    expect(state.moveEntry).toHaveBeenCalledWith("peace", {
      parentId: null,
      position: 0,
      expectedRevision: 7,
    });
    expect(screen.getByText("Peace moved. Now I.")).toBeInTheDocument();
  });

  it("indents and outdents from the keyboard, and keeps the cursor in the heading", async () => {
    open();
    const peace = heading("II.");
    peace.focus();
    fireEvent.keyDown(peace, { key: "ArrowRight", altKey: true, shiftKey: true });
    expect(drawn()).toEqual([
      "I. Grace",
      "  A. Unearned",
      "    1. By faith",
      "  B. Unending",
      "  C. Peace",
    ]);
    expect(heading("C.")).toHaveFocus();
    await pause(0);
    expect(state.moveEntry).toHaveBeenLastCalledWith("peace", {
      parentId: "grace",
      position: 2,
      expectedRevision: 7,
    });

    fireEvent.keyDown(heading("A."), { key: "ArrowLeft", altKey: true, shiftKey: true });
    expect(drawn()).toEqual([
      "I. Grace",
      "  A. Unending",
      "  B. Peace",
      "II. Unearned",
      "  A. By faith",
    ]);
    // Up from the first place does nothing, and asks the server nothing.
    fireEvent.keyDown(heading("I."), { key: "ArrowUp", altKey: true, shiftKey: true });
    await pause(0);
    expect(state.moveEntry).toHaveBeenCalledTimes(2);
  });

  it("does not offer a move that cannot be made", async () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Actions for I. Grace" }));
    expect(await screen.findByRole("menuitem", { name: /^Move up/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("menuitem", { name: /^Indent/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("menuitem", { name: /^Outdent/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("menuitem", { name: /^Move down/ })).not.toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.queryByRole("menuitem", { name: "Move to top level" })).not.toBeInTheDocument();
  });

  it("asks before deleting a point, and says how many go with it", async () => {
    open();
    await menu("I. Grace", "Delete");
    expect(
      await screen.findByText(
        "“I. Grace” and the 3 points under it will be deleted from the outline.",
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(drawn()).toHaveLength(5);
    expect(state.removeEntry).not.toHaveBeenCalled();

    await menu("I. Grace", "Delete");
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    await pause(0);
    expect(drawn()).toEqual(["I. Peace"]);
    expect(state.removeEntry).toHaveBeenCalledWith("grace", 7);
  });

  it("removes an empty point with Backspace, without asking, and steps back a heading", async () => {
    open();
    fireEvent.keyDown(heading("II."), { key: "Enter" });
    const empty = heading("III.");
    fireEvent.keyDown(empty, { key: "Backspace" });
    expect(drawn()).toHaveLength(5);
    expect(heading("II.")).toHaveFocus();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    // A point with a heading is not removed by Backspace.
    fireEvent.keyDown(heading("II."), { key: "Backspace" });
    expect(drawn()).toHaveLength(5);
  });

  it("folds a point with what is under it, says how many are folded, and remembers it", () => {
    const { unmount } = open();
    fireEvent.click(screen.getByRole("button", { name: "Collapse I. Grace" }));
    expect(drawn()).toEqual(["I. Grace", "II. Peace"]);
    expect(screen.getByText("3 points folded")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand I. Grace" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    // A preference of this browser: nothing is sent.
    expect(state.moveEntry).not.toHaveBeenCalled();

    unmount();
    open();
    expect(drawn()).toEqual(["I. Grace", "II. Peace"]);
    fireEvent.click(screen.getByRole("button", { name: "Expand I. Grace" }));
    expect(drawn()).toHaveLength(5);
  });

  it("opens a folded point when something is added under it", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Collapse I. Grace" }));
    fireEvent.keyDown(heading("I."), { key: "Enter", ctrlKey: true });
    expect(drawn()).toEqual([
      "I. Grace",
      "  A. Unearned",
      "    1. By faith",
      "  B. Unending",
      "  C.",
      "II. Peace",
    ]);
  });

  it("holds any depth, and marks the level once the indentation stops growing", () => {
    const deep = Array.from({ length: 30 }, (_, index) =>
      entry(`p${index}`, "point", `Level ${index + 1}`, 0, index === 0 ? null : `p${index - 1}`),
    );
    open(outline(deep));
    const rows = document.querySelectorAll<HTMLElement>("li[data-entry-id]");
    expect(rows).toHaveLength(30);
    expect(rows[29].dataset.depth).toBe("29");
    expect(screen.getByRole("group", { name: /Level 30, Level 30$/ })).toBeInTheDocument();
    // Indentation is one bounded CSS expression, whatever the depth.
    expect(rows[29].className).toContain("min(calc(var(--depth)*var(--outline-step))");
  });

  it("changes the numbering of every point at once, and saves the style alone", async () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Numbering" }));
    const dialog = await screen.findByRole("dialog", { name: "Numbering" });
    fireEvent.click(within(dialog).getByRole("radio", { name: /^Decimal/ }));
    // Nothing changes behind the dialog until it is applied.
    expect(drawn()[0]).toBe("I. Grace");
    fireEvent.click(within(dialog).getByRole("button", { name: "Apply" }));
    expect(drawn()).toEqual([
      "1. Grace",
      "  1.1. Unearned",
      "    1.1.1. By faith",
      "  1.2. Unending",
      "2. Peace",
    ]);
    await pause(0);
    expect(state.setOutlineNumbering).toHaveBeenCalledWith("outline-1", {
      version: 1,
      preset: "decimal",
    });
    expect(state.updateEntry).not.toHaveBeenCalled();
    expect(state.moveEntry).not.toHaveBeenCalled();
  });

  it("takes the outline the page sends again, and keeps what is being typed", async () => {
    const { rerender } = open();
    fireEvent.change(heading("II."), { target: { value: "Peace, unsaved" } });
    rerender(
      <I18nProvider locale="en">
        <ToastProvider>
          <OutlineEditor
            sermon={sermon}
            snapshot={{
              ...outline(),
              revision: 9,
              entries: [
                entry("grace", "point", "Grace, renamed elsewhere", 0),
                entry("peace", "point", "Peace", 1),
              ],
            }}
          />
        </ToastProvider>
      </I18nProvider>,
    );
    expect(drawn()).toEqual(["I. Grace, renamed elsewhere", "II. Peace, unsaved"]);
  });

  it("reloads the outline when a change of shape is stale, and says so", async () => {
    open();
    state.moveEntry.mockResolvedValueOnce({
      ok: false,
      code: "stale",
      message: "Changed elsewhere.",
      revision: 9,
    });
    await menu("II. Peace", "Move up");
    await pause(0);
    expect(state.refresh).toHaveBeenCalledTimes(1);
    expect(state.moveEntry).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Saving…")).toBeInTheDocument();
  });

  it("shows a conflict where both changed a heading, and saves the one that is kept", async () => {
    open();
    state.updateEntry.mockResolvedValueOnce({
      ok: false,
      code: "stale_entry",
      message: "Changed elsewhere.",
      entry: { id: "peace", title: "Peace, from elsewhere", notes: null, revision: 4 },
    });
    fireEvent.change(heading("II."), { target: { value: "Peace, mine" } });
    await pause();
    expect(screen.getByText("Needs your attention")).toBeInTheDocument();
    const conflict = screen.getByRole("alert");
    expect(conflict).toHaveTextContent("Peace, from elsewhere");
    expect(heading("II.")).toHaveValue("Peace, mine");

    fireEvent.click(within(conflict).getByRole("button", { name: "Keep mine" }));
    await pause(0);
    expect(state.updateEntry).toHaveBeenLastCalledWith("peace", {
      title: "Peace, mine",
      expectedRevision: 4,
    });
    expect(saved()).toBeInTheDocument();
  });

  it("warns before the tab is closed only while something is unsaved", async () => {
    open();
    const leave = () => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(leave()).toBe(false);
    fireEvent.change(heading("II."), { target: { value: "Unsaved" } });
    expect(leave()).toBe(true);
    await pause();
    expect(leave()).toBe(false);
  });

  it("saves at once when the page is hidden or left", async () => {
    const { unmount } = open();
    fireEvent.change(heading("II."), { target: { value: "Hidden" } });
    window.dispatchEvent(new Event("pagehide"));
    await pause(0);
    expect(state.updateEntry).toHaveBeenCalledTimes(1);

    fireEvent.change(heading("I."), { target: { value: "Left" } });
    unmount();
    await pause(0);
    expect(state.updateEntry).toHaveBeenLastCalledWith("grace", {
      title: "Left",
      expectedRevision: 1,
    });
  });

  it("deletes the outline after asking, and goes back to the sermon", async () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "More outline actions" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Delete outline" }));
    expect(await screen.findByText(/The sermon itself is kept/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete outline" }));
    await pause(0);
    expect(state.deleteOutline).toHaveBeenCalledWith("outline-1");
    expect(state.replace).toHaveBeenCalledWith("/library/sermon-1");
  });

  it("reads in Spanish", async () => {
    open(outline(), "es");
    expect(screen.getByText("Guardado")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Numeración" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Añadir introducción" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Encabezado, II." })).toHaveValue("Peace");
    fireEvent.click(screen.getByRole("button", { name: "Contraer I. Grace" }));
    expect(screen.getByText("3 puntos plegados")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Acciones de II. Peace" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /^Subir/ }));
    expect(screen.getByText("Peace se movió. Ahora es I.")).toBeInTheDocument();
  });
});

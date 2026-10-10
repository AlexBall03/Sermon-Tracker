import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { IdeaActionResult } from "../actions";

// The server action is mocked: this covers what the dialog does around it.
const state = vi.hoisted(() => ({ createIdea: vi.fn() }));
vi.mock("../actions", () => ({ createIdea: state.createIdea }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { ToastProvider } from "@/components/ui/toast";
import { CaptureButton, QuickCaptureProvider } from "./quick-capture";

const saved: IdeaActionResult = {
  ok: true,
  message: "Saved to your library.",
  id: "99999999-9999-4999-8999-999999999999",
};

function open() {
  render(
    <ToastProvider>
      <QuickCaptureProvider>
        <CaptureButton />
      </QuickCaptureProvider>
    </ToastProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Capture an idea" }));
  return screen.getByRole("dialog", { name: "Capture an idea" });
}

const title = () => screen.getByRole("textbox", { name: "Idea" });
const type = (element: HTMLElement, value: string) =>
  fireEvent.change(element, { target: { value } });
const submit = () => fireEvent.submit(title().closest("form")!);

beforeEach(() => {
  vi.clearAllMocks();
  state.createIdea.mockResolvedValue(saved);
});

describe("quick capture", () => {
  it("opens on the idea itself, undecided, with the rest tucked away", async () => {
    const dialog = open();
    await waitFor(() => expect(title()).toHaveFocus());
    expect(within(dialog).getByRole("radio", { name: "Undecided" })).toBeChecked();
    expect(within(dialog).getByRole("button", { name: "More details" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(within(dialog).queryByRole("textbox", { name: "Notes" })).not.toBeInTheDocument();
  });

  it("saves a bare thought, closes, and confirms with a link to it", async () => {
    open();
    type(title(), "The story isn't over");
    submit();

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(state.createIdea).toHaveBeenCalledTimes(1);
    const [input, id] = state.createIdea.mock.calls[0];
    expect(input).toMatchObject({
      title: "The story isn't over",
      kind: "undecided",
      status: "captured",
      notes: null,
      references: [],
    });
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(screen.getByRole("status")).toHaveTextContent("Saved to your library.");
    expect(screen.getByRole("link", { name: "Open" })).toHaveAttribute(
      "href",
      `/library/${saved.id}`,
    );

    // The next capture starts empty.
    fireEvent.click(screen.getByRole("button", { name: "Capture an idea" }));
    expect(title()).toHaveValue("");
  });

  it("asks for the idea before saving anything", () => {
    open();
    type(title(), "   ");
    submit();
    expect(screen.getByRole("alert")).toHaveTextContent("Write the idea first");
    expect(title()).toHaveAttribute("aria-invalid", "true");
    expect(title()).toHaveFocus();
    expect(state.createIdea).not.toHaveBeenCalled();
  });

  it("keeps everything when a save fails, and retries as the same idea", async () => {
    state.createIdea.mockResolvedValueOnce({
      ok: false,
      message: "The idea could not be saved. Try again.",
    });
    const dialog = open();
    type(title(), "A thought");
    fireEvent.click(within(dialog).getByRole("radio", { name: "Point" }));
    submit();

    expect(
      await within(dialog).findByText("The idea could not be saved. Try again."),
    ).toBeVisible();
    expect(title()).toHaveValue("A thought");
    expect(within(dialog).getByRole("radio", { name: "Point" })).toBeChecked();

    submit();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const ids = state.createIdea.mock.calls.map(([, id]) => id);
    expect(ids[0]).toBe(ids[1]);
  });

  it("reports a lost connection without losing the text", async () => {
    state.createIdea.mockRejectedValueOnce(new Error("Failed to fetch"));
    const dialog = open();
    type(title(), "A thought");
    submit();
    expect(await within(dialog).findByText(/Check your connection/)).toBeVisible();
    expect(title()).toHaveValue("A thought");
  });

  it("saves once however many times it is submitted while saving", async () => {
    let finish: (result: IdeaActionResult) => void = () => {};
    state.createIdea.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    const dialog = open();
    type(title(), "A thought");
    submit();
    submit();

    const button = within(dialog).getByRole("button", { name: "Saving…" });
    expect(button).toBeDisabled();
    // Escape does not abandon a save in flight.
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await act(async () => finish(saved));
    expect(state.createIdea).toHaveBeenCalledTimes(1);
  });

  it("asks before closing with something written, and discards it only if told to", async () => {
    open();
    type(title(), "Half a thought");
    fireEvent.click(screen.getByRole("button", { name: "Close capture" }));

    const question = await screen.findByRole("alertdialog", { name: "Discard this idea?" });
    expect(question).toHaveTextContent("This idea has not been saved.");
    fireEvent.click(within(question).getByRole("button", { name: "Keep writing" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(title()).toHaveValue("Half a thought");

    // Escape asks the same question.
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Capture an idea" }), { key: "Escape" });
    fireEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Discard idea" }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    // It is really gone.
    fireEvent.click(screen.getByRole("button", { name: "Capture an idea" }));
    expect(title()).toHaveValue("");
    expect(state.createIdea).not.toHaveBeenCalled();
  });

  it("closes without a question when nothing is written, and forgets its error messages", async () => {
    open();
    submit();
    expect(screen.getByRole("alert")).toHaveTextContent("Write the idea first");

    fireEvent.click(screen.getByRole("button", { name: "Close capture" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Capture an idea" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(title()).not.toHaveAttribute("aria-invalid");
  });

  it("warns before the tab is closed while an idea is being written", () => {
    const unloadIsWarned = () => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    open();
    expect(unloadIsWarned()).toBe(false);
    type(title(), "Half a thought");
    expect(unloadIsWarned()).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(unloadIsWarned()).toBe(false);
  });

  it("adds a typed reference with Enter, without submitting the idea", () => {
    const dialog = open();
    type(title(), "Grace");
    const scripture = within(dialog).getByRole("textbox", { name: "Scripture" });

    type(scripture, "John 3:99");
    fireEvent.keyDown(scripture, { key: "Enter" });
    expect(within(dialog).getByText(/John 3 has 36 verses/)).toBeVisible();

    type(scripture, "2 cor 12:7-10");
    fireEvent.keyDown(scripture, { key: "Enter" });
    expect(
      within(dialog).getByRole("button", { name: /2 Corinthians 12:7–10: preview/ }),
    ).toBeVisible();
    expect(scripture).toHaveValue("");
    expect(title()).toHaveValue("Grace");
    expect(state.createIdea).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Remove 2 Corinthians 12:7–10" }));
    expect(within(dialog).queryByRole("list", { name: "References" })).not.toBeInTheDocument();
    expect(title()).toHaveValue("Grace");
  });

  it("offers sermon details only for a sermon, and saves from notes with Ctrl+Enter", async () => {
    const dialog = open();
    type(title(), "His Grace is Sufficient");
    fireEvent.click(within(dialog).getByRole("button", { name: "More details" }));
    expect(
      within(dialog).queryByRole("textbox", { name: "Subject or theme" }),
    ).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("radio", { name: "Sermon" }));
    type(within(dialog).getByRole("textbox", { name: "Subject or theme" }), "Grace");
    fireEvent.click(within(dialog).getByRole("radio", { name: "Expository" }));
    const scripture = within(dialog).getByRole("textbox", { name: "Scripture" });
    type(scripture, "2 Corinthians 12:9");
    fireEvent.keyDown(scripture, { key: "Enter" });

    const notes = within(dialog).getByRole("textbox", { name: "Notes" });
    type(notes, "Paul's thorn.");
    // Enter alone is a new line in notes.
    fireEvent.keyDown(notes, { key: "Enter" });
    expect(state.createIdea).not.toHaveBeenCalled();
    fireEvent.keyDown(notes, { key: "Enter", ctrlKey: true });

    await waitFor(() => expect(state.createIdea).toHaveBeenCalledTimes(1));
    expect(state.createIdea.mock.calls[0][0]).toMatchObject({
      kind: "sermon",
      sermonType: "expository",
      subject: "Grace",
      notes: "Paul's thorn.",
      // A sermon's first reference becomes its main text.
      references: [{ book: 47, chapterStart: 12, verseStart: 9, isPrimary: true }],
    });
  });
});

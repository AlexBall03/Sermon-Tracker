import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@/components/ui/toast";
import { PreachingClassProvider } from "@/features/preferences/client";
import { I18nProvider } from "@/i18n/client";
import type { Locale } from "@/i18n/locales";
import { localDate } from "../dates";
import type { HistoryItem } from "../occurrences";

// The server actions, the router, and the sermon search are mocked: this covers the dialog's own behavior.
const state = vi.hoisted(() => ({
  recordOccurrence: vi.fn(),
  updateOccurrence: vi.fn(),
  deleteOccurrence: vi.fn(),
  createVenue: vi.fn(),
  createContext: vi.fn(),
  refresh: vi.fn(),
  onClose: vi.fn(),
}));
vi.mock("../actions", () => ({
  recordOccurrence: state.recordOccurrence,
  updateOccurrence: state.updateOccurrence,
  deleteOccurrence: state.deleteOccurrence,
  createVenue: state.createVenue,
  createContext: state.createContext,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: state.refresh }) }));

import { OccurrenceDialog, type OccurrenceDialogState } from "./occurrence-dialog";

const sermonId = "11111111-1111-4111-8111-111111111111";
const venueId = "22222222-2222-4222-8222-222222222222";
const contextId = "44444444-4444-4444-8444-444444444444";
const sermon = { id: sermonId, title: "It is Well" };
const venue = { id: venueId, name: "Grace Baptist Church", locality: "Springfield" };
const context = { id: contextId, name: "Regular Church Service" };

const item: HistoryItem = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  ownerId: "owner-1",
  sermonId,
  preachedOn: "2026-10-04",
  timeOfDay: "pm",
  venueId,
  contextId,
  actualFormat: "mini",
  durationMinutes: 75,
  notes: "Went long.",
  recordingUrl: "https://example.com/it-is-well",
  createdAt: new Date("2026-10-04T18:00:00Z"),
  updatedAt: new Date("2026-10-04T18:00:00Z"),
  sermon: { id: sermonId, title: "It is Well", kind: "sermon", archivedAt: null },
  venue,
  context,
};

const dialog = (open: OccurrenceDialogState, locale: Locale = "en", attends = false) => (
  <I18nProvider locale={locale}>
    <PreachingClassProvider attends={attends}>
      <ToastProvider>
        <OccurrenceDialog
          state={open}
          onClose={state.onClose}
          venues={[venue]}
          contexts={[context]}
        />
      </ToastProvider>
    </PreachingClassProvider>
  </I18nProvider>
);
const record = (locale?: Locale, attends?: boolean) =>
  render(dialog({ mode: "record", sermon }, locale, attends));
const submit = (name = "Record") => fireEvent.click(screen.getByRole("button", { name }));
const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
/** What the last attempt to record sent, and the ID it sent it under. */
const sent = () => state.recordOccurrence.mock.calls.at(-1) as [Record<string, unknown>, string];

/** Picks a value in one of the dropdowns, as a pointer does. */
async function choose(label: string, option: string) {
  fireEvent.click(screen.getByRole("combobox", { name: label }));
  const found = await screen.findByRole("option", { name: option });
  fireEvent.pointerDown(found, { pointerType: "mouse" });
  fireEvent.mouseMove(found);
  fireEvent.pointerUp(found, { pointerType: "mouse" });
  fireEvent.mouseUp(found);
  fireEvent.click(found);
}

beforeEach(() => {
  vi.clearAllMocks();
  state.recordOccurrence.mockResolvedValue({
    ok: true,
    message: "Added to your preaching record.",
    id: "x",
  });
  state.updateOccurrence.mockResolvedValue({ ok: true, message: "Changes saved." });
});
afterEach(() => vi.unstubAllGlobals());

describe("recording that a sermon was preached", () => {
  it("needs only the sermon and the date, which begins as today where the person is", async () => {
    record();
    expect(screen.getByRole("dialog", { name: "Record preaching" })).toHaveTextContent(
      "It is Well",
    );
    // The sermon is already chosen: there is nothing to pick.
    expect(screen.queryByRole("search")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Date preached")).toHaveValue(localDate());
    expect(screen.getByRole("radio", { name: "Not specified" })).toBeChecked();

    submit();
    await waitFor(() => expect(state.recordOccurrence).toHaveBeenCalledTimes(1));
    expect(sent()[0]).toEqual({
      sermonId,
      preachedOn: localDate(),
      // Nothing optional was said, and nothing is made up for it.
      timeOfDay: null,
      venueId: null,
      contextId: null,
      actualFormat: "unspecified",
      durationMinutes: null,
      notes: null,
      recordingUrl: null,
    });
    expect(sent()[1]).toMatch(/^[0-9a-f-]{36}$/);
    expect(await screen.findByText("Added to your preaching record.")).toBeVisible();
    expect(state.refresh).toHaveBeenCalled();
    expect(state.onClose).toHaveBeenCalled();
  });

  it("sends what was filled in: AM or PM, the venue, the context, the format, the length", async () => {
    record();
    type("Date preached", "2026-10-04");
    fireEvent.click(screen.getByRole("radio", { name: "AM" }));
    await choose("Venue", "Grace Baptist Church · Springfield");
    await choose("Context", "Regular Church Service");
    await choose("Format preached", "Full-Length");
    type("Hours", "1");
    type("Minutes", "15");
    type("Notes (optional)", "  Went long.  ");
    type("Recording link (optional)", "https://example.com/it-is-well");

    submit();
    await waitFor(() => expect(state.recordOccurrence).toHaveBeenCalled());
    expect(sent()[0]).toEqual({
      sermonId,
      preachedOn: "2026-10-04",
      timeOfDay: "am",
      venueId,
      contextId,
      actualFormat: "full_length",
      durationMinutes: 75,
      notes: "Went long.",
      recordingUrl: "https://example.com/it-is-well",
    });
  });

  it("takes minutes alone, and zero as zero", async () => {
    record();
    type("Minutes", "0");
    submit();
    await waitFor(() => expect(state.recordOccurrence).toHaveBeenCalled());
    expect(sent()[0].durationMinutes).toBe(0);
  });

  it.each([
    ["Date preached", "2999-01-01", "The date cannot be in the future."],
    ["Date preached", "", "Give the date it was preached."],
    ["Minutes", "a while", "Give the length in whole minutes."],
    ["Hours", "30", "That is longer than a day."],
    ["Recording link (optional)", "http://example.com/a", "Use a link that begins with https://."],
    ["Recording link (optional)", "not a link", "That is not a link."],
  ])("says what is wrong with %s “%s”, and sends nothing", async (label, value, message) => {
    record();
    type(label, value);
    submit();
    expect(await screen.findAllByText(message)).not.toHaveLength(0);
    expect(screen.getByLabelText(label)).toHaveAttribute("aria-invalid", "true");
    expect(state.recordOccurrence).not.toHaveBeenCalled();
    // Corrected, the complaint goes.
    type(label, label === "Date preached" ? "2026-10-04" : "");
    expect(screen.queryByText(message)).not.toBeInTheDocument();
  });

  it("sends the same occasion again after a failure, and a new one from a new form", async () => {
    state.recordOccurrence.mockResolvedValueOnce({
      ok: false,
      message: "That could not be recorded. Try again.",
    });
    const view = record();
    submit();
    expect(await screen.findByText("That could not be recorded. Try again.")).toBeVisible();
    // What was typed is still there, and nothing closed.
    expect(state.onClose).not.toHaveBeenCalled();
    const first = sent()[1];

    submit();
    await waitFor(() => expect(state.recordOccurrence).toHaveBeenCalledTimes(2));
    expect(sent()[1]).toBe(first);

    // Closed and opened again, it is another occasion: a sermon may be preached twice in a day.
    view.rerender(dialog(null));
    view.rerender(dialog({ mode: "record", sermon }));
    submit();
    await waitFor(() => expect(state.recordOccurrence).toHaveBeenCalledTimes(3));
    expect(sent()[1]).not.toBe(first);
  });

  it("cannot be sent twice while the first is on its way", async () => {
    let answer: (value: unknown) => void = () => {};
    state.recordOccurrence.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    record();
    submit();
    const button = await screen.findByRole("button", { name: "Recording…" });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    fireEvent.submit(button.closest("form")!);
    expect(state.recordOccurrence).toHaveBeenCalledTimes(1);
    answer({ ok: true, message: "Added to your preaching record." });
    await waitFor(() => expect(state.onClose).toHaveBeenCalled());
  });

  it("says when the server could not be reached", async () => {
    state.recordOccurrence.mockRejectedValue(new Error("network"));
    record();
    submit();
    expect(
      await screen.findByText("That could not be done. Check your connection and try again."),
    ).toBeVisible();
  });

  it("finds the sermon by name when the page does not know it, archived ones among them", async () => {
    const fetch = vi.fn<(address: string, init?: unknown) => Promise<unknown>>(async () => ({
      ok: true,
      json: async () => ({
        total: 2,
        items: [
          { id: sermonId, title: "It is Well", archived: false },
          { id: "55555555-5555-4555-8555-555555555555", title: "An old favorite", archived: true },
        ],
      }),
    }));
    vi.stubGlobal("fetch", fetch);
    render(dialog({ mode: "record" }));

    // Without a sermon there is nothing to record.
    submit();
    expect(await screen.findAllByText("Choose the sermon that was preached.")).not.toHaveLength(0);
    expect(state.recordOccurrence).not.toHaveBeenCalled();

    const results = within(await screen.findByRole("list", { name: "Recently changed" }));
    expect(fetch).toHaveBeenCalledWith("/api/preaching/sermons", expect.anything());
    expect(results.getByRole("button", { name: "Choose An old favorite" })).toHaveTextContent(
      "Archived",
    );
    fireEvent.click(results.getByRole("button", { name: "Choose It is Well" }));
    expect(screen.queryByText("Choose the sermon that was preached.")).not.toBeInTheDocument();
    // Chosen, it is named, with the way to choose another.
    expect(screen.getByRole("button", { name: "Choose a different sermon" })).toBeVisible();

    submit();
    await waitFor(() => expect(state.recordOccurrence).toHaveBeenCalled());
    expect(sent()[0].sermonId).toBe(sermonId);
  });

  it("says so when the sermons cannot be searched, and tries again when asked", async () => {
    const fetch = vi.fn(async () => ({ ok: false, json: async () => ({}) }));
    vi.stubGlobal("fetch", fetch);
    render(dialog({ mode: "record" }));
    expect(await screen.findByText("Your sermons could not be searched. Try again.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  });

  it("adds a venue without leaving the form, and has it chosen", async () => {
    const made = { id: "66666666-6666-4666-8666-666666666666", name: "Camp Hope", locality: null };
    state.createVenue.mockResolvedValue({ ok: true, message: "Venue saved.", venue: made });
    record();
    type("Notes (optional)", "Typed before the venue.");

    fireEvent.click(screen.getByRole("button", { name: "New venue" }));
    const adder = within(screen.getByRole("group", { name: "New venue" }));
    fireEvent.change(adder.getByLabelText("Venue name"), { target: { value: "  Camp   Hope " } });
    fireEvent.click(adder.getByRole("button", { name: "Add" }));

    await waitFor(() =>
      expect(state.createVenue).toHaveBeenCalledWith({ name: "Camp Hope", locality: null }),
    );
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Venue" })).toHaveTextContent("Camp Hope"),
    );
    // Nothing typed around it was lost.
    expect(screen.getByLabelText("Notes (optional)")).toHaveValue("Typed before the venue.");

    submit();
    await waitFor(() => expect(state.recordOccurrence).toHaveBeenCalled());
    expect(sent()[0]).toMatchObject({ venueId: made.id, notes: "Typed before the venue." });
  });

  it("chooses the venue that already has the name, and says so when it cannot", async () => {
    state.createVenue.mockResolvedValueOnce({
      ok: false,
      message: "You already have a venue with that name.",
      existingId: venueId,
    });
    record();
    fireEvent.click(screen.getByRole("button", { name: "New venue" }));
    fireEvent.change(screen.getByLabelText("Venue name"), {
      target: { value: "grace baptist church" },
    });
    fireEvent.keyDown(screen.getByLabelText("Venue name"), { key: "Enter" });
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Venue" })).toHaveTextContent(
        "Grace Baptist Church · Springfield",
      ),
    );
    // Enter added the venue; it did not send the form around it.
    expect(state.recordOccurrence).not.toHaveBeenCalled();

    state.createVenue.mockResolvedValueOnce({
      ok: false,
      message: "The venue could not be saved. Try again.",
    });
    fireEvent.click(screen.getByRole("button", { name: "New venue" }));
    fireEvent.change(screen.getByLabelText("Venue name"), { target: { value: "Elsewhere" } });
    fireEvent.click(
      within(screen.getByRole("group", { name: "New venue" })).getByRole("button", { name: "Add" }),
    );
    expect(await screen.findByText("The venue could not be saved. Try again.")).toHaveAttribute(
      "role",
      "alert",
    );
  });

  it("offers the suggested contexts the account has not made, and makes one only when picked", async () => {
    const made = { id: "77777777-7777-4777-8777-777777777777", name: "Preaching Class" };
    state.createContext.mockResolvedValue({ ok: true, message: "Context saved.", context: made });
    record("en", true);
    expect(state.createContext).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "New context" }));
    const adder = within(screen.getByRole("group", { name: "New context" }));
    // The one the account already has is not suggested again.
    expect(adder.queryByRole("button", { name: "Regular Church Service" })).not.toBeInTheDocument();
    // What kind of occasion, never the weekday or the part of the day.
    expect(adder.queryByRole("button", { name: /Sunday|Wednesday|Morning|Evening/ })).toBeNull();
    fireEvent.click(adder.getByRole("button", { name: "Preaching Class" }));

    await waitFor(() => expect(state.createContext).toHaveBeenCalledWith("Preaching Class"));
    submit();
    await waitFor(() => expect(state.recordOccurrence).toHaveBeenCalled());
    expect(sent()[0].contextId).toBe(made.id);
  });

  it("suggests Preaching Class only to an account that attends one, and still takes the name", async () => {
    const made = { id: "77777777-7777-4777-8777-777777777777", name: "Preaching Class" };
    state.createContext.mockResolvedValue({ ok: true, message: "Context saved.", context: made });
    record();
    fireEvent.click(screen.getByRole("button", { name: "New context" }));
    const adder = within(screen.getByRole("group", { name: "New context" }));
    expect(adder.queryByRole("button", { name: "Preaching Class" })).toBeNull();
    // The other suggestions are there as before.
    expect(adder.getByRole("button", { name: "Special Service" })).toBeVisible();

    // Nothing stops the account writing it.
    fireEvent.change(adder.getByLabelText("Context name"), {
      target: { value: "Preaching Class" },
    });
    fireEvent.click(adder.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(state.createContext).toHaveBeenCalledWith("Preaching Class"));
  });

  it("is in Spanish for an account that reads Spanish", () => {
    record("es");
    expect(screen.getByRole("dialog", { name: "Registrar predicación" })).toBeVisible();
    expect(screen.getByLabelText("Fecha de predicación")).toBeVisible();
    expect(screen.getByRole("radio", { name: "Sin especificar" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Registrar" })).toBeVisible();
  });
});

describe("changing an occasion", () => {
  const edit = async () => {
    const view = render(dialog({ mode: "view", item }));
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    return view;
  };

  it("begins from what was recorded", async () => {
    await edit();
    expect(screen.getByRole("dialog", { name: "Edit record" })).toHaveTextContent("It is Well");
    // An occasion stays with its sermon: there is no sermon to choose.
    expect(screen.queryByRole("search")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Date preached")).toHaveValue("2026-10-04");
    expect(screen.getByRole("radio", { name: "PM" })).toBeChecked();
    expect(screen.getByRole("combobox", { name: "Venue" })).toHaveTextContent(
      "Grace Baptist Church · Springfield",
    );
    expect(screen.getByRole("combobox", { name: "Format preached" })).toHaveTextContent("Mini");
    expect(screen.getByLabelText("Hours")).toHaveValue("1");
    expect(screen.getByLabelText("Minutes")).toHaveValue("15");
    expect(screen.getByLabelText("Notes (optional)")).toHaveValue("Went long.");
  });

  it("sends only what was changed, and null for what was cleared", async () => {
    await edit();
    type("Notes (optional)", "");
    await choose("Venue", "None");
    fireEvent.click(screen.getByRole("radio", { name: "Not specified" }));
    type("Hours", "");
    type("Minutes", "40");

    submit("Save changes");
    await waitFor(() => expect(state.updateOccurrence).toHaveBeenCalledTimes(1));
    expect(state.updateOccurrence).toHaveBeenCalledWith(item.id, {
      notes: null,
      venueId: null,
      timeOfDay: null,
      durationMinutes: 40,
    });
    expect(state.recordOccurrence).not.toHaveBeenCalled();
    expect(await screen.findByText("Changes saved.")).toBeVisible();
    expect(state.onClose).toHaveBeenCalled();
  });

  it("asks nothing of the server when nothing was changed", async () => {
    await edit();
    submit("Save changes");
    expect(await screen.findByRole("dialog", { name: "Record details" })).toBeVisible();
    expect(state.updateOccurrence).not.toHaveBeenCalled();
  });

  it("keeps what was typed when the server refuses it", async () => {
    state.updateOccurrence.mockResolvedValue({
      ok: false,
      message: "That venue no longer exists.",
    });
    await edit();
    type("Notes (optional)", "A better note.");
    submit("Save changes");
    expect(await screen.findByText("That venue no longer exists.")).toBeVisible();
    expect(screen.getByLabelText("Notes (optional)")).toHaveValue("A better note.");
    expect(state.onClose).not.toHaveBeenCalled();
  });

  it("goes back to the record on Cancel, changing nothing", async () => {
    await edit();
    type("Notes (optional)", "Never mind.");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    const shown = within(await screen.findByRole("dialog", { name: "Record details" }));
    expect(shown.getByText("Went long.")).toBeVisible();
    expect(state.updateOccurrence).not.toHaveBeenCalled();
  });

  it("keeps the record when a deletion is refused, and says why", async () => {
    state.deleteOccurrence.mockResolvedValue({
      ok: false,
      message: "That record no longer exists.",
    });
    render(dialog({ mode: "view", item }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete record" }));
    // The way back has the focus, so a second Enter removes nothing.
    expect(screen.getByRole("button", { name: "Keep it" })).toHaveFocus();
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete record" }),
    );
    expect(await screen.findByText("That record no longer exists.")).toBeVisible();
    expect(state.onClose).not.toHaveBeenCalled();
  });
});

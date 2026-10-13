import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PreachingClassProvider } from "@/features/preferences/client";
import { I18nProvider } from "@/i18n/client";
import type { Locale } from "@/i18n/locales";

// The server actions and the router are mocked: this covers the manager's own behavior.
const state = vi.hoisted(() => ({
  createVenue: vi.fn(),
  updateVenue: vi.fn(),
  deleteVenue: vi.fn(),
  createContext: vi.fn(),
  renameContext: vi.fn(),
  deleteContext: vi.fn(),
  refresh: vi.fn(),
  onClose: vi.fn(),
  onDeleted: vi.fn(),
}));
vi.mock("../actions", () => ({
  createVenue: state.createVenue,
  updateVenue: state.updateVenue,
  deleteVenue: state.deleteVenue,
  createContext: state.createContext,
  renameContext: state.renameContext,
  deleteContext: state.deleteContext,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: state.refresh }) }));

import { ReferenceManager, type ReferenceKind } from "./reference-manager";

const grace = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Grace Baptist Church",
  locality: "Springfield",
  occurrenceCount: 3,
};
const camp = {
  id: "33333333-3333-4333-8333-333333333333",
  name: "Camp Hope",
  locality: null,
  occurrenceCount: 0,
};
const regular = {
  id: "44444444-4444-4444-8444-444444444444",
  name: "Regular Church Service",
  occurrenceCount: 1,
};
const youth = {
  id: "55555555-5555-4555-8555-555555555555",
  name: "Youth rally",
  occurrenceCount: 0,
};

const manager = (kind: ReferenceKind | null, locale: Locale = "en", attends = false) => (
  <I18nProvider locale={locale}>
    <PreachingClassProvider attends={attends}>
      <ReferenceManager
        kind={kind}
        venues={[camp, grace]}
        contexts={[regular, youth]}
        onClose={state.onClose}
        onDeleted={state.onDeleted}
      />
    </PreachingClassProvider>
  </I18nProvider>
);
const rows = (name: string) => within(screen.getByRole("list", { name })).getAllByRole("listitem");

beforeEach(() => vi.clearAllMocks());

describe("managing venues", () => {
  it("lists them with where they are and how many records name each", () => {
    render(manager("venue"));
    expect(screen.getByRole("dialog", { name: "Venues" })).toBeVisible();
    const [first, second] = rows("Your venues");
    expect(first).toHaveTextContent("Camp Hope");
    expect(first).toHaveTextContent("Not on any record");
    expect(second).toHaveTextContent("Grace Baptist Church");
    expect(second).toHaveTextContent("Springfield · On 3 records");
  });

  it("creates one with its locality, and keeps what was typed until it is saved", async () => {
    state.createVenue.mockResolvedValueOnce({
      ok: false,
      message: "You already have a venue with that name.",
      existingId: camp.id,
    });
    render(manager("venue"));
    const name = screen.getByLabelText("New venue");
    fireEvent.change(name, { target: { value: " camp  hope " } });
    fireEvent.change(screen.getByLabelText("Town or city"), { target: { value: "Dayton" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    // A name already taken says so, in words about the name.
    expect(await screen.findByText("You already have a venue with that name.")).toBeVisible();
    expect(state.createVenue).toHaveBeenCalledWith({ name: "camp hope", locality: "Dayton" });
    expect(name).toHaveValue(" camp  hope ");
    expect(state.refresh).not.toHaveBeenCalled();

    state.createVenue.mockResolvedValueOnce({ ok: true, message: "Venue saved." });
    fireEvent.change(name, { target: { value: "Camp Faith" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByText("Venue saved.")).toBeVisible();
    expect(name).toHaveValue("");
    expect(state.refresh).toHaveBeenCalled();
  });

  it("does not ask the server for a venue with no name", () => {
    render(manager("venue"));
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("New venue"), { target: { value: "   " } });
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
    expect(state.createVenue).not.toHaveBeenCalled();
  });

  it("changes only what was changed about a venue", async () => {
    state.updateVenue.mockResolvedValue({ ok: true, message: "Venue saved." });
    render(manager("venue"));
    fireEvent.click(screen.getByRole("button", { name: "Edit Grace Baptist Church" }));
    fireEvent.change(screen.getByLabelText("Town or city for Grace Baptist Church"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    // The name was not touched, and an emptied locality is cleared.
    await waitFor(() =>
      expect(state.updateVenue).toHaveBeenCalledWith(grace.id, { locality: null }),
    );
    expect(await screen.findByText("Venue saved.")).toBeVisible();
  });

  it("leaves a rename with nothing changed, and one the server refuses open", async () => {
    render(manager("venue"));
    fireEvent.click(screen.getByRole("button", { name: "Edit Camp Hope" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(state.updateVenue).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("New name for Camp Hope")).not.toBeInTheDocument();

    state.updateVenue.mockResolvedValue({
      ok: false,
      message: "You already have a venue with that name.",
    });
    fireEvent.click(screen.getByRole("button", { name: "Edit Camp Hope" }));
    const box = screen.getByLabelText("New name for Camp Hope");
    fireEvent.change(box, { target: { value: "Grace Baptist Church" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("You already have a venue with that name.")).toHaveAttribute(
      "role",
      "alert",
    );
    expect(box).toHaveValue("Grace Baptist Church");
  });

  it("deletes an unused venue only after asking, and tells whatever was filtering by it", async () => {
    state.deleteVenue.mockResolvedValue({ ok: true, message: "Venue deleted." });
    render(manager("venue"));
    fireEvent.click(screen.getByRole("button", { name: "Delete Camp Hope" }));
    const question = await screen.findByRole("alertdialog", { name: "Delete “Camp Hope”?" });
    expect(question).toHaveTextContent("nothing in your preaching record changes");
    expect(state.deleteVenue).not.toHaveBeenCalled();

    fireEvent.click(within(question).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(state.deleteVenue).toHaveBeenCalledWith(camp.id));
    expect(await screen.findByText("Venue deleted.")).toBeVisible();
    expect(state.onDeleted).toHaveBeenCalledWith("venue", camp.id);
    expect(state.refresh).toHaveBeenCalled();
  });

  it("explains at once why a venue history names cannot be deleted, and asks the server nothing", () => {
    render(manager("venue"));
    fireEvent.click(screen.getByRole("button", { name: "Delete Grace Baptist Church" }));
    expect(
      screen.getByText(
        "That venue is on 3 records in your preaching record and cannot be deleted.",
      ),
    ).toHaveAttribute("role", "alert");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(state.deleteVenue).not.toHaveBeenCalled();
    // It is still there, and so is everything else.
    expect(rows("Your venues")).toHaveLength(2);
  });

  it("shows the server's refusal for a venue recorded on since the page was read", async () => {
    state.deleteVenue.mockResolvedValue({
      ok: false,
      message: "That venue is on 1 record in your preaching record and cannot be deleted.",
    });
    render(manager("venue"));
    fireEvent.click(screen.getByRole("button", { name: "Delete Camp Hope" }));
    fireEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Delete" }),
    );
    expect(
      await screen.findByText(
        "That venue is on 1 record in your preaching record and cannot be deleted.",
      ),
    ).toBeVisible();
    expect(state.onDeleted).not.toHaveBeenCalled();
  });
});

describe("managing contexts", () => {
  it("offers the suggestions the account has not made, and makes one only when picked", async () => {
    state.createContext.mockResolvedValue({ ok: true, message: "Context saved." });
    render(manager("context", "en", true));
    expect(screen.getByRole("dialog", { name: "Contexts" })).toBeVisible();
    expect(state.createContext).not.toHaveBeenCalled();

    // Regular Church Service is theirs already; the other four are offered.
    expect(screen.queryByRole("button", { name: "Add Regular Church Service" })).toBeNull();
    for (const name of [
      "Preaching Class",
      "Conference / Preaching Bootcamp",
      "Special Service",
      "Other",
    ]) {
      expect(screen.getByRole("button", { name: `Add ${name}` })).toBeVisible();
    }
    // What kind of occasion it was, never the weekday or the part of the day.
    expect(screen.queryByRole("button", { name: /Sunday|Wednesday|Morning|Evening/ })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Add Preaching Class" }));
    await waitFor(() => expect(state.createContext).toHaveBeenCalledWith("Preaching Class"));
    expect(await screen.findByText("Context saved.")).toBeVisible();
  });

  it("suggests Preaching Class only to an account that attends one", () => {
    render(manager("context"));
    expect(screen.queryByRole("button", { name: "Add Preaching Class" })).toBeNull();
    for (const name of ["Conference / Preaching Bootcamp", "Special Service", "Other"]) {
      expect(screen.getByRole("button", { name: `Add ${name}` })).toBeVisible();
    }
    // What the account already has is listed whatever the preference says.
    expect(rows("Your contexts")).toHaveLength(2);
  });

  it("takes whatever the account calls its own context", async () => {
    state.createContext.mockResolvedValue({ ok: true, message: "Context saved." });
    render(manager("context"));
    fireEvent.change(screen.getByLabelText("New context"), { target: { value: "Jail ministry" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(state.createContext).toHaveBeenCalledWith("Jail ministry"));
  });

  it("renames one, which has no locality", async () => {
    state.renameContext.mockResolvedValue({ ok: true, message: "Context saved." });
    render(manager("context"));
    fireEvent.click(screen.getByRole("button", { name: "Edit Youth rally" }));
    expect(screen.queryByLabelText(/Town or city/)).not.toBeInTheDocument();
    const box = screen.getByLabelText("New name for Youth rally");
    fireEvent.change(box, { target: { value: "Youth conference" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(state.renameContext).toHaveBeenCalledWith(youth.id, "Youth conference"),
    );
  });

  it("keeps a context history names, and deletes one it does not", async () => {
    state.deleteContext.mockResolvedValue({ ok: true, message: "Context deleted." });
    render(manager("context"));
    fireEvent.click(screen.getByRole("button", { name: "Delete Regular Church Service" }));
    expect(
      screen.getByText(
        "That context is on 1 record in your preaching record and cannot be deleted.",
      ),
    ).toBeVisible();
    expect(state.deleteContext).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Delete Youth rally" }));
    fireEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Delete" }),
    );
    await waitFor(() => expect(state.deleteContext).toHaveBeenCalledWith(youth.id));
    expect(state.onDeleted).toHaveBeenCalledWith("context", youth.id);
  });

  it("is in Spanish for an account that reads Spanish", () => {
    render(manager("context", "es", true));
    expect(screen.getByRole("dialog", { name: "Contextos" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Añadir Clase de predicación" })).toBeVisible();
    expect(rows("Tus contextos")[0]).toHaveTextContent("En 1 registro");
  });
});

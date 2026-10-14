import "fake-indexeddb/auto";

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ createIdea: vi.fn() }));
vi.mock("@/features/ideas/actions", () => ({ createIdea: state.createIdea }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/offline",
}));

import { ToastProvider } from "@/components/ui/toast";
import { ReadingProvider } from "@/features/preferences/client";
import { I18nProvider } from "@/i18n/client";
import { closeOfflineDb, openOfflineDb } from "../db";
import { enqueue, listMutations } from "../queue";
import { resetOfflineSettingsMemory } from "../settings";
import { OfflineAccountProvider } from "./offline-account";
import { OfflineNotice, offlineNoticeKey, resetOfflineNoticeForTests } from "./offline-notice";
import { setActiveAccount } from "../account";
import { OfflineShell } from "./offline-shell";
import { OfflineStorageSettings } from "./offline-storage-settings";

function view(children: React.ReactNode, account: string | null = "owner-a") {
  return render(
    <I18nProvider locale="en">
      <ReadingProvider translation="kjv" translations={["kjv", "rvg"]}>
        <OfflineAccountProvider account={account}>
          <ToastProvider>{children}</ToastProvider>
        </OfflineAccountProvider>
      </ReadingProvider>
    </I18nProvider>,
  );
}

const capture = (id: string, title: string) => ({
  opId: id,
  type: "idea.create" as const,
  entityType: "idea" as const,
  entityId: id,
  payload: { title, kind: "undecided" },
});

beforeEach(async () => {
  await closeOfflineDb();
  globalThis.indexedDB = new IDBFactory();
  resetOfflineSettingsMemory();
  resetOfflineNoticeForTests();
  localStorage.clear();
  state.createIdea.mockReset();
});
afterEach(() => closeOfflineDb());

describe("OfflineStorageSettings", () => {
  it("shows each translation's state and asks before removing one", async () => {
    const db = await openOfflineDb();
    await db.put("bibleDatasets", {
      translation: "rvg",
      status: "failed",
      error: "quota",
      autoAttempts: 0,
      updatedAt: 0,
    });
    view(<OfflineStorageSettings />);

    expect(await screen.findByText(/not enough room on this device/)).toBeVisible();
    expect(screen.getByText("Kept automatically")).toBeVisible();
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
    // Future content is shown as not yet available, never as working.
    expect(screen.getByRole("switch", { name: "Sermon outlines" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Remove RVG from this device?")).toBeVisible();
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));
    await waitFor(async () => expect(await db.get("bibleDatasets", "rvg")).toBeUndefined());
  });

  it("turning off capture keeps what is already waiting", async () => {
    await enqueue("owner-a", capture("op-1", "Waiting thought"));
    view(<OfflineStorageSettings />);
    expect(await screen.findByText("Waiting thought")).toBeVisible();
    const toggle = screen.getByRole("switch", { name: /Keep captures on this device/ });
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "false"));
    expect(await listMutations("owner-a")).toHaveLength(1);
  });
});

describe("PendingCaptures", () => {
  it("saves a waiting thought as the same idea, and lets it go only once the server has it", async () => {
    await enqueue("owner-a", capture("op-1", "A thought"));
    state.createIdea.mockResolvedValueOnce({ ok: false, message: "Still offline." });
    state.createIdea.mockResolvedValueOnce({ ok: true, message: "Saved.", id: "op-1" });
    view(<OfflineStorageSettings />);

    fireEvent.click(await screen.findByRole("button", { name: "Save to account" }));
    await waitFor(() => expect(state.createIdea).toHaveBeenCalledTimes(1));
    expect(await listMutations("owner-a")).toHaveLength(1);

    fireEvent.click(await screen.findByRole("button", { name: "Save to account" }));
    await waitFor(async () => expect(await listMutations("owner-a")).toEqual([]));
    expect(state.createIdea.mock.calls.map(([, id]) => id)).toEqual(["op-1", "op-1"]);
  });

  it("shows nothing of another account, and deletes only after asking", async () => {
    await enqueue("owner-b", capture("op-b", "Not yours"));
    await enqueue("owner-a", capture("op-a", "Yours"));
    view(<OfflineStorageSettings />);
    expect(await screen.findByText("Yours")).toBeVisible();
    expect(screen.queryByText("Not yours")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/deletes it for good/)).toBeVisible();
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete for good" }));
    await waitFor(async () => expect(await listMutations("owner-a")).toEqual([]));
    expect(await listMutations("owner-b")).toHaveLength(1);
  });
});

describe("OfflineNotice", () => {
  it("says once what works offline, until dismissed", async () => {
    view(<OfflineNotice />);
    expect(await screen.findByText("Sermon Tracker works offline now")).toBeVisible();
    expect(screen.getByRole("link", { name: "Manage offline storage" })).toHaveAttribute(
      "href",
      "/settings#offline",
    );
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(localStorage.getItem(offlineNoticeKey)).toBe("dismissed");
  });

  it("waits for the tour's invitation to be answered", () => {
    view(<OfflineNotice introduce={false} />);
    expect(screen.queryByText("Sermon Tracker works offline now")).not.toBeInTheDocument();
  });

  it("always says when thoughts are waiting on this device, even once dismissed", async () => {
    localStorage.setItem(offlineNoticeKey, "dismissed");
    await enqueue("owner-a", capture("op-1", "A thought"));
    view(<OfflineNotice />);
    expect(await screen.findByText("1 thought is waiting on this device")).toBeVisible();
    expect(screen.getByRole("link", { name: "Review" })).toHaveAttribute(
      "href",
      "/settings#offline-capture",
    );
  });
});

describe("OfflineShell", () => {
  it("offers nothing of an account when no one is signed in on this device", async () => {
    render(<OfflineShell />);
    expect(await screen.findByRole("heading", { name: "You're offline" })).toBeVisible();
    expect(screen.getByText(/No translation is downloaded/)).toBeVisible();
    expect(screen.getByText(/Sign in while online/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Capture" })).not.toBeInTheDocument();
  });

  it("offers capture, and only that account's waiting thoughts, to the account last signed in", async () => {
    await setActiveAccount("owner-a");
    await enqueue("owner-a", capture("op-a", "Mine"));
    await enqueue("owner-b", capture("op-b", "Someone else's"));
    render(<OfflineShell />);
    expect(await screen.findByRole("button", { name: "Capture" })).toBeVisible();
    expect(await screen.findByText("Mine")).toBeVisible();
    expect(screen.queryByText("Someone else's")).not.toBeInTheDocument();
  });
});

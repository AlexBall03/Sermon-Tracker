import "fake-indexeddb/auto";

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ createIdea: vi.fn(), syncMutation: vi.fn() }));
vi.mock("@/features/ideas/actions", () => ({ createIdea: state.createIdea }));
vi.mock("@/features/sync/actions", () => ({ syncMutation: state.syncMutation }));
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
import { SyncAgent } from "../sync/agent";
import { SyncSettings } from "./sync-settings";

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
  state.syncMutation.mockReset();
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
    // Outlines are kept only once the person asks (Phase 5D.2).
    expect(
      screen.getByRole("switch", { name: "Keep my outlines on this device" }),
    ).not.toBeChecked();

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
  it("is sent by the engine as the same change, and leaves only once the server has it", async () => {
    await enqueue("owner-a", capture("op-1", "A thought"));
    state.syncMutation.mockRejectedValueOnce(new Error("offline"));
    state.syncMutation.mockResolvedValueOnce({ status: "applied", entityId: "op-1" });
    view(
      <SyncAgent account="owner-a">
        <OfflineStorageSettings />
      </SyncAgent>,
    );

    // Sent by itself on opening; no answer, so it waits and says so.
    expect(await screen.findByText(/Trying again/)).toBeVisible();
    expect(await listMutations("owner-a")).toHaveLength(1);

    fireEvent.click(await screen.findByRole("button", { name: "Save now" }));
    await waitFor(async () => expect(await listMutations("owner-a")).toEqual([]));
    expect(state.syncMutation.mock.calls.map(([change]) => change.opId)).toEqual(["op-1", "op-1"]);
    expect(state.syncMutation.mock.calls[0][0]).toMatchObject({
      owner: "owner-a",
      entityId: "op-1",
    });
  });

  it("keeps a conflict until the person chooses, then sends what they chose", async () => {
    await enqueue("owner-a", {
      ...capture("op-1", "Tagged"),
      payload: { title: "Tagged", tagIds: ["tag-kept", "tag-gone"] },
    });
    state.syncMutation.mockResolvedValueOnce({
      status: "conflict",
      conflict: { reason: "missingTags", missingTagIds: ["tag-gone"] },
    });
    state.syncMutation.mockResolvedValueOnce({ status: "applied", entityId: "op-1" });
    view(
      <SyncAgent account="owner-a">
        <OfflineStorageSettings />
      </SyncAgent>,
    );

    // A run left by the test before may still hold the lock; the agent asks again shortly.
    expect(await screen.findByText("Needs your choice", {}, { timeout: 3000 })).toBeVisible();
    expect(await listMutations("owner-a")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Save without the deleted tags" }));
    await waitFor(async () => expect(await listMutations("owner-a")).toEqual([]));
    expect(state.syncMutation.mock.calls[1][0].payload).toEqual({
      title: "Tagged",
      tagIds: ["tag-kept"],
    });
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

describe("SyncSettings", () => {
  it("says what is waiting and what needs the person, and that all is saved once it is", async () => {
    await enqueue("owner-a", capture("op-1", "First"));
    await enqueue("owner-a", capture("op-2", "Second"));
    state.syncMutation.mockImplementation(async (change: { opId: string }) =>
      change.opId === "op-1" ? { status: "rejected", reason: "validation" } : { status: "auth" },
    );
    view(
      <SyncAgent account="owner-a">
        <SyncSettings />
      </SyncAgent>,
    );
    expect(await screen.findByText("Paused until you sign in again.")).toBeVisible();
    expect(await screen.findByText("Not saved")).toBeVisible();
    expect((await listMutations("owner-a")).map((record) => record.status)).toEqual([
      "failed",
      "pending",
    ]);

    state.syncMutation.mockImplementation(async (change: { opId: string; entityId: string }) => ({
      status: "applied",
      entityId: change.entityId,
    }));
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Everything on this device is in your account.")).toBeVisible();
    expect(screen.getByText(/Last saved to your account/)).toBeVisible();
  });
});

describe("OfflineNotice", () => {
  it("says once what works offline, until dismissed", async () => {
    view(<OfflineNotice />);
    expect(await screen.findByText("Sermon Tracker works offline now")).toBeVisible();
    expect(screen.getByRole("link", { name: "Manage offline storage" })).toHaveAttribute(
      "href",
      "/settings/offline",
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
    expect(await screen.findByText("1 change is waiting on this device")).toBeVisible();
    expect(screen.getByRole("link", { name: "Review" })).toHaveAttribute(
      "href",
      "/settings/offline#offline-capture",
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

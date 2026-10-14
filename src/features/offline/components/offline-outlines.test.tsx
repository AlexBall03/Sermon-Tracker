import "fake-indexeddb/auto";

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ action: vi.fn(), refresh: vi.fn() }));
// Nothing here may reach the server: every action is a failure of the test.
vi.mock("@/features/outlines/actions", () => ({
  addEntry: state.action,
  updateEntry: state.action,
  moveEntry: state.action,
  removeEntry: state.action,
  setEntryReferences: state.action,
  setOutlineNumbering: state.action,
  deleteOutline: state.action,
  createOutline: state.action,
}));
vi.mock("@/features/sync/actions", () => ({ syncMutation: state.action }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: state.refresh }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/outlines",
}));

import { ToastProvider } from "@/components/ui/toast";
import { ReadingProvider } from "@/features/preferences/client";
import type { OfflineOutline as Kept } from "@/features/sync/outlines";
import { I18nProvider } from "@/i18n/client";
import { closeOfflineDb, openOfflineDb } from "../db";
import { createDeviceOutlineApi } from "../outlines/operations";
import { getKeptOutline, outlineRecord, writeOutlinesState } from "../outlines/store";
import { listMutations } from "../queue";
import { resetOfflineSettingsMemory } from "../settings";
import { OfflineAccountProvider } from "./offline-account";
import { OfflineOutline, OfflineOutlines } from "./offline-outlines";
import { PendingChanges } from "./pending-changes";

const A = "11111111-1111-4111-8111-111111111111";
const outlineId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const otherId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const p1 = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const outline = (fields: Partial<Kept> = {}): Kept => ({
  id: outlineId,
  sermonId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  revision: 2,
  numbering: { version: 1, preset: "traditional" },
  createdAt: "2026-10-01T10:00:00.000Z",
  updatedAt: "2026-10-01T10:00:00.000Z",
  sermon: {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    title: "Amazing Grace",
    kind: "sermon",
    status: "developing",
    archivedAt: null,
  },
  sermonReferences: [],
  entries: [
    {
      id: p1,
      parentId: null,
      type: "point",
      position: 0,
      title: "First",
      notes: null,
      revision: 3,
      references: [],
      sourcePointId: null,
    },
  ],
  ...fields,
});

async function keep(...outlines: Kept[]) {
  const db = await openOfflineDb();
  for (const item of outlines) {
    await db.put("accountData", outlineRecord(A, item.id, { server: item, local: null }));
  }
  await writeOutlinesState(A, {
    complete: true,
    completedAt: Date.now(),
    total: outlines.length,
    have: outlines.length,
  });
}

function view(children: React.ReactNode, account: string | null = A) {
  return render(
    <I18nProvider locale="en">
      <ReadingProvider translation="kjv" translations={["kjv"]}>
        <OfflineAccountProvider account={account}>
          <ToastProvider>{children}</ToastProvider>
        </OfflineAccountProvider>
      </ReadingProvider>
    </I18nProvider>,
  );
}

beforeEach(async () => {
  await closeOfflineDb();
  globalThis.indexedDB = new IDBFactory();
  resetOfflineSettingsMemory();
  state.action.mockReset();
});
afterEach(() => closeOfflineDb());

describe("an outline on the offline page", () => {
  it("is the application's editor over the device's copy, and keeps each change there", async () => {
    await keep(outline());
    view(<OfflineOutline account={A} id={outlineId} />);
    const heading = await screen.findByDisplayValue("First");
    expect(screen.getByText(/This is the copy kept on this device/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Amazing Grace" })).toHaveAttribute(
      "href",
      "/library/cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    );

    fireEvent.change(heading, { target: { value: "First, kept" } });
    fireEvent.blur(heading);
    await waitFor(() => expect(screen.getByText("Saved on this device")).toBeVisible());
    const [record] = await listMutations(A);
    expect(record).toMatchObject({ type: "outline.entry.update", entityId: outlineId });
    const kept = await getKeptOutline(A, outlineId);
    expect(kept?.local?.entries[0].title).toBe("First, kept");
    // Never "Saved" alone, and never the server.
    expect(screen.queryByText("Saved")).toBeNull();
    expect(state.action).not.toHaveBeenCalled();
  });

  it("says that adding a saved point needs a connection", async () => {
    await keep(outline());
    view(<OfflineOutline account={A} id={outlineId} />);
    fireEvent.click(await screen.findByRole("button", { name: "Add from Saved Point" }));
    expect(await screen.findByText("Adding a saved point needs a connection.")).toBeVisible();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("starts again from the copy when it was changed outside the editor", async () => {
    await keep(outline());
    view(<OfflineOutline account={A} id={outlineId} />);
    await screen.findByDisplayValue("First");
    // Another tab changes the copy and the person settles something there.
    const api = createDeviceOutlineApi(A, outlineId, { locale: "en" });
    await api.updateEntry(p1, { title: "From the other tab", expectedRevision: 3 });
    const db = await openOfflineDb();
    const record = await db.get("accountData", [A, "outline", outlineId]);
    await db.put("accountData", {
      ...record!,
      data: { ...(record!.data as object), generation: 1 },
    });
    const { announceOutlinesChange } = await import("../outlines/store");
    announceOutlinesChange();
    expect(await screen.findByDisplayValue("From the other tab")).toBeVisible();
  });

  it("says when it is not on this device, and when no one is signed in", async () => {
    view(<OfflineOutline account={A} id={otherId} />);
    expect(await screen.findByText("This outline is not on this device")).toBeVisible();
    view(<OfflineOutline account={null} id={otherId} />, null);
    expect(
      screen.getByText("Sign in while online to keep your outlines on this device."),
    ).toBeVisible();
  });
});

describe("the outlines on the offline page", () => {
  it("lists the active sermons' outlines from the device, and searches them", async () => {
    await keep(
      outline(),
      outline({
        id: otherId,
        sermon: { ...outline().sermon, title: "Archived", archivedAt: "2026-10-02T00:00:00.000Z" },
      }),
    );
    const go = vi.fn();
    view(<OfflineOutlines account={A} search="" go={go} />);
    const list = await screen.findByRole("list", { name: "Outlines" });
    expect(within(list).getByText("Amazing Grace")).toBeVisible();
    expect(within(list).queryByText("Archived")).toBeNull();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "nothing" } });
    fireEvent.submit(screen.getByRole("searchbox").closest("form")!);
    await waitFor(() => expect(go).toHaveBeenCalledWith("/outlines?q=nothing", { replace: false }));
  });

  it("says when outlines are not kept on this device", async () => {
    view(<OfflineOutlines account={A} search="" go={vi.fn()} />);
    expect(await screen.findByText("Outlines are not kept on this device")).toBeVisible();
  });
});

describe("an outline's waiting changes", () => {
  it("are one row with how many there are", async () => {
    await keep(outline());
    const api = createDeviceOutlineApi(A, outlineId, { locale: "en" });
    await api.updateEntry(p1, { title: "One", expectedRevision: 3 });
    await api.moveEntry(p1, { parentId: null, position: 0, expectedRevision: 2 });
    await api.removeEntry(p1, 2);
    view(<PendingChanges />);
    const rows = await screen.findAllByRole("listitem");
    expect(rows).toHaveLength(1);
    expect(within(rows[0]).getByText("Amazing Grace")).toBeVisible();
    expect(within(rows[0]).getByText("Outline")).toBeVisible();
    expect(within(rows[0]).getByText("2 changes to this outline")).toBeVisible();
  });
});

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
import type { Locale } from "@/i18n/locales";
import { closeOfflineDb, openOfflineDb } from "../db";
import { createDeviceOutlineApi } from "../outlines/operations";
import {
  announceOutlinesChange,
  getKeptOutline,
  outlineRecord,
  writeOutlinesState,
  type KeptOutline,
} from "../outlines/store";
import { listMutations, settleMutation } from "../queue";
import { resetOfflineSettingsMemory } from "../settings";
import { OfflineAccountProvider } from "./offline-account";
import { OfflineOutline } from "./offline-outlines";
import { PendingChanges } from "./pending-changes";

/*
 * A2.3D: an outline the device knows became a sermon document, on the
 * offline page. No legacy editor; what the device kept, read only and
 * copyable; the new editor offered truthfully; Discard only once confirmed.
 */

const A = "11111111-1111-4111-8111-111111111111";
const outlineId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const p1 = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const p2 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const intro = "ffffffff-ffff-4fff-8fff-ffffffffffff";

const outline = (): Kept => ({
  id: outlineId,
  sermonId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  revision: 3,
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
      id: intro,
      parentId: null,
      type: "introduction",
      position: 0,
      title: "A lost coin",
      notes: null,
      revision: 0,
      references: [],
      sourcePointId: null,
    },
    {
      id: p1,
      parentId: null,
      type: "point",
      position: 0,
      title: "Grace finds us",
      notes: "Line one\nLine two",
      revision: 3,
      references: [{ book: 43, chapterStart: 3, verseStart: 16, chapterEnd: null, verseEnd: null }],
      sourcePointId: null,
    },
    {
      id: p2,
      parentId: p1,
      type: "point",
      position: 0,
      title: "While we were sinners",
      notes: null,
      revision: 0,
      references: [],
      sourcePointId: null,
    },
  ],
});

async function keep(data: KeptOutline) {
  const db = await openOfflineDb();
  await db.put("accountData", outlineRecord(A, outlineId, data));
  await writeOutlinesState(A, { complete: true, completedAt: Date.now(), total: 1, have: 1 });
}

async function markAuthoritative() {
  const db = await openOfflineDb();
  const record = await db.get("accountData", [A, "outline", outlineId]);
  await db.put("accountData", {
    ...record!,
    data: { ...(record!.data as KeptOutline), documentAuthoritative: true },
  });
  announceOutlinesChange();
}

function view(children: React.ReactNode, locale: Locale = "en") {
  return render(
    <I18nProvider locale={locale}>
      <ReadingProvider translation="kjv" translations={["kjv"]}>
        <OfflineAccountProvider account={A}>
          <ToastProvider>{children}</ToastProvider>
        </OfflineAccountProvider>
      </ReadingProvider>
    </I18nProvider>,
  );
}

const writeText = vi.fn<(text: string) => Promise<void>>();

beforeEach(async () => {
  await closeOfflineDb();
  globalThis.indexedDB = new IDBFactory();
  resetOfflineSettingsMemory();
  state.action.mockReset();
  writeText.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
});
afterEach(() => closeOfflineDb());

describe("an outline that became a sermon document", () => {
  it("is never the legacy editor: it says so and shows what the device kept, read only", async () => {
    await keep({ server: outline(), local: null, documentAuthoritative: true });
    view(<OfflineOutline account={A} id={outlineId} />);
    expect(await screen.findByText("This sermon now uses the new editor")).toBeVisible();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Add point" })).toBeNull();
    expect(screen.getByText(/not the sermon document in your account/)).toBeVisible();
    expect(screen.getByText(/were not added to the document/)).toBeVisible();

    const review = screen.getByRole("list", { name: "The old outline, as this device kept it" });
    const rows = within(review).getAllByRole("listitem");
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("IntroductionA lost coin"),
      expect.stringContaining("I.Grace finds us"),
      expect.stringContaining("A.While we were sinners"),
    ]);
    expect(within(rows[1]).getByText(/Line one/)).toBeVisible();
    expect(within(rows[1]).getByText("John 3:16")).toBeVisible();
    // Nothing the person can do here writes to the outline.
    expect(await listMutations(A)).toEqual([]);
  });

  it("copies the whole outline, and one entry, as plain text", async () => {
    await keep({ server: outline(), local: null, documentAuthoritative: true });
    view(<OfflineOutline account={A} id={outlineId} />);
    fireEvent.click(await screen.findByRole("button", { name: "Copy all" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0][0]).toBe(
      [
        "Amazing Grace",
        "",
        "Introduction: A lost coin",
        "I. Grace finds us",
        "  Line one",
        "  Line two",
        "  John 3:16",
        "  A. While we were sinners",
      ].join("\n"),
    );
    expect(await screen.findByText("Copied.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Copy While we were sinners" }));
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith("  A. While we were sinners"));
  });

  it("says to select the text when the browser will not copy", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    await keep({ server: outline(), local: null, documentAuthoritative: true });
    view(<OfflineOutline account={A} id={outlineId} />);
    fireEvent.click(await screen.findByRole("button", { name: "Copy all" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Select the text");
  });

  it("offers the new editor at the outline's own address, and says when offline", async () => {
    await keep({ server: outline(), local: null, documentAuthoritative: true });
    view(<OfflineOutline account={A} id={outlineId} />);
    const link = await screen.findByRole("link", { name: "Open in the new editor" });
    expect(link).toHaveAttribute("href", `/outlines/${outlineId}`);
    expect(screen.getByText(/Your account couldn't be reached/)).toBeVisible();
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    fireEvent.click(link);
    expect(await screen.findByText(/This device is offline/)).toBeVisible();
  });

  it("knows it with nothing of the old outline kept", async () => {
    await keep({ server: null, local: null, documentAuthoritative: true });
    view(<OfflineOutline account={A} id={outlineId} />);
    expect(
      await screen.findByText("Nothing of the old outline is kept on this device"),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Open in the new editor" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Discard changes kept here" })).toBeNull();
  });

  it("discards the changes kept here only once confirmed, and stays a document", async () => {
    await keep({ server: outline(), local: null });
    const api = createDeviceOutlineApi(A, outlineId, { locale: "en" });
    expect((await api.updateEntry(p1, { title: "Mine" })).ok).toBe(true);
    await markAuthoritative();
    view(<OfflineOutline account={A} id={outlineId} />);
    expect(await screen.findByText("1 change made here never reached your account.")).toBeVisible();
    // The review is the device's copy with that change in it.
    expect(screen.getByText("Mine")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Discard changes kept here" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent(/may be lost for good/);
    expect(dialog).toHaveTextContent(/sermon document in your account is not changed/);
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(await listMutations(A)).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Discard changes kept here" }));
    fireEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Discard for good",
      }),
    );
    expect(await screen.findByText(/The changes kept here were discarded/)).toBeVisible();
    expect(await listMutations(A)).toEqual([]);
    expect(await getKeptOutline(A, outlineId)).toMatchObject({
      local: null,
      documentAuthoritative: true,
    });
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("discards nothing while a change is on its way, and says so", async () => {
    await keep({ server: outline(), local: null });
    const api = createDeviceOutlineApi(A, outlineId, { locale: "en" });
    await api.updateEntry(p1, { title: "Mine" });
    const [record] = await listMutations(A);
    const db = await openOfflineDb();
    await db.put("mutations", { ...record, status: "sending" });
    await markAuthoritative();
    view(<OfflineOutline account={A} id={outlineId} />);
    fireEvent.click(await screen.findByRole("button", { name: "Discard changes kept here" }));
    fireEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Discard for good",
      }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(/nothing was discarded/);
    expect(await listMutations(A)).toHaveLength(1);
  });

  it("closes an open editor when another tab learns it, keeping words that were never kept", async () => {
    await keep({ server: outline(), local: null });
    view(<OfflineOutline account={A} id={outlineId} />);
    const heading = await screen.findByDisplayValue("Grace finds us");
    // Typed, and not yet sent to the device when the news comes.
    fireEvent.change(heading, { target: { value: "Typed just now" } });
    await markAuthoritative();
    expect(await screen.findByText("This sermon now uses the new editor")).toBeVisible();
    expect(screen.queryByRole("textbox")).toBeNull();
    const unkept = await screen.findByRole("list", { name: "Typed in this tab, never kept" });
    await waitFor(() => expect(within(unkept).getByText("Typed just now")).toBeVisible());
    // The device refused it: nothing obsolete was queued.
    await waitFor(async () => expect((await getKeptOutline(A, outlineId))?.local).toBeNull());
    expect(await listMutations(A)).toEqual([]);
  });

  it("is in Spanish for a Spanish interface", async () => {
    await keep({ server: outline(), local: null, documentAuthoritative: true });
    view(<OfflineOutline account={A} id={outlineId} />, "es");
    expect(await screen.findByText("Este sermón ahora usa el nuevo editor")).toBeVisible();
    expect(screen.getByRole("link", { name: "Abrir en el nuevo editor" })).toBeVisible();
    expect(screen.getByText(/Juan 3:16/)).toBeVisible();
  });
});

describe("its waiting changes in the list", () => {
  it("offer only discarding a conflict, and no retry", async () => {
    await keep({ server: outline(), local: null });
    const api = createDeviceOutlineApi(A, outlineId, { locale: "en" });
    await api.updateEntry(p1, { title: "Mine" });
    const [record] = await listMutations(A);
    await settleMutation(A, record.opId, {
      outcome: "conflict",
      conflict: { reason: "outlineStale", revision: 9 },
    });
    await markAuthoritative();
    view(<PendingChanges />);
    const row = (await screen.findAllByRole("listitem"))[0];
    await waitFor(() =>
      expect(within(row).getByRole("button", { name: "Discard my changes" })).toBeVisible(),
    );
    expect(within(row).queryByRole("button", { name: "Apply my changes to it" })).toBeNull();
    expect(within(row).queryByRole("button", { name: "Try again" })).toBeNull();
  });
});

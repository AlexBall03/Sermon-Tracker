import "fake-indexeddb/auto";

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  updateIdea: vi.fn(),
  changeIdeaKind: vi.fn(),
  deleteIdea: vi.fn(),
  archiveIdea: vi.fn(),
  restoreIdea: vi.fn(),
  createTag: vi.fn(),
  syncMutation: vi.fn(),
  refresh: vi.fn(),
  push: vi.fn(),
}));
vi.mock("@/features/ideas/actions", () => ({
  updateIdea: state.updateIdea,
  changeIdeaKind: state.changeIdeaKind,
  deleteIdea: state.deleteIdea,
  archiveIdea: state.archiveIdea,
  restoreIdea: state.restoreIdea,
}));
vi.mock("@/features/ideas/tag-actions", () => ({ createTag: state.createTag }));
vi.mock("@/features/sync/actions", () => ({ syncMutation: state.syncMutation }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: state.push, replace: vi.fn(), refresh: state.refresh }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/library/sermon-ideas",
}));

import { ToastProvider } from "@/components/ui/toast";
import { IdeaEditor } from "@/features/ideas/components/idea-editor";
import { ideaInputSchema } from "@/features/ideas/schemas";
import { ReadingProvider } from "@/features/preferences/client";
import type { OfflineIdea } from "@/features/sync/ideas";
import { I18nProvider } from "@/i18n/client";
import { closeOfflineDb, openOfflineDb } from "../db";
import { saveIdeaOffline } from "../ideas/operations";
import { getKeptIdea, ideaRecord, shown, writeIdeasState, writeLocalTags } from "../ideas/store";
import { enqueue, listMutations, settleMutation } from "../queue";
import { resetOfflineSettingsMemory } from "../settings";
import { OfflineAccountProvider } from "./offline-account";
import { OfflineLibrary } from "./offline-ideas";
import { PendingChanges } from "./pending-changes";

const A = "11111111-1111-4111-8111-111111111111";
const id1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const id2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const idea = (id: string, fields: Partial<OfflineIdea> = {}): OfflineIdea => ({
  id,
  kind: "sermon",
  title: "Grace",
  notes: null,
  status: "idea",
  intendedFormat: "unspecified",
  sermonType: "unspecified",
  subject: null,
  references: [],
  tagIds: [],
  revision: 4,
  createdAt: "2026-10-01T10:00:00.000Z",
  updatedAt: "2026-10-01T10:00:00.000Z",
  lastDevelopedAt: null,
  archivedAt: null,
  hasOutline: false,
  preached: false,
  ...fields,
});

async function keep(...ideas: OfflineIdea[]) {
  const db = await openOfflineDb();
  for (const item of ideas)
    await db.put("accountData", ideaRecord(A, item.id, { server: item, local: null }));
  await writeLocalTags(A, []);
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

const editor = () => (
  <IdeaEditor
    id={id1}
    revision={4}
    initial={{
      kind: "sermon",
      title: "Grace",
      notes: "",
      status: "idea",
      intendedFormat: "unspecified",
      sermonType: "unspecified",
      subject: "",
      references: [],
      tags: [],
    }}
    createdAt={new Date("2026-10-01T10:00:00Z")}
    updatedAt={new Date("2026-10-01T10:00:00Z")}
  />
);

beforeEach(async () => {
  await closeOfflineDb();
  globalThis.indexedDB = new IDBFactory();
  resetOfflineSettingsMemory();
  Object.values(state).forEach((mock) => mock.mockReset());
});
afterEach(() => closeOfflineDb());

describe("the idea editor without the server", () => {
  it("keeps a save on the device when the server gives no answer, and never says it is in the account", async () => {
    state.updateIdea.mockRejectedValue(new TypeError("Failed to fetch"));
    view(editor());
    fireEvent.change(screen.getByRole("textbox", { name: "Idea" }), {
      target: { value: "Grace upon grace" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText(/Saved on this device/)).toBeVisible();

    const [record] = await listMutations(A);
    expect(record).toMatchObject({ type: "idea.update", entityId: id1, baseRevision: 4 });
    expect(shown(await getKeptIdea(A, id1))?.title).toBe("Grace upon grace");

    // The next save goes behind it, not to the server.
    fireEvent.change(screen.getByRole("textbox", { name: "Idea" }), {
      target: { value: "Grace, and grace again" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(async () => expect(await listMutations(A)).toHaveLength(2));
    expect(state.updateIdea).toHaveBeenCalledTimes(1);
  });

  it("waits for changes kept elsewhere to reach the server before it saves over them", async () => {
    await saveIdeaOffline(A, id1, ideaInputSchema.parse({ title: "Edited offline" }), idea(id1));
    view(editor());
    expect(await screen.findByText(/You can edit it again once they are/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });

  it("says nothing was kept where this device keeps no ideas", async () => {
    state.updateIdea.mockRejectedValue(new TypeError("Failed to fetch"));
    view(editor(), null);
    fireEvent.change(screen.getByRole("textbox", { name: "Idea" }), { target: { value: "X" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText(/Check your connection/)).toBeVisible();
    expect(await listMutations(A)).toEqual([]);
  });
});

describe("the offline library", () => {
  it("says the ideas are not here yet rather than showing an empty library", async () => {
    view(<OfflineLibrary account={A} search="" go={vi.fn()} />);
    expect(await screen.findByText("Your ideas are not on this device yet")).toBeVisible();
  });

  it("searches the device's copy, says it is a copy, and says what is missing", async () => {
    await keep(idea(id1, { title: "Grace" }), idea(id2, { title: "Hope", kind: "point" }));
    await writeIdeasState(A, { complete: false, have: 2, total: 5 });
    const go = vi.fn();
    view(<OfflineLibrary account={A} search="?q=grace" go={go} />);
    expect(await screen.findByRole("link", { name: "Grace" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Hope" })).not.toBeInTheDocument();
    expect(screen.getByText(/copy kept on this device/)).toBeVisible();
    expect(screen.getByText(/Only 2 of 5 ideas/)).toBeVisible();
    // No way to manage tags, record preaching, or open an outline without the server.
    expect(screen.queryByRole("button", { name: /Manage tags/ })).not.toBeInTheDocument();
  });

  it("never shows another account's ideas", async () => {
    await keep(idea(id1, { title: "Mine" }));
    await writeIdeasState(A, { complete: true, have: 1, total: 1 });
    view(<OfflineLibrary account="99999999-9999-4999-8999-999999999999" search="" go={vi.fn()} />);
    expect(await screen.findByText("Your ideas are not on this device yet")).toBeVisible();
    expect(screen.queryByText("Mine")).not.toBeInTheDocument();
  });
});

describe("a conflict about an idea", () => {
  it("says what differs and lets the person keep their version or the account's", async () => {
    await keep(idea(id1));
    await saveIdeaOffline(A, id1, ideaInputSchema.parse({ kind: "sermon", title: "Mine" }));
    const [record] = await listMutations(A);
    await settleMutation(A, record.opId, {
      outcome: "conflict",
      conflict: { reason: "stale", server: idea(id1, { title: "Theirs", revision: 5 }) },
    });
    view(<PendingChanges />);
    expect(
      await screen.findByText(/changed in your account after you changed it here/),
    ).toBeVisible();
    expect(screen.getByText(/Different there: title/)).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Use my account's version" }));
    await waitFor(async () => expect(await listMutations(A)).toEqual([]));
    expect(shown(await getKeptIdea(A, id1))?.title).toBe("Theirs");
  });

  it("asks before discarding a change that is only on this device", async () => {
    await enqueue(A, {
      opId: crypto.randomUUID(),
      type: "idea.archive",
      entityType: "idea",
      entityId: id1,
      payload: null,
      baseRevision: 4,
    });
    view(<PendingChanges />);
    fireEvent.click(await screen.findByRole("button", { name: "Discard" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/puts this idea back as your account has it/)).toBeVisible();
    fireEvent.click(within(dialog).getByRole("button", { name: "Discard" }));
    await waitFor(async () => expect(await listMutations(A)).toEqual([]));
  });
});

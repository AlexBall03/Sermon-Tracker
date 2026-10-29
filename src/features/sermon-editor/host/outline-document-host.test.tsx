import "fake-indexeddb/auto";

import type { Editor } from "@tiptap/core";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { documentV4, pointV4, proseV4 } from "@/features/editor-lab/v4/fixtures";
import { resetAccountMemory } from "@/features/offline/account";
import { closeOfflineDb } from "@/features/offline/db";
import { I18nProvider } from "@/i18n/client";
import { listDrafts, writeDraft } from "../persistence/recovery/store";
import type { EditorSession } from "../persistence/session/session";
import {
  fakeBus,
  fakeIdentity,
  fakeLink,
  fakeLocks,
  fakePage,
  fakeServer,
} from "../persistence/session/testing";
import { OutlineDocumentHost } from "./outline-document-host";

/*
 * The production host (A3.1, A3.2) around a real editor session: the real
 * autosave controller and coordinator, the real recovery store
 * (fake-indexeddb), and stand-in Web Locks, channel, page, and server. The
 * workspace is a stand-in that makes a real v4 editor with the host's
 * extensions (the write guard included) and calls back as the workspace does;
 * its pagination needs a real browser, where the end-to-end journeys run it.
 */

const state = vi.hoisted(() => ({
  auth: { isLoaded: true, userId: "clerk-a" as string | null },
  editors: [] as Editor[],
  sessions: [] as EditorSession[],
  replaced: [] as string[],
}));

vi.mock("@clerk/nextjs", () => ({ useAuth: () => state.auth }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: (href: string) => state.replaced.push(href),
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));
vi.mock("@/features/outlines/actions", () => ({
  deleteOutline: vi.fn(async () => ({ ok: true, message: "Outline deleted." })),
}));
vi.mock("../persistence/actions", () => ({ saveOutlineDocument: vi.fn() }));
vi.mock("../persistence/session/session", async (actual) => {
  const real = await actual<typeof import("../persistence/session/session")>();
  return {
    ...real,
    createEditorSession: (options: Parameters<typeof real.createEditorSession>[0]) => {
      const session = real.createEditorSession(options);
      state.sessions.push(session);
      return session;
    },
  };
});
vi.mock("../sermon-workspace", async () => {
  const { Editor } = await import("@tiptap/core");
  const { useEffect, useRef } = await import("react");
  const { labV4Extensions, loadV4 } = await import("@/features/editor-lab/v4/extensions");
  return {
    SermonWorkspace: (props: {
      document: unknown;
      documentKey: string;
      extensions?: never[];
      onReady?: (editor: Editor) => void;
      onRefused?: () => void;
      headerStart?: React.ReactNode;
      headerEnd?: React.ReactNode;
    }) => {
      const host = useRef<HTMLDivElement>(null);
      useEffect(() => {
        const editor = new Editor({
          element: host.current!,
          extensions: [...labV4Extensions({}), ...(props.extensions ?? [])],
        });
        state.editors.push(editor);
        const loaded = loadV4(editor, props.document, props.documentKey);
        if (!loaded.ok) {
          editor.setEditable(false);
          props.onRefused?.();
        } else props.onReady?.(editor);
        return () => editor.destroy();
        // The workspace reads its props once, when it is made.
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return (
        <div data-testid="workspace">
          {props.headerStart}
          {props.headerEnd}
          <div ref={host} />
        </div>
      );
    },
  };
});

const owner = "4f1c2d3e-0000-4000-8000-00000000a11c";
const outlineId = "0b6a3c1e-9d54-4c7e-8a55-1f1f6d3b2a10";
const foreignDraft = "c0ffee00-0000-4000-8000-000000000d01";
const R0 = 8;
const sermon = {
  id: "5d1e2f30-0000-4000-8000-0000000000aa",
  title: "Grace",
  kind: "sermon",
  archivedAt: null,
};
const doc = (words: string) => documentV4([pointV4("p-1", "Grace", 1), proseV4(words, 1)]);

async function drain(rounds = 30) {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setImmediate(resolve));
      await vi.advanceTimersByTimeAsync(0);
    });
  }
}
async function advance(ms: number, step = 250) {
  for (let passed = 0; passed < ms; passed += step) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(Math.min(step, ms - passed));
    });
    await drain(3);
  }
  await drain();
}

function world() {
  return {
    locks: fakeLocks(),
    bus: fakeBus(),
    net: fakeServer(doc("Opened"), R0),
    identity: fakeIdentity("clerk-a"),
    link: fakeLink(),
  };
}
type World = ReturnType<typeof world>;

function host(w: World, name: string, { strict = false } = {}) {
  const page = fakePage();
  const tree = () => (
    <I18nProvider locale="en">
      <OutlineDocumentHost
        owner={owner}
        clerkUserId="clerk-a"
        outlineId={outlineId}
        sermon={sermon}
        sessionOptions={{
          transport: w.net.transport(),
          connectivity: w.link.connectivity,
          locks: w.locks.forTab(name),
          channel: w.bus.factory(name),
          page: page.target,
          releases: new Map(),
        }}
      />
    </I18nProvider>
  );
  const shown = () => (strict ? <StrictMode>{tree()}</StrictMode> : tree());
  const view = render(shown());
  return { view, page, rerender: () => view.rerender(shown()) };
}

const latestEditor = () => state.editors.at(-1)!;
const live = () => state.sessions.filter((session) => session.getState().kind !== "disposed");
function type(editor: Editor, words: string) {
  editor.commands.setContent(doc(words));
}
const text = (editor: Editor) => editor.state.doc.textContent;

beforeEach(async () => {
  await closeOfflineDb();
  globalThis.indexedDB = new IDBFactory();
  resetAccountMemory();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  state.auth = { isLoaded: true, userId: "clerk-a" };
  state.editors = [];
  state.sessions = [];
  state.replaced = [];
});

afterEach(async () => {
  for (const session of state.sessions) void session.dispose();
  await drain();
  vi.useRealTimers();
  await closeOfflineDb();
});

describe("opening (A3.1)", () => {
  it("opens the server's document, and lets it be edited only once the session is active", async () => {
    const w = world();
    host(w, "A");
    expect(screen.getByTestId("outline-opening")).toBeTruthy();
    await drain();
    const editor = latestEditor();
    expect(text(editor)).toContain("Opened");
    expect(state.sessions).toHaveLength(1);
    expect(state.sessions[0].getState().kind).toBe("active");
    expect(editor.isEditable).toBe(true);
    expect(screen.getByTestId("save-status").dataset.label).toBe("unchanged");

    type(editor, "Grace abounds");
    await drain(5);
    expect(screen.getByTestId("save-status").dataset.label).toMatch(/pending|local/);
    await advance(12_000);
    expect(w.net.server.revision).toBe(R0 + 1);
    expect(screen.getByTestId("save-status").dataset.label).toBe("saved");
    // One server save for the edit, not one per keystroke.
    expect(w.net.sent).toHaveLength(1);
  });

  it("refuses every change before the session is active: the write guard, not the view", async () => {
    const w = world();
    w.net.answerReads({ kind: "failed" });
    host(w, "A");
    await drain();
    // Never verified: no editor is mounted at all, and nothing is sent.
    expect(state.editors).toHaveLength(0);
    expect(screen.getByTestId("outline-failed")).toBeTruthy();
    expect(w.net.sent).toHaveLength(0);

    w.net.answerReads(null);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Try again" })));
    await drain();
    const editor = latestEditor();
    // The guard refuses a change whenever the session may not edit.
    const session = state.sessions[0];
    expect(session.canEdit()).toBe(true);
    await act(async () => {
      await session.dispose();
    });
    const before = text(editor);
    editor.view.dispatch(editor.state.tr.insertText("Sneaked in", 1));
    expect(text(editor)).toBe(before);
  });

  it("makes one session under Strict Mode, and only after the last one has ended", async () => {
    const w = world();
    host(w, "A", { strict: true });
    await drain();
    expect(live()).toHaveLength(1);
    expect(live()[0].canEdit()).toBe(true);
    // A session made by Strict Mode's first pass ended before the next began.
    for (const session of state.sessions.slice(0, -1)) {
      expect(session.getState().kind).toBe("disposed");
    }
  });

  it("waits for Clerk, and opens nothing for another account than the page's", async () => {
    const w = world();
    state.auth = { isLoaded: false, userId: null };
    const first = host(w, "A");
    await drain();
    expect(state.sessions).toHaveLength(0);
    state.auth = { isLoaded: true, userId: "clerk-b" };
    first.rerender();
    await drain();
    expect(state.sessions).toHaveLength(0);
    expect(screen.getByText("You're signed in as someone else")).toBeTruthy();
  });

  it("ends editing when Clerk's account changes, keeping the words on the device", async () => {
    const w = world();
    // Saves held: the words are on the device only, as when the server is slow.
    w.net.hold();
    const tab = host(w, "A");
    await drain();
    type(latestEditor(), "Mine");
    await advance(2_500);
    state.auth = { isLoaded: true, userId: "clerk-b" };
    tab.rerender();
    await drain();
    expect(state.sessions[0].canEdit()).toBe(false);
    expect(screen.queryByTestId("workspace")).toBeNull();
    expect(screen.getByText("You're signed in as someone else")).toBeTruthy();
    const drafts = await listDrafts(owner, outlineId);
    expect(JSON.stringify(drafts).includes("Mine")).toBe(true);
  });

  it("disposes its session when unmounted, so another tab may then edit", async () => {
    const w = world();
    const a = host(w, "A");
    await drain();
    a.view.unmount();
    await drain();
    expect(state.sessions[0].getState().kind).toBe("disposed");
    host(w, "B");
    await drain();
    expect(state.sessions[1].canEdit()).toBe(true);
  });

  it("shows an unreadable document as such, offering no save over it", async () => {
    const w = world();
    w.net.answerReads({ kind: "unreadable", revision: R0 });
    host(w, "A");
    await drain();
    expect(screen.getByTestId("outline-unreadable")).toBeTruthy();
    expect(state.editors).toHaveLength(0);
    expect(w.net.sent).toHaveLength(0);
  });
});

describe("tabs (A3.2)", () => {
  it("shows a second tab read only, and hands over only when asked", async () => {
    const w = world();
    host(w, "A");
    await drain();
    const editorA = latestEditor();
    type(editorA, "From A");
    await advance(500);

    const b = host(w, "B");
    await drain();
    const panel = within(b.view.container).getByTestId("outline-read-only");
    expect(state.sessions[1].canEdit()).toBe(false);
    // Nothing happens by itself.
    await advance(30_000);
    expect(state.sessions[1].canEdit()).toBe(false);
    expect(state.sessions[0].canEdit()).toBe(true);

    await act(async () => fireEvent.click(within(panel).getByTestId("edit-here")));
    await advance(3_000);
    // A saved what it had before letting go; B opened what the server then held.
    expect(w.net.server.revision).toBe(R0 + 1);
    const editorB = latestEditor();
    expect(editorB).not.toBe(editorA);
    expect(text(editorB)).toContain("From A");
    const editing = live().filter((session) => session.canEdit());
    expect(editing).toHaveLength(1);
    // A came back read only, with a new session of its own.
    expect(state.sessions.length).toBe(3);
    expect(state.sessions[2].getState().kind).toBe("read_only");
  });
});

describe("recovery (A3.2)", () => {
  it("shows unsaved work beside the server's, and restores it only when asked", async () => {
    const w = world();
    await writeDraft(owner, {
      outlineId,
      draftId: foreignDraft,
      content: doc("Kept from a closed tab"),
      sequence: 3,
      baseRevision: R0,
    });
    host(w, "A");
    await drain();
    expect(screen.getByTestId("recovery-view")).toBeTruthy();
    expect(state.editors.filter((editor) => !editor.isDestroyed)).toHaveLength(0);
    await advance(30_000);
    // Never restored, discarded, or sent by itself.
    expect(screen.getByTestId("recovery-view")).toBeTruthy();
    expect(w.net.sent).toHaveLength(0);
    expect(await listDrafts(owner, outlineId)).toHaveLength(1);

    const recovered = screen.getByTestId("recovery-preview-recovered");
    expect(recovered.textContent).toContain("Kept from a closed tab");
    await act(async () => fireEvent.click(screen.getByLabelText("Saved on the server")));
    expect(screen.getByTestId("recovery-preview-server").textContent).toContain("Opened");

    await act(async () => fireEvent.click(screen.getByTestId("recovery-restore")));
    await drain();
    const editor = latestEditor();
    expect(text(editor)).toContain("Kept from a closed tab");
    expect(screen.getByTestId("save-status").dataset.label).toMatch(/local|saving/);
    await advance(12_000);
    expect(screen.getByTestId("save-status").dataset.label).toBe("saved");
    expect(JSON.stringify(w.net.server.content)).toContain("Kept from a closed tab");
  });

  it("discards only after the person confirms", async () => {
    const w = world();
    await writeDraft(owner, {
      outlineId,
      draftId: foreignDraft,
      content: doc("Throw me away"),
      sequence: 3,
      baseRevision: R0,
    });
    host(w, "A");
    await drain();
    await act(async () => fireEvent.click(screen.getByTestId("recovery-discard")));
    // Asked first: nothing gone yet.
    expect(await listDrafts(owner, outlineId)).toHaveLength(1);
    const dialog = screen.getByRole("alertdialog");
    await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: "Discard" })));
    await drain();
    expect(await listDrafts(owner, outlineId)).toHaveLength(0);
    expect(text(latestEditor())).toContain("Opened");
  });

  it("lists every independent unit, and keeps Restore for when only one is left", async () => {
    const w = world();
    await writeDraft(owner, {
      outlineId,
      draftId: foreignDraft,
      content: doc("First tab's work"),
      sequence: 3,
      baseRevision: R0,
    });
    await writeDraft(owner, {
      outlineId,
      draftId: "c0ffee00-0000-4000-8000-000000000d02",
      content: doc("Second tab's work"),
      sequence: 2,
      baseRevision: R0,
    });
    host(w, "A");
    await drain();
    expect(screen.getAllByTestId("recovery-unit")).toHaveLength(2);
    expect((screen.getByTestId("recovery-restore") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Discard the other work found first/)).toBeTruthy();
  });

  it("a page opened again while a save is in flight never takes that save over", async () => {
    const w = world();
    w.net.hold();
    const releases = new Map();
    const first = render(
      <I18nProvider locale="en">
        <OutlineDocumentHost
          owner={owner}
          clerkUserId="clerk-a"
          outlineId={outlineId}
          sermon={sermon}
          sessionOptions={{
            transport: w.net.transport(),
            connectivity: w.link.connectivity,
            locks: w.locks.forTab("A"),
            channel: w.bus.factory("A"),
            page: fakePage().target,
            releases,
          }}
        />
      </I18nProvider>,
    );
    await drain();
    type(latestEditor(), "Late words");
    await advance(2_500);
    expect(w.net.attempts).toHaveLength(1);
    // Away and back in the same tab, with the save still unanswered.
    first.unmount();
    await drain();
    host(w, "A");
    await drain();
    // The new session sees its own copy on the device, never the old claim.
    expect(screen.getByTestId("recovery-view")).toBeTruthy();
    expect(w.net.sent).toHaveLength(1);

    // The old request lands late: it was the old session's, and nothing is sent again.
    await act(async () => {
      const attempt = w.net.attempts[0];
      attempt.respond(attempt.commit());
    });
    await advance(30_000);
    expect(w.net.sent).toHaveLength(1);
    expect(w.net.server.revision).toBe(R0 + 1);
    expect(JSON.stringify(w.net.server.content)).toContain("Late words");
  });

  it("after a conflict, Review opens a new session only once the old one has ended", async () => {
    const w = world();
    host(w, "A");
    await drain();
    type(latestEditor(), "Mine, offline-ish");
    w.net.external(doc("Theirs, from another device"));
    await advance(12_000);
    expect(screen.getByTestId("save-status").dataset.label).toBe("conflict");
    const sent = w.net.sent.length;

    await act(async () => fireEvent.click(screen.getByTestId("save-action")));
    await drain();
    expect(state.sessions[0].getState().kind).toBe("disposed");
    // The new session read the server and the device itself, and sent nothing of the old one's.
    expect(screen.getByTestId("recovery-view")).toBeTruthy();
    expect(w.net.sent.length).toBe(sent);
    await act(async () => fireEvent.click(screen.getByLabelText("Saved on the server")));
    expect(screen.getByTestId("recovery-preview-server").textContent).toContain("Theirs");
    expect(w.net.server.revision).toBe(R0 + 1);
  });
});

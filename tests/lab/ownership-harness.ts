import type { JSONContent } from "@tiptap/core";

import { documentV4, pointV4, proseV4 } from "@/features/editor-lab/v4/fixtures";
import { serverSaveStatus } from "@/features/sermon-editor/persistence/autosave/model";
import type { DocumentTransport } from "@/features/sermon-editor/persistence/autosave/transport";
import { canonicalDocument } from "@/features/sermon-editor/persistence/canonical";
import { listDrafts } from "@/features/sermon-editor/persistence/recovery/store";
import {
  createEditorSession,
  type EditorSession,
} from "@/features/sermon-editor/persistence/session/session";

/*
 * The editor-session harness for editor-ownership.spec.ts (A2.3B.3): the
 * real session modules, bundled by the test with esbuild and served on a
 * local origin, using the browser's own Web Locks, BroadcastChannel,
 * IndexedDB, and page events. The "server" is the test's own HTTP handler,
 * which writes only at the revision a save names. No application route, no
 * database, no editor (a stand-in source holds the document). Test code only.
 */

const doc = (words: string) => documentV4([pointV4("p-1", "Grace", 1), proseV4(words, 1)]);

const transport: DocumentTransport = {
  async save(request) {
    try {
      const response = await fetch("/save", { method: "POST", body: JSON.stringify(request) });
      return await response.json();
    } catch {
      return { kind: "failed", sequence: request.sequence, uncertain: true };
    }
  },
  async read() {
    try {
      return await (await fetch("/read", { cache: "no-store" })).json();
    } catch {
      return { kind: "failed" };
    }
  },
};

const log: string[] = [];
window.addEventListener("pageshow", (event) => log.push(`pageshow:${event.persisted}`));
window.addEventListener("pagehide", (event) => log.push(`pagehide:${event.persisted}`));

let session: EditorSession | null = null;
let current: JSONContent | null = null;
let change: (() => void) | null = null;

const harness = {
  log,
  canonical(words: string) {
    const result = canonicalDocument(doc(words));
    return result.ok ? result.content : null;
  },
  open(owner: string, outlineId: string) {
    session = createEditorSession({
      owner,
      outlineId,
      identity: { current: () => "clerk-a", subscribe: () => () => {} },
      transport,
    });
    session.subscribe((state) => log.push(`state:${state.kind}`));
  },
  kind: () => session?.getState().kind ?? "none",
  revision() {
    const state = session?.getState();
    return state && "base" in state ? state.base.revision : null;
  },
  takeoverState() {
    const state = session?.getState();
    return state?.kind === "read_only" ? state.takeover : null;
  },
  attach() {
    const state = session?.getState();
    if (!session || state?.kind !== "ready") return false;
    current = state.base.content;
    return session.attach({
      subscribe(onChange) {
        change = onChange;
        return () => {
          change = null;
        };
      },
      read: () => JSON.parse(JSON.stringify(current)) as JSONContent,
    }).ok;
  },
  edit(words: string) {
    if (!session?.canEdit()) return false;
    current = doc(words);
    change?.();
    return true;
  },
  canEdit: () => session?.canEdit() ?? false,
  takeover: () => session?.requestTakeover(),
  recheck: () => session?.recheck(),
  status() {
    const autosave = session?.getAutosave();
    return autosave
      ? serverSaveStatus(autosave.controller.getState(), autosave.coordinator.getState())
      : null;
  },
  async drafts(owner: string, outlineId: string) {
    return (await listDrafts(owner, outlineId)).map((draft) => draft.status);
  },
  dispose: () => session?.dispose(),
};

(window as unknown as { harness: typeof harness }).harness = harness;

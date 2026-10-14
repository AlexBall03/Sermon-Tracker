"use client";

import { useCallback } from "react";

import type { IdeaInput } from "@/features/ideas/schemas";
import type { OfflineIdea } from "@/features/sync/ideas";
import { useT } from "@/i18n/client";
import type { ActionResult } from "@/lib/action-result";
import { holdUnsavedWork, releaseUnsavedWork } from "@/lib/unsaved-work";
import { useOfflineAccount } from "../components/offline-account";
import { useOfflineSettings } from "../settings";
import {
  archiveIdeaOffline,
  deleteIdeaOffline,
  restoreIdeaOffline,
  saveIdeaOffline,
  type OfflineChange,
} from "./operations";

export type KeepKind = "update" | "archive" | "restore" | "delete";

/** What keeping a change on the device reports: a result as an action's, and the queued change. */
export type KeptResult = ActionResult & { reason?: "preached"; opId?: string };

/**
 * Keeps a change to an idea on this device, for the sync engine to send
 * (Phase 5D.1): the editor's way when the server gives no answer, and its
 * only way on the offline page. Null where nothing may be kept: no account
 * known here, or this device was told not to keep ideas. A result that is
 * `ok` says the change is on the device, never that it is in the account.
 */
export function useKeepIdea() {
  const account = useOfflineAccount();
  const { ideasOffline } = useOfflineSettings();
  const t = useT("ideas");

  const keep = useCallback(
    async (
      kind: KeepKind,
      id: string,
      base: OfflineIdea,
      input?: IdeaInput,
    ): Promise<KeptResult> => {
      if (!account) return { ok: false, message: t.editor.offline };
      // Only for the moment it takes to write: once written, it is durable.
      const writing = {};
      holdUnsavedWork(writing);
      let outcome: OfflineChange;
      try {
        outcome =
          kind === "update" && input
            ? await saveIdeaOffline(account, id, input, base)
            : kind === "archive"
              ? await archiveIdeaOffline(account, id, base)
              : kind === "restore"
                ? await restoreIdeaOffline(account, id, base)
                : await deleteIdeaOffline(account, id, base);
      } catch {
        return { ok: false, message: t.editor.notKept };
      } finally {
        releaseUnsavedWork(writing);
      }
      if (outcome.status === "preached") {
        return { ok: false, message: t.actions.hasHistory, reason: "preached" };
      }
      if (outcome.status === "missing") return { ok: false, message: t.actions.missing };
      return { ok: true, message: t.editor.kept[kind], opId: outcome.record.opId };
    },
    [account, t],
  );

  return account && ideasOffline ? keep : null;
}

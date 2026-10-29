import {
  autosaveStatus,
  serverSaveStatus,
  type AutosaveState,
  type NetworkState,
  type ServerSaveStatus,
} from "../persistence/autosave/model";
import { holdsUnsavedWork } from "../persistence/session/model";

/*
 * What the save indicator says (A3), from the controller's and the
 * coordinator's own states through `serverSaveStatus`, and nothing else.
 * "Saved" is said only when that says `saved`: the server confirmed exactly
 * the current content. Nothing here sends, retries, or reads by itself; an
 * action is offered for the person to press.
 */

export type SaveLabel =
  | "unchanged"
  | "pending"
  | "local"
  | "saving"
  | "saved"
  | "offline"
  | "unresolved"
  | "failed"
  | "stalled"
  | "conflict"
  | "unauthorized"
  | "tooLarge"
  | "unprotected"
  | "refused";

export type SaveTone = "quiet" | "busy" | "good" | "attention" | "danger";

/**
 * What the person can do about it. `recover`: a new cycle after the retries
 * ran out (`coordinator.recover()`). `retry`: a definite failure with no
 * automatic retry left (`coordinator.retry()`). `retryLocal`: write the draft
 * again after the device refused it (`controller.retry()`). `review`: end
 * this session and open a new one, which checks the server and the device
 * afresh (a conflict). `signIn`: the session ended on the server.
 */
export type SaveAction = "recover" | "retry" | "retryLocal" | "review" | "signIn";

export type SaveView = {
  status: ServerSaveStatus;
  label: SaveLabel;
  tone: SaveTone;
  action: SaveAction | null;
  /**
   * Leaving now could lose words: they are not yet kept on this device
   * (`pending`), or the device refused them (`unprotected`). Guards in-app
   * navigation and unloading alike; disposal's last flush is never counted on.
   */
  guardLeaving: boolean;
  /** Not yet safe to replace the application (`holdUnsavedWork`): anything not on the server or this device. */
  holdsWork: boolean;
};

const tooLarge = (local: AutosaveState, network: NetworkState) =>
  local.refusal?.reason === "too_large" ||
  (network.outcome?.kind === "refused" && network.outcome.code === "too_large") ||
  local.refusalRecord?.code === "too_large";

function labelOf(
  status: ServerSaveStatus,
  local: AutosaveState,
  network: NetworkState,
): Pick<SaveView, "label" | "tone" | "action"> | null {
  if (status === "disposed") return null;
  // What the device holds comes first: a label that says "kept on this device" is said only
  // once it is, whatever the server's side is doing (offline, a conflict, a refusal).
  const device = autosaveStatus(local);
  if (device === "unprotected") {
    return {
      label: "unprotected",
      tone: "danger",
      action: local.storageError ? "retryLocal" : null,
    };
  }
  const claimsKept = status === "offline" || status === "blocked" || status === "waiting";
  if (claimsKept && device === "pending") return { label: "pending", tone: "busy", action: null };
  switch (status) {
    case "saved":
      return { label: "saved", tone: "good", action: null };
    case "unchanged":
      return { label: "unchanged", tone: "quiet", action: null };
    case "pending":
      return { label: "pending", tone: "busy", action: null };
    case "local":
      return { label: "local", tone: "quiet", action: null };
    case "saving":
      return { label: "saving", tone: "busy", action: null };
    case "waiting":
      // A save is scheduled (the pause after typing), and the words are on the device.
      return { label: "local", tone: "quiet", action: null };
    case "offline":
      return { label: "offline", tone: "attention", action: null };
    case "unresolved":
      return { label: "unresolved", tone: "busy", action: null };
    case "failed":
      // Retried by itself within its budget; once nothing more is scheduled, the person may.
      return { label: "failed", tone: "attention", action: network.recovery ? null : "retry" };
    case "stalled":
      return { label: "stalled", tone: "attention", action: "recover" };
    case "attention":
      return { label: "tooLarge", tone: "attention", action: null };
    case "unprotected":
      return {
        label: "unprotected",
        tone: "danger",
        action: local.storageError ? "retryLocal" : null,
      };
    case "blocked": {
      const reason = network.block?.reason;
      if (reason === "unauthorized")
        return { label: "unauthorized", tone: "danger", action: "signIn" };
      if (reason === "conflict" || reason === "unexpected_revision") {
        return { label: "conflict", tone: "danger", action: "review" };
      }
      if (tooLarge(local, network)) return { label: "tooLarge", tone: "attention", action: null };
      return { label: "refused", tone: "danger", action: "review" };
    }
  }
}

/** The indicator's view of a session's autosave, or null when there is nothing to say (disposed). */
export function describeSave(local: AutosaveState, network: NetworkState): SaveView | null {
  const status = serverSaveStatus(local, network);
  const view = labelOf(status, local, network);
  if (!view) return null;
  return {
    status,
    ...view,
    // From the device's own state: words not yet written there, whatever the server is doing.
    guardLeaving: autosaveStatus(local) === "pending" || autosaveStatus(local) === "unprotected",
    holdsWork: holdsUnsavedWork(status),
  };
}

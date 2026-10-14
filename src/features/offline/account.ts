import { isTranslationId, type TranslationId } from "@/features/scripture/translations";
import { openOfflineDb } from "./db";

/*
 * Who last used the application on this device, and what they were allowed
 * to read. The signed-in shell records both on each visit; the sign-in pages
 * forget the account (signing out, or a session that ended). Forgetting it
 * deletes nothing: an account's queued work stays on the device, under its
 * owner, until it is sent or that person deletes it.
 *
 * The offline page uses this, and nothing else, to know whose work to show
 * when the server cannot be asked. It is a convenience, never permission:
 * every change is checked by the server when it is sent.
 */

const activeKey = "activeAccount";
const permittedKey = "permittedTranslations";

type Listener = (account: string | null) => void;
const listeners = new Set<Listener>();
let known: string | null | undefined;

/** Called whenever the active account changes, so state held in memory for the last one is dropped. */
export function onAccountChange(listener: Listener) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

function announce(account: string | null) {
  if (known === account) return;
  known = account;
  listeners.forEach((listener) => listener(account));
}

export async function getActiveAccount(): Promise<string | null> {
  const db = await openOfflineDb();
  const value = await db.get("meta", activeKey);
  const account = typeof value === "string" && value ? value : null;
  announce(account);
  return account;
}

/** Records the signed-in account: its application user ID, never a name or an address. */
export async function setActiveAccount(id: string) {
  const db = await openOfflineDb();
  await db.put("meta", id, activeKey);
  announce(id);
}

/** Forgets who was signed in, and nothing else. */
export async function clearActiveAccount() {
  const db = await openOfflineDb();
  await db.delete("meta", activeKey);
  announce(null);
}

/** The translations last on offer to this device (the administrator's switch applied). */
export async function getPermittedTranslations(): Promise<TranslationId[]> {
  const db = await openOfflineDb();
  const value = await db.get("meta", permittedKey);
  return Array.isArray(value) ? value.filter(isTranslationId) : [];
}

export async function setPermittedTranslations(ids: readonly TranslationId[]) {
  const db = await openOfflineDb();
  await db.put("meta", [...ids], permittedKey);
}

/** For tests. */
export function resetAccountMemory() {
  known = undefined;
  listeners.clear();
}

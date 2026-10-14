/**
 * Whether the dashboard's install notice is still owed in this browser. It is
 * a preference of this browser, kept in `localStorage`: installing is done per
 * device, so dismissing it on one leaves it on another. `installed` is written
 * when the application was installed from this browser, which a tab cannot
 * otherwise tell once the moment has passed.
 */
export const installNoticeKey = "install-notice";

export type InstallNoticeAnswer = "dismissed" | "installed";

/** What this browser answered, or null while the notice is still owed. */
export function readInstallNotice(): InstallNoticeAnswer | null {
  try {
    const value = window.localStorage.getItem(installNoticeKey);
    return value === "dismissed" || value === "installed" ? value : null;
  } catch {
    return null;
  }
}

const listeners = new Set<() => void>();

/** Remembers the answer. */
export function storeInstallNotice(answer: InstallNoticeAnswer) {
  try {
    window.localStorage.setItem(installNoticeKey, answer);
  } catch {
    // Private browsing, or storage refused: the answer lasts for this page.
    remembered = answer;
  }
  listeners.forEach((notify) => notify());
}

// Where storage refuses, the answer is kept here for the page's life.
let remembered: InstallNoticeAnswer | null = null;

/** The stored answer, or one kept for this page where storage refused it. */
export function installNoticeAnswer(): InstallNoticeAnswer | null {
  return readInstallNotice() ?? remembered;
}

/** For `useSyncExternalStore`: this tab's changes, and another tab's. */
export function subscribeInstallNotice(notify: () => void) {
  listeners.add(notify);
  window.addEventListener("storage", notify);
  return () => {
    listeners.delete(notify);
    window.removeEventListener("storage", notify);
  };
}

/** For tests: forget the answer kept for this page. */
export function resetInstallNoticeForTests() {
  remembered = null;
}

/*
 * Whether anything in this tab would be lost if the page were reloaded now:
 * edits not yet saved, or a save still on its way. Whatever holds such work
 * says so here while it does, and lets go when it is safe again.
 *
 * It is asked before something reloads the page on purpose, which today is
 * only taking an update of the application (features/pwa). It is not the
 * leave guard: that asks the person; this only answers a question. No React,
 * so the outline store can hold work after its page is gone.
 */

const holders = new Set<unknown>();

/** Marks work held by `key` as at risk. Holding twice is holding once. */
export function holdUnsavedWork(key: unknown) {
  holders.add(key);
}

/** Lets go of what `key` held. Letting go of nothing is no error. */
export function releaseUnsavedWork(key: unknown) {
  holders.delete(key);
}

/** True while anything in this tab would be lost by a reload. */
export function hasUnsavedWork() {
  return holders.size > 0;
}

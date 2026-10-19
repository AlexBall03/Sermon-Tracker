import type { Editor } from "@tiptap/core";

import { jsonBytes } from "./load";

/*
 * Local instrumentation for the lab (PS-1A item 10). It sends nothing: it
 * counts how often a coalesced save would fire, and how much it would send,
 * if the document were saved 900 ms after the last change, as the outline
 * editor saves its words today (`createOutlineStore`, delay 900).
 */

export const coalesceMs = 900;

export type SaveMeter = {
  /** Called on every change of the document. */
  changed(editor: Editor): void;
  /** Would-be saves so far, and the bytes they would have sent. */
  readonly saves: number;
  readonly bytes: number;
  /** When the editor was ready, after the page began loading. */
  readonly readyMs: number | null;
  ready(ms: number): void;
  reset(): void;
  dispose(): void;
};

export function createSaveMeter(delay = coalesceMs): SaveMeter {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let saves = 0;
  let bytes = 0;
  let readyAt: number | null = null;
  return {
    changed(editor) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        if (editor.isDestroyed) return;
        saves += 1;
        bytes += jsonBytes(editor.getJSON());
      }, delay);
    },
    get saves() {
      return saves;
    },
    get bytes() {
      return bytes;
    },
    get readyMs() {
      return readyAt;
    },
    ready(ms) {
      readyAt = ms;
    },
    reset() {
      saves = 0;
      bytes = 0;
    },
    dispose() {
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}

/** The mean time of `run` over `times` runs, in milliseconds. */
export function timeIt(run: () => void, times = 5): number {
  const started = performance.now();
  for (let index = 0; index < times; index += 1) run();
  return (performance.now() - started) / times;
}

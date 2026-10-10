"use client";

import { useCallback, useEffect, useState } from "react";

// Chapters already read in this tab. The text never changes, so they are kept
// for the life of the page; only what has been opened is ever held.
const loaded = new Map<string, string[]>();
const pending = new Map<string, Promise<string[]>>();

const keyOf = (book: number, chapter: number) => `${book}.${chapter}`;

/** Fetches one chapter of the King James Bible, once. */
export function loadChapter(book: number, chapter: number): Promise<string[]> {
  const key = keyOf(book, chapter);
  const ready = loaded.get(key);
  if (ready) return Promise.resolve(ready);

  let request = pending.get(key);
  if (!request) {
    request = fetch(`/api/bible/${book}/${chapter}`, { headers: { Accept: "application/json" } })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Chapter request failed: ${response.status}`);
        const body = (await response.json()) as { verses: string[] };
        loaded.set(key, body.verses);
        return body.verses;
      })
      .finally(() => pending.delete(key));
    pending.set(key, request);
  }
  return request;
}

export type ChapterState =
  | { status: "loading" }
  | { status: "ready"; verses: string[] }
  | { status: "error"; retry: () => void };

/** A chapter's verses for display: index 0 is verse 1. */
export function useChapter(book: number, chapter: number): ChapterState {
  const key = keyOf(book, chapter);
  const [settled, setSettled] = useState<{ key: string; failed: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (loaded.has(key)) return;
    let current = true;
    loadChapter(book, chapter).then(
      () => current && setSettled({ key, failed: false }),
      () => current && setSettled({ key, failed: true }),
    );
    return () => {
      current = false;
    };
  }, [book, chapter, key, attempt]);

  const retry = useCallback(() => {
    setSettled(null);
    setAttempt((count) => count + 1);
  }, []);

  const verses = loaded.get(key);
  if (verses) return { status: "ready", verses };
  if (settled?.key === key && settled.failed) return { status: "error", retry };
  return { status: "loading" };
}

/** For tests: forget every chapter read so far. */
export function clearChapterCache() {
  loaded.clear();
  pending.clear();
}

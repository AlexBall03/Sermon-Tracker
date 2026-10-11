"use client";

import { useCallback, useEffect, useState } from "react";

/** One chapter as it is read: its verses, and the title above them where it has one. */
export type ChapterText = {
  /** Index 0 is verse 1. */
  verses: string[];
  /** A psalm's title. It is no part of any verse. */
  title: string | null;
};

// Chapters already read in this tab. The text never changes, so they are kept
// for the life of the page; only what has been opened is ever held.
const loaded = new Map<string, ChapterText>();
const pending = new Map<string, Promise<ChapterText>>();

const keyOf = (book: number, chapter: number) => `${book}.${chapter}`;

/** Fetches one chapter of the King James Bible, once. */
export function loadChapter(book: number, chapter: number): Promise<ChapterText> {
  const key = keyOf(book, chapter);
  const ready = loaded.get(key);
  if (ready) return Promise.resolve(ready);

  let request = pending.get(key);
  if (!request) {
    request = fetch(`/api/bible/${book}/${chapter}`, { headers: { Accept: "application/json" } })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Chapter request failed: ${response.status}`);
        const body = (await response.json()) as { verses: string[]; title?: string | null };
        const text = { verses: body.verses, title: body.title ?? null };
        loaded.set(key, text);
        return text;
      })
      .finally(() => pending.delete(key));
    pending.set(key, request);
  }
  return request;
}

/** Keeps a chapter that arrived another way (with the page), so it is not fetched again. */
export function keepChapter(book: number, chapter: number, text: ChapterText) {
  const key = keyOf(book, chapter);
  if (!loaded.has(key)) loaded.set(key, text);
}

export type ChapterState =
  | { status: "loading" }
  | { status: "ready"; verses: string[]; title: string | null }
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

  const text = loaded.get(key);
  if (text) return { status: "ready", verses: text.verses, title: text.title };
  if (settled?.key === key && settled.failed) return { status: "error", retry };
  return { status: "loading" };
}

/** For tests: forget every chapter read so far. */
export function clearChapterCache() {
  loaded.clear();
  pending.clear();
}

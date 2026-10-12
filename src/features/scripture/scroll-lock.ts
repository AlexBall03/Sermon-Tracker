import { glideTo } from "./glide";

/**
 * Whether the two panes of a comparison in the Bible reader scroll together.
 * It is a preference of this browser, kept in `localStorage`, as the reader's
 * sidebar is, and is no part of the address. Unless it was asked for, each
 * pane scrolls by itself.
 */
export const scrollLockKey = "bible-scroll-lock";

const listeners = new Set<() => void>();

/** False unless this browser locked the panes together. */
export function readScrollLocked(): boolean {
  try {
    return window.localStorage.getItem(scrollLockKey) === "locked";
  } catch {
    return false;
  }
}

/** Remembers the choice. */
export function storeScrollLocked(locked: boolean) {
  try {
    window.localStorage.setItem(scrollLockKey, locked ? "locked" : "free");
  } catch {
    // Private browsing, or storage refused: the choice lasts for this page.
  }
  listeners.forEach((notify) => notify());
}

/** For `useSyncExternalStore`: this tab's changes, and another tab's. */
export function subscribeScrollLock(notify: () => void) {
  listeners.add(notify);
  window.addEventListener("storage", notify);
  return () => {
    listeners.delete(notify);
    window.removeEventListener("storage", notify);
  };
}

/**
 * Places that match in two panes: how far the first is scrolled, and how far
 * the second is when it shows the same thing at its head. In order, from the
 * top of both to the foot of both.
 */
export type Anchors = readonly (readonly [number, number])[];

/**
 * The anchors of two panes on one chapter: their tops, each verse both have
 * (where it can be brought to the head of both), and their feet. `tops` is
 * how far a pane is scrolled when a verse is at its head, by verse number;
 * `limit` is as far as it scrolls. A verse out of order in either is left out,
 * so the anchors only ever go down the page.
 */
export function verseAnchors(
  topsA: ReadonlyMap<number, number>,
  topsB: ReadonlyMap<number, number>,
  limitA: number,
  limitB: number,
): Anchors {
  const anchors: [number, number][] = [[0, 0]];
  let [lastA, lastB] = [0, 0];
  for (const verse of [...topsA.keys()].sort((one, other) => one - other)) {
    const a = topsA.get(verse)!;
    const b = topsB.get(verse);
    if (b === undefined || a <= lastA || b <= lastB || a >= limitA || b >= limitB) continue;
    anchors.push([a, b]);
    [lastA, lastB] = [a, b];
  }
  if (limitA > lastA && limitB >= lastB) anchors.push([limitA, limitB]);
  return anchors;
}

/** The same anchors, read from the second pane to the first. */
export function invert(anchors: Anchors): Anchors {
  return anchors.map(([a, b]) => [b, a] as const);
}

/**
 * Where the second pane belongs when the first is scrolled to `top`: between
 * two anchors, as far between its own two as the first is between its own.
 */
export function mapScroll(anchors: Anchors, top: number): number {
  if (anchors.length === 0) return 0;
  const [firstA, firstB] = anchors[0];
  if (top <= firstA) return firstB;
  for (let index = 1; index < anchors.length; index++) {
    const [a, b] = anchors[index];
    if (top > a) continue;
    const [beforeA, beforeB] = anchors[index - 1];
    if (a === beforeA) return beforeB;
    return beforeB + ((top - beforeA) / (a - beforeA)) * (b - beforeB);
  }
  return anchors[anchors.length - 1][1];
}

/** The first putting in line of two panes, when they are locked or one of them is new. */
export type Alignment = {
  /** The pane that is moved; the other stays where it is. */
  follower: HTMLElement;
  /** Seen to travel there, when the reader asked for the lock; at once, when a pane was replaced. */
  glide: boolean;
  /** Only a pane still at its head is moved: one that has gone to a verse of its own leads instead. */
  atHead?: boolean;
};

// Long enough to outlast the scroll events a pane sends after being moved, and
// short enough that the reader's hand moving to the other pane is not ignored.
const leadFor = 150;

const limitOf = (pane: HTMLElement) => Math.max(0, pane.scrollHeight - pane.clientHeight);

/** How far a pane is scrolled when each of its verses is at its head. */
function verseTops(pane: HTMLElement): Map<number, number> {
  const tops = new Map<number, number>();
  const edge = pane.getBoundingClientRect().top - pane.scrollTop;
  for (const row of pane.querySelectorAll<HTMLElement>("[data-verse]")) {
    const verse = Number(row.dataset.verse);
    if (verse && !tops.has(verse)) tops.set(verse, row.getBoundingClientRect().top - edge);
  }
  return tops;
}

/**
 * Makes two panes scroll as one until the function it returns is called.
 *
 * On the same chapter they are kept verse to verse: the verse at the head of
 * one is at the head of the other, however much longer one text runs, and
 * they reach their tops and feet together. On different chapters there is no
 * verse to match, so they keep the distance they had and move by the same
 * amount, each stopping at its own end.
 *
 * Whichever pane is being scrolled leads and the other is put where it
 * belongs. Being put there makes the other report a scroll of its own, which
 * must not be answered or the two would chase each other; so while one leads,
 * and for a moment after, what the other reports is ignored.
 *
 * The function returned stops it, and answers with an alignment that was
 * asked for and never finished, so whoever binds the panes again can ask again.
 */
export function lockScrolling(
  first: HTMLElement,
  second: HTMLElement,
  { sameChapter, align }: { sameChapter: boolean; align?: Alignment | null },
): () => Alignment | null {
  let leader: HTMLElement | null = null;
  let release: ReturnType<typeof setTimeout> | undefined;
  // Where each pane was when it was last heard from, so the distance between them
  // can be taken as it stood before the scroll that is being answered.
  const last = new Map([
    [first, first.scrollTop],
    [second, second.scrollTop],
  ]);
  let offset = second.scrollTop - first.scrollTop;
  let anchors: Anchors | null = null;
  let owed = sameChapter ? (align ?? null) : null;
  let gliding: HTMLElement | null = null;
  let stopGlide = () => {};

  const other = (pane: HTMLElement) => (pane === first ? second : first);
  const measured = () =>
    (anchors ??= verseAnchors(
      verseTops(first),
      verseTops(second),
      limitOf(first),
      limitOf(second),
    ));
  const lead = (pane: HTMLElement) => {
    leader = pane;
    clearTimeout(release);
    release = setTimeout(() => (leader = null), leadFor);
  };
  /** Where `from`'s neighbor belongs, given where `from` is. */
  const place = (from: HTMLElement) => {
    if (sameChapter) {
      return mapScroll(from === first ? measured() : invert(measured()), from.scrollTop);
    }
    const moved = from === first ? from.scrollTop + offset : from.scrollTop - offset;
    return Math.max(0, Math.min(moved, limitOf(other(from))));
  };

  function onScroll(event: Event) {
    const from = event.currentTarget as HTMLElement;
    const to = other(from);
    // Being put in line, or answering the pane that leads: not the reader's doing.
    if (from === gliding || (leader && leader !== from)) {
      last.set(from, from.scrollTop);
      return;
    }
    // The reader has taken a pane in hand: an alignment still on its way gives way.
    if (gliding) settle();
    if (!leader && !sameChapter) offset = last.get(second)! - last.get(first)!;
    lead(from);
    const top = place(from);
    if (Math.abs(to.scrollTop - top) >= 0.5) to.scrollTop = top;
    last.set(from, from.scrollTop);
    last.set(to, to.scrollTop);
  }

  /** The alignment is over, finished or not: the pane that stayed still leads for a moment. */
  function settle() {
    const moved = gliding;
    gliding = null;
    owed = null;
    stopGlide();
    stopGlide = () => {};
    if (moved) lead(other(moved));
  }

  /** Puts the follower in line once both panes have their text. */
  function alignNow() {
    if (!owed || gliding) return;
    const { follower, glide, atHead } = owed;
    if (!first.querySelector("[data-verse]") || !second.querySelector("[data-verse]")) return;
    if (atHead && follower.scrollTop > 1) {
      owed = null;
      return;
    }
    anchors = null;
    const top = place(other(follower));
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (!glide || still) {
      owed = null;
      lead(other(follower));
      follower.scrollTop = top;
      last.set(follower, follower.scrollTop);
      return;
    }
    gliding = follower;
    stopGlide = glideTo(top, settle, follower);
  }

  // Text arriving, the window changing width, a toolbar opening: every verse may have moved.
  const watcher =
    typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(() => {
          anchors = null;
          alignNow();
        });
  for (const pane of [first, second]) {
    pane.addEventListener("scroll", onScroll, { passive: true });
    if (pane.firstElementChild) watcher?.observe(pane.firstElementChild);
  }
  alignNow();

  return () => {
    const unfinished = owed;
    stopGlide();
    clearTimeout(release);
    watcher?.disconnect();
    for (const pane of [first, second]) pane.removeEventListener("scroll", onScroll);
    return unfinished;
  };
}

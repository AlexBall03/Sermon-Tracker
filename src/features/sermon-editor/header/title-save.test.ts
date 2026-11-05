// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { RenameResult } from "@/features/ideas/actions";
import {
  createTitleSaver,
  titleTiming,
  type HeadingRead,
  type Submission,
  type TitleTransport,
} from "./title-save";

/** A request the test answers when it chooses. */
type Pending<T> = { resolve: (value: T) => void; reject: (error: unknown) => void };

function harness(start = { title: "Old", revision: 3 }) {
  const renames: (Submission & Pending<RenameResult>)[] = [];
  const reads: Pending<HeadingRead>[] = [];
  const transport: TitleTransport = {
    rename: (submission) =>
      new Promise((resolve, reject) => renames.push({ ...submission, resolve, reject })),
    read: () => new Promise((resolve, reject) => reads.push({ resolve, reject })),
  };
  const timers: { run: () => void; ms: number; cleared: boolean }[] = [];
  const saver = createTitleSaver(start, transport, {
    set: (run, ms) => {
      const timer = { run, ms, cleared: false };
      timers.push(timer);
      return timer;
    },
    clear: (handle) => {
      (handle as { cleared: boolean }).cleared = true;
    },
  });
  /** Lets the promise callbacks run. */
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  /** The newest timer that has not been cleared runs out. */
  const expire = async (ms: number) => {
    const timer = [...timers].reverse().find((each) => !each.cleared && each.ms === ms);
    if (!timer) throw new Error(`no ${ms} ms timer`);
    timer.cleared = true;
    timer.run();
    await settle();
  };
  return { saver, renames, reads, settle, expire, state: () => saver.getSnapshot().state };
}

describe("saving a sermon's title (A4.3)", () => {
  it("sends a new title against the revision it was typed on, and settles on the answer", async () => {
    const { saver, renames, settle, state } = harness();
    saver.commit("New");
    expect(renames).toEqual([expect.objectContaining({ title: "New", expectedRevision: 3 })]);
    expect(state()).toEqual({ kind: "saving", held: { title: "New", expectedRevision: 3 } });
    expect(saver.holdsWork()).toBe(true);
    renames[0].resolve({ code: "renamed", title: "New", revision: 4 });
    await settle();
    expect(state()).toEqual({ kind: "saved" });
    expect(saver.getSnapshot().confirmed).toEqual({ title: "New", revision: 4 });
    expect(saver.holdsWork()).toBe(false);
    // The next is made against the revision that answer gave.
    saver.commit("Newer");
    expect(renames[1]).toMatchObject({ title: "Newer", expectedRevision: 4 });
  });

  it("sends nothing for the title it already has", () => {
    const { saver, renames } = harness();
    saver.commit("Old");
    expect(renames).toHaveLength(0);
  });

  it("keeps newer words while a request is in flight, and sends them only after it settles", async () => {
    const { saver, renames, settle } = harness();
    saver.commit("First");
    saver.commit("Second");
    expect(renames).toHaveLength(1);
    expect(saver.shown()).toBe("Second");
    renames[0].resolve({ code: "renamed", title: "First", revision: 4 });
    await settle();
    expect(renames[1]).toMatchObject({ title: "Second", expectedRevision: 4 });
  });

  it("never writes over a change made elsewhere: a stale answer is the person's choice", async () => {
    const { saver, renames, settle, state } = harness();
    saver.commit("Mine");
    renames[0].resolve({ code: "stale", title: "Theirs", revision: 5 });
    await settle();
    expect(state()).toEqual({
      kind: "conflict",
      mine: "Mine",
      server: { title: "Theirs", revision: 5 },
    });
    expect(saver.shown()).toBe("Mine");
    expect(renames).toHaveLength(1);
    // Typing again sends nothing while the conflict stands.
    saver.commit("Mine, edited");
    expect(renames).toHaveLength(1);
    saver.keepMine();
    expect(renames[1]).toMatchObject({ title: "Mine, edited", expectedRevision: 5 });
  });

  it("drops mine for theirs only when asked", async () => {
    const { saver, renames, settle, state } = harness();
    saver.commit("Mine");
    renames[0].resolve({ code: "stale", title: "Theirs", revision: 5 });
    await settle();
    saver.useTheirs();
    expect(state()).toEqual({ kind: "idle" });
    expect(saver.shown()).toBe("Theirs");
    expect(saver.holdsWork()).toBe(false);
  });

  describe("an answer that is lost", () => {
    it("is uncertain, not a failure: the request is held and read back once, sending nothing", async () => {
      const { saver, renames, reads, expire, state } = harness();
      saver.commit("New");
      await expire(titleTiming.saveMs);
      expect(state()).toEqual({
        kind: "uncertain",
        held: { title: "New", expectedRevision: 3 },
        checking: true,
      });
      expect(reads).toHaveLength(1);
      expect(renames).toHaveLength(1);
    });

    it("is saved when the read finds the title sent at the next revision", async () => {
      const { saver, renames, reads, expire, settle, state } = harness();
      saver.commit("New");
      await expire(titleTiming.saveMs);
      reads[0].resolve({ kind: "found", title: "New", revision: 4 });
      await settle();
      expect(state()).toEqual({ kind: "saved" });
      // The late answer to the first request changes nothing.
      renames[0].resolve({ code: "stale", title: "New", revision: 4 });
      await settle();
      expect(state()).toEqual({ kind: "saved" });
    });

    it("stays held while the idea is still at the revision it was sent against", async () => {
      const { saver, renames, reads, expire, settle, state } = harness();
      saver.commit("New");
      await expire(titleTiming.saveMs);
      reads[0].resolve({ kind: "found", title: "Old", revision: 3 });
      await settle();
      expect(state()).toEqual({
        kind: "uncertain",
        held: { title: "New", expectedRevision: 3 },
        checking: false,
      });
      expect(saver.holdsWork()).toBe(true);
      // Newer words wait: nothing different is sent while the first may still land.
      saver.commit("Newer");
      expect(renames).toHaveLength(1);
      expect(saver.shown()).toBe("Newer");
    });

    it("resends only the held request itself, the same title against the same revision", async () => {
      const { saver, renames, reads, expire, settle } = harness();
      saver.commit("New");
      await expire(titleTiming.saveMs);
      reads[0].resolve({ kind: "found", title: "Old", revision: 3 });
      await settle();
      saver.commit("Newer");
      saver.retry();
      expect(renames[1]).toMatchObject({ title: "New", expectedRevision: 3 });
      // The first arrived meanwhile: the retry is refused as stale, with the title it sent.
      renames[1].resolve({ code: "stale", title: "New", revision: 4 });
      await settle();
      expect(saver.getSnapshot().confirmed).toEqual({ title: "New", revision: 4 });
      // Only now are the newer words sent, against the revision the first made.
      expect(renames[2]).toMatchObject({ title: "Newer", expectedRevision: 4 });
    });

    it("is released as a conflict once the idea moved past that revision with another title", async () => {
      const { saver, reads, expire, settle, state } = harness();
      saver.commit("Mine");
      await expire(titleTiming.saveMs);
      reads[0].resolve({ kind: "found", title: "Theirs", revision: 4 });
      await settle();
      expect(state()).toEqual({
        kind: "conflict",
        mine: "Mine",
        server: { title: "Theirs", revision: 4 },
      });
    });

    it("treats the server's failed answer, a thrown call, and a failed read as uncertain", async () => {
      const { saver, renames, reads, settle, state } = harness();
      saver.commit("New");
      renames[0].resolve({ code: "failed", message: "x" });
      await settle();
      expect(state()).toMatchObject({ kind: "uncertain", checking: true });
      reads[0].resolve({ kind: "failed" });
      await settle();
      expect(state()).toMatchObject({ kind: "uncertain", checking: false });
      saver.retry();
      renames[1].reject(new Error("network"));
      await settle();
      expect(state()).toMatchObject({ kind: "uncertain", held: { title: "New" } });
      expect(reads).toHaveLength(2);
    });

    it("never reads twice at once, and reads again only when asked", async () => {
      const { saver, reads, expire } = harness();
      saver.commit("New");
      await expire(titleTiming.saveMs);
      saver.check();
      saver.check();
      expect(reads).toHaveLength(1);
      await expire(titleTiming.readMs);
      expect(reads).toHaveLength(1);
      saver.check();
      expect(reads).toHaveLength(2);
    });

    it("keeps a request held when the read is refused for the session", async () => {
      const { saver, reads, expire, settle, state } = harness();
      saver.commit("New");
      await expire(titleTiming.saveMs);
      reads[0].resolve({ kind: "unauthorized" });
      await settle();
      expect(state()).toMatchObject({ kind: "uncertain", held: { title: "New" } });
    });
  });

  it("says definite refusals plainly and keeps the words", async () => {
    for (const code of ["invalid", "missing", "unauthorized"] as const) {
      const { saver, renames, settle, state } = harness();
      saver.commit("New");
      renames[0].resolve({ code, message: "x" });
      await settle();
      expect(state()).toEqual({ kind: "refused", mine: "New", reason: code });
      expect(saver.shown()).toBe("New");
      expect(saver.holdsWork()).toBe(code !== "missing");
    }
  });

  it("takes a newer copy from the page only while nothing is held", async () => {
    const { saver, renames, settle } = harness();
    saver.observe({ title: "From the library", revision: 6 });
    expect(saver.shown()).toBe("From the library");
    saver.commit("Mine");
    expect(renames[0]).toMatchObject({ expectedRevision: 6 });
    saver.observe({ title: "Later", revision: 9 });
    expect(saver.getSnapshot().confirmed.revision).toBe(6);
    renames[0].resolve({ code: "renamed", title: "Mine", revision: 7 });
    await settle();
    // An older copy never replaces what the server just said.
    saver.observe({ title: "Old", revision: 3 });
    expect(saver.shown()).toBe("Mine");
  });
});

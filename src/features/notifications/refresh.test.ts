// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { minRefreshMs, type NotificationSummary } from "./model";
import { createRefresher, type RefreshResult } from "./refresh";

const summary = (unread: number): NotificationSummary => ({ unread, items: [] });

/** A refresher whose fetches are answered by hand, on a clock the test moves. */
function setup() {
  let clock = 0;
  let allowed = true;
  const pending: {
    resolve: (value: NotificationSummary) => void;
    reject: (error: unknown) => void;
    signal: AbortSignal;
  }[] = [];
  const fetchSummary = vi.fn(
    (signal: AbortSignal) =>
      new Promise<NotificationSummary>((resolve, reject) =>
        pending.push({ resolve, reject, signal }),
      ),
  );
  const applied: RefreshResult[] = [];
  const refresher = createRefresher({
    fetchSummary,
    apply: (result) => applied.push(result),
    canAsk: () => allowed,
    now: () => clock,
  });
  return {
    refresher,
    fetchSummary,
    applied,
    pending,
    advance: (ms: number) => (clock += ms),
    allow: (value: boolean) => (allowed = value),
    /** Answers the oldest open request and lets its follow-up start. */
    async answer(value: NotificationSummary | Error) {
      const next = pending.shift()!;
      if (value instanceof Error) next.reject(value);
      else next.resolve(value);
      await new Promise((settled) => setTimeout(settled, 0));
    },
  };
}

describe("createRefresher", () => {
  it("throttles routine asks to one per minRefreshMs", async () => {
    const t = setup();
    t.refresher.refresh("routine");
    await t.answer(summary(1));
    t.advance(minRefreshMs - 1);
    t.refresher.refresh("routine");
    expect(t.fetchSummary).toHaveBeenCalledTimes(1);
    t.advance(1);
    t.refresher.refresh("routine");
    expect(t.fetchSummary).toHaveBeenCalledTimes(2);
    expect(t.applied[0]).toEqual({ ok: true, data: summary(1) });
  });

  it("lets event and explicit asks past the throttle", async () => {
    const t = setup();
    t.refresher.refresh("routine");
    await t.answer(summary(0));
    t.refresher.refresh("explicit");
    expect(t.fetchSummary).toHaveBeenCalledTimes(2);
    await t.answer(summary(0));
    t.refresher.refresh("event");
    expect(t.fetchSummary).toHaveBeenCalledTimes(3);
  });

  it("never runs two at once: drops a routine ask, and makes an owed one after", async () => {
    const t = setup();
    t.refresher.refresh("routine");
    t.advance(minRefreshMs * 2);
    t.refresher.refresh("routine");
    expect(t.fetchSummary).toHaveBeenCalledTimes(1);

    // Several event asks during one request make one follow-up.
    t.refresher.refresh("event");
    t.refresher.refresh("explicit");
    t.refresher.refresh("event");
    expect(t.fetchSummary).toHaveBeenCalledTimes(1);
    await t.answer(summary(1));
    expect(t.fetchSummary).toHaveBeenCalledTimes(2);
    await t.answer(summary(2));
    expect(t.fetchSummary).toHaveBeenCalledTimes(2);
    expect(t.applied.map((r) => (r.ok ? r.data.unread : null))).toEqual([1, 2]);
  });

  it("throws away an answer started before invalidate, and asks again", async () => {
    const t = setup();
    t.refresher.refresh("routine");
    t.refresher.invalidate();
    await t.answer(summary(5)); // stale: from before the write
    expect(t.applied).toEqual([]);
    expect(t.fetchSummary).toHaveBeenCalledTimes(2);
    await t.answer(summary(0));
    expect(t.applied).toEqual([{ ok: true, data: summary(0) }]);
  });

  it("asks nothing it may not, and owes an event or explicit ask until it may", async () => {
    const t = setup();
    t.allow(false);
    t.refresher.refresh("routine");
    t.refresher.refresh("event");
    expect(t.fetchSummary).not.toHaveBeenCalled();

    t.allow(true);
    t.refresher.refresh("routine");
    expect(t.fetchSummary).toHaveBeenCalledTimes(1);
    await t.answer(summary(0));

    // Owed even inside the throttle window.
    t.allow(false);
    t.refresher.refresh("explicit");
    t.allow(true);
    t.refresher.refresh("routine");
    expect(t.fetchSummary).toHaveBeenCalledTimes(2);
  });

  it("reports a failure once and does not retry it", async () => {
    const t = setup();
    t.refresher.refresh("routine");
    await t.answer(new Error("500"));
    expect(t.applied).toEqual([{ ok: false }]);
    expect(t.fetchSummary).toHaveBeenCalledTimes(1);
  });

  it("aborts and applies nothing once disposed", async () => {
    const t = setup();
    t.refresher.refresh("routine");
    const { signal } = t.pending[0];
    t.refresher.dispose();
    expect(signal.aborted).toBe(true);
    await t.answer(summary(3));
    t.refresher.refresh("explicit");
    expect(t.applied).toEqual([]);
    expect(t.fetchSummary).toHaveBeenCalledTimes(1);
  });
});

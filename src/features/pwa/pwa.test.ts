import { describe, expect, it, vi } from "vitest";

import { isNewVersion, versionReplyMs } from "./pwa";

/** A waiting worker that answers `GET_VERSION` with `version`, or never answers. */
const worker = (version?: string) =>
  ({
    postMessage: (message: { type: string }, [port]: MessagePort[]) => {
      if (message.type === "GET_VERSION" && version !== undefined) port.postMessage({ version });
    },
  }) as unknown as ServiceWorker;

describe("isNewVersion", () => {
  // Outside a build the page's version is "development".
  it("is not an update when the waiting worker is the version this page already is", async () => {
    await expect(isNewVersion(worker("development"))).resolves.toBe(false);
  });

  it("is an update when the waiting worker is another version", async () => {
    await expect(isNewVersion(worker("dpl_next"))).resolves.toBe(true);
  });

  it("is taken to be an update when the worker does not say which it is", async () => {
    vi.useFakeTimers();
    try {
      const answer = isNewVersion(worker());
      vi.advanceTimersByTime(versionReplyMs);
      await expect(answer).resolves.toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

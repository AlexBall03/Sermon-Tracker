import { afterEach, describe, expect, it, vi } from "vitest";

import { foldKey, readFolded, storeFolded } from "./folding-storage";

/* A3.1: folds are a browser preference per account and outline, and storage trouble never stops the editor. */

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("folding storage", () => {
  it("keeps one account's outline apart from another's, and from the legacy key", () => {
    storeFolded(foldKey("owner-a", "outline-1"), ["p-1", "p-1", "p-2"]);
    expect(readFolded(foldKey("owner-a", "outline-1"))).toEqual(["p-1", "p-2"]);
    expect(readFolded(foldKey("owner-b", "outline-1"))).toEqual([]);
    expect(window.localStorage.getItem("outline-collapsed:outline-1")).toBeNull();
    expect(window.localStorage.getItem("sermon-document-folded:owner-a:outline-1")).toBe(
      '["p-1","p-2"]',
    );
  });

  it("forgets the key when nothing is folded", () => {
    const key = foldKey("owner-a", "outline-2");
    storeFolded(key, ["p-1"]);
    storeFolded(key, []);
    expect(window.localStorage.getItem(`sermon-document-folded:${key}`)).toBeNull();
    expect(readFolded(key)).toEqual([]);
  });

  it("reads something unreadable as nothing folded", () => {
    window.localStorage.setItem("sermon-document-folded:o:x", "{not json");
    expect(readFolded("o:x")).toEqual([]);
    window.localStorage.setItem("sermon-document-folded:o:y", '{"p-1":true}');
    expect(readFolded("o:y")).toEqual([]);
    window.localStorage.setItem("sermon-document-folded:o:z", '["p-1",3,null]');
    expect(readFolded("o:z")).toEqual(["p-1"]);
  });

  it("keeps folds for the page's life when storage refuses, and never throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => storeFolded("o:blocked", ["p-9"])).not.toThrow();
    expect(readFolded("o:blocked")).toEqual(["p-9"]);
  });
});

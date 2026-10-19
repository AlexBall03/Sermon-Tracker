// Loaded once, as tests load it: a later import under a stubbed NODE_ENV reuses this copy.
import "react/jsx-dev-runtime";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * The page's own guard, the second of the lab's two (migration document
 * §15.2). The first, the proxy, is what gives the real 404 status; it is
 * checked against a production build by tests/lab/production.spec.ts.
 */

const calls: string[] = [];

vi.mock("next/navigation", () => ({
  notFound: () => {
    calls.push("notFound");
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/features/auth/access", () => ({
  requireActiveUser: async () => {
    calls.push("requireActiveUser");
    return { id: "user" };
  },
}));
vi.mock("@/i18n/server", () => ({
  getT: async () => {
    calls.push("getT");
    return { title: "Editor Lab", description: "", metaTitle: "Editor Lab" };
  },
}));
vi.mock("@/features/editor-lab/components/editor-lab", () => ({ EditorLab: () => null }));

beforeEach(() => {
  calls.length = 0;
  vi.resetModules();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the editor lab page", () => {
  it("refuses outside development before checking the account or reading anything", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { default: Page, generateMetadata } = await import("./page");
    await expect(Page()).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(generateMetadata()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(calls).toEqual(["notFound", "notFound"]);
  });

  it("checks the account first in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { default: Page } = await import("./page");
    await Page();
    expect(calls).toEqual(["requireActiveUser", "getT"]);
  });
});

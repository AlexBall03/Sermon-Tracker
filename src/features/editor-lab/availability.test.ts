import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { isLabPath, labAvailable, labGuard } from "./availability";

describe("the lab is development-only", () => {
  it("is available only under next dev", () => {
    expect(labAvailable("development")).toBe(true);
    for (const environment of ["production", "test", "", undefined]) {
      expect(labAvailable(environment)).toBe(false);
    }
  });

  it("knows its own addresses and no others", () => {
    for (const path of ["/lab", "/lab/", "/lab/editor", "/lab/editor/anything"]) {
      expect(isLabPath(path)).toBe(true);
    }
    for (const path of ["/", "/labs", "/laboratory", "/library", "/outlines/lab", "/dashboard"]) {
      expect(isLabPath(path)).toBe(false);
    }
  });

  it("answers 404 outside development, and only for its own addresses", async () => {
    for (const environment of ["production", "test", undefined]) {
      const response = labGuard("/lab/editor", environment);
      expect(response?.status).toBe(404);
      expect(response?.headers.get("X-Robots-Tag")).toContain("noindex");
      expect(response?.headers.get("Cache-Control")).toBe("no-store");
      expect(await response?.text()).toBe("Not Found");
    }
    expect(labGuard("/lab", "production")?.status).toBe(404);
    expect(labGuard("/library", "production")).toBeNull();
    expect(labGuard("/lab/editor", "development")).toBeNull();
  });
});

const root = join(process.cwd(), "src", "features", "editor-lab");

function files(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

describe("the lab's boundaries (migration document §15.3)", () => {
  const sources = files(root)
    .filter((path) => /\.(ts|tsx)$/.test(path) && !/\.test\.tsx?$/.test(path))
    .map((path) => ({ path, text: readFileSync(path, "utf8") }));

  it("has source files to check", () => {
    expect(sources.length).toBeGreaterThan(8);
  });

  it.each([
    ["the database", /from "@\/db/],
    ["a server action", /from "[^"]*actions"/],
    ["offline storage", /from "@\/features\/offline/],
    ["synchronization", /from "@\/features\/sync/],
    ["the outline editor's store", /from "@\/features\/outlines\/editor\/store"/],
    ["the outline queries", /from "@\/features\/outlines\/(outlines|entries)"/],
    ["server-only code", /from "(server-only|@\/i18n\/server)"/],
  ])("imports nothing from %s", (_name, pattern) => {
    for (const { path, text } of sources) expect(text, path).not.toMatch(pattern);
  });

  it("sends and stores nothing", () => {
    for (const { path, text } of sources) {
      expect(text, path).not.toMatch(/\bfetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/);
      expect(text, path).not.toMatch(/localStorage|sessionStorage|indexedDB|caches\./);
      expect(text, path).not.toMatch(/setInterval\(/);
    }
  });

  it("is not in the navigation, the routes, the sitemap, or the tour", () => {
    const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
    for (const path of [
      "src/lib/site.ts",
      "src/components/layout/app-links.ts",
      "src/app/sitemap.ts",
      "src/features/tour/steps.ts",
    ]) {
      expect(read(path), path).not.toMatch(/["'`]\/lab\b/);
    }
  });
});

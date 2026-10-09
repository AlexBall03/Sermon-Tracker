import { describe, expect, it } from "vitest";

import { isIndexable, parseEnv } from "./env";
import { privateRoutes, routes, siteConfig } from "./site";

describe("site config", () => {
  it("uses the canonical production origin", () => {
    expect(siteConfig.url).toBe("https://sermontracker.com");
  });

  it("keeps every route except home out of search indexes", () => {
    const publicRoutes = Object.values(routes).filter(
      (route) => !(privateRoutes as readonly string[]).includes(route),
    );
    expect(publicRoutes).toEqual(["/"]);
  });
});

describe("environment", () => {
  it("accepts a missing or empty VERCEL_ENV", () => {
    expect(parseEnv({}).VERCEL_ENV).toBeUndefined();
    expect(parseEnv({ VERCEL_ENV: "" }).VERCEL_ENV).toBeUndefined();
  });

  it("rejects an unknown VERCEL_ENV", () => {
    expect(() => parseEnv({ VERCEL_ENV: "staging" })).toThrow();
  });

  it("only allows indexing locally and in production", () => {
    expect(isIndexable(undefined)).toBe(true);
    expect(isIndexable("production")).toBe(true);
    expect(isIndexable("preview")).toBe(false);
    expect(isIndexable("development")).toBe(false);
  });
});

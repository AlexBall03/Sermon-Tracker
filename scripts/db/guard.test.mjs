import { describe, expect, it } from "vitest";

import {
  checkStamp,
  checkTarget,
  describeTarget,
  pendingMigrations,
  redact,
  resolveTarget,
} from "./guard.mjs";

const dev = { target: "development", declared: "development", stamp: "development" };
const prod = { target: "production", declared: "production", stamp: "production" };

describe("checkTarget", () => {
  it("allows a database whose declaration and stamp match the command", () => {
    expect(checkTarget(dev)).toEqual({ ok: true, needsStamp: false });
    expect(checkTarget(prod)).toEqual({ ok: true, needsStamp: false });
  });

  it("refuses the development command on a production database", () => {
    // Stamped production, even though .env.local claims development.
    expect(checkTarget({ ...dev, stamp: "production" }).ok).toBe(false);
    // Declared production.
    expect(checkTarget({ ...dev, declared: "production" }).ok).toBe(false);
    // Running inside the production deployment.
    expect(checkTarget({ ...dev, vercelEnv: "production" }).ok).toBe(false);
  });

  it("refuses the production command on a development database", () => {
    expect(checkTarget({ ...prod, stamp: "development" }).ok).toBe(false);
  });

  it("runs production migrations on Vercel only in the production deployment", () => {
    expect(checkTarget({ ...prod, vercelEnv: "production" })).toEqual({
      ok: true,
      needsStamp: false,
    });
    expect(checkTarget({ ...prod, vercelEnv: "preview" }).ok).toBe(false);
    expect(checkTarget({ ...prod, vercelEnv: "development" }).ok).toBe(false);
    // The production deployment still refuses a database that is not production.
    expect(checkTarget({ ...prod, vercelEnv: "production", stamp: "development" }).ok).toBe(false);
    expect(checkTarget({ ...prod, vercelEnv: "production", declared: "development" }).ok).toBe(
      false,
    );
  });

  it("fails closed when the identity is ambiguous", () => {
    expect(checkTarget({ ...dev, declared: undefined }).ok).toBe(false);
    expect(checkTarget({ ...dev, stamp: null, isEmpty: false }).ok).toBe(false);
    // From a workstation an unstamped production database is always stamped by hand.
    expect(checkTarget({ ...prod, stamp: null, isEmpty: true }).ok).toBe(false);
    expect(checkTarget({ ...prod, vercelEnv: "production", stamp: null, isEmpty: false }).ok).toBe(
      false,
    );
    expect(checkTarget({ ...dev, target: "staging" }).ok).toBe(false);
  });

  it("stamps a brand-new production database on its first production deployment", () => {
    expect(checkTarget({ ...prod, vercelEnv: "production", stamp: null, isEmpty: true })).toEqual({
      ok: true,
      needsStamp: true,
    });
  });

  it("stamps a brand-new development database automatically", () => {
    expect(checkTarget({ ...dev, stamp: null, isEmpty: true })).toEqual({
      ok: true,
      needsStamp: true,
    });
  });
});

describe("checkStamp", () => {
  it("does nothing when the stamp already matches", () => {
    expect(checkStamp({ target: "production", stamp: "production" })).toEqual({
      ok: true,
      alreadyStamped: true,
    });
  });

  it("will not relabel a production database without --force", () => {
    expect(checkStamp({ target: "development", stamp: "production" }).ok).toBe(false);
    expect(checkStamp({ target: "development", stamp: "production", force: true }).ok).toBe(true);
  });
});

describe("output safety", () => {
  const url = "postgresql://owner:s3cret@ep-example.aws.neon.tech/neondb?sslmode=require";

  it("describes a target without credentials", () => {
    expect(describeTarget(url)).toBe("ep-example.aws.neon.tech/neondb");
    expect(describeTarget("nonsense")).toBe("(unreadable connection string)");
  });

  it("removes connection strings from error text", () => {
    const text = redact(`connect failed for ${url} (timeout)`);
    expect(text).not.toContain("s3cret");
    expect(text).not.toContain("owner");
  });
});

describe("helpers", () => {
  it("lists migrations newer than the last applied one", () => {
    const journal = [
      { tag: "0000_a", when: 100 },
      { tag: "0001_b", when: 200 },
    ];
    expect(pendingMigrations(journal, null)).toEqual(["0000_a", "0001_b"]);
    expect(pendingMigrations(journal, 100)).toEqual(["0001_b"]);
    expect(pendingMigrations(journal, 200)).toEqual([]);
  });

  it("maps command names to environments", () => {
    expect(resolveTarget("dev")).toBe("development");
    expect(resolveTarget("prod")).toBe("production");
    expect(resolveTarget("staging")).toBeNull();
    expect(resolveTarget(undefined)).toBeNull();
  });
});

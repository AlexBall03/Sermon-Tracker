// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import { users } from "@/db/schema";
import { createTestDatabase } from "@/db/testing";
import type { Database } from "@/db/types";
import { updateUser } from "@/features/admin/users";
import { provisionUser } from "./provisioning";

const invited = { isInvited: async () => true };
const uninvited = { isInvited: async () => false };

let db: Database;
beforeEach(async () => {
  db = await createTestDatabase();
});

describe("database constraints", () => {
  it("rejects a second row for the same Clerk user", async () => {
    await db.insert(users).values({ clerkUserId: "user_a" });
    await expect(db.insert(users).values({ clerkUserId: "user_a" })).rejects.toThrow();
  });

  it("rejects unknown roles and statuses", async () => {
    await expect(
      db.insert(users).values({ clerkUserId: "user_a", role: "owner" as "admin" }),
    ).rejects.toThrow();
    await expect(
      db.insert(users).values({ clerkUserId: "user_b", status: "banned" as "active" }),
    ).rejects.toThrow();
  });
});

describe("provisionUser", () => {
  it("creates an active standard user for an invited identity", async () => {
    const result = await provisionUser(db, "user_a", invited);
    expect(result).toMatchObject({ ok: true, user: { role: "user", status: "active" } });
  });

  it("is idempotent, including under concurrent first requests", async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () => provisionUser(db, "user_a", invited)),
    );
    const ids = new Set(results.map((result) => (result.ok ? result.user.id : null)));
    expect(ids.size).toBe(1);
    expect(await db.select().from(users)).toHaveLength(1);
  });

  it("creates nothing for an identity that was not invited", async () => {
    expect(await provisionUser(db, "user_stranger", uninvited)).toEqual({
      ok: false,
      reason: "not-invited",
    });
    expect(await db.select().from(users)).toHaveLength(0);
  });

  it("does not ask Clerk again once the user exists", async () => {
    await provisionUser(db, "user_a", invited);
    const isInvited = vi.fn(async () => false);
    expect((await provisionUser(db, "user_a", { isInvited })).ok).toBe(true);
    expect(isInvited).not.toHaveBeenCalled();
  });

  it("never re-enables a disabled account", async () => {
    await provisionUser(db, "user_a", invited);
    await db.update(users).set({ status: "disabled" }).where(eq(users.clerkUserId, "user_a"));
    const result = await provisionUser(db, "user_a", invited);
    expect(result).toMatchObject({ ok: true, user: { status: "disabled" } });
  });
});

describe("initial administrator", () => {
  const bootstrap = { ...uninvited, initialAdminId: "user_owner" };

  it("makes only the configured identity an administrator", async () => {
    expect(await provisionUser(db, "user_owner", bootstrap)).toMatchObject({
      ok: true,
      user: { role: "admin" },
    });
    expect(
      await provisionUser(db, "user_other", { ...invited, initialAdminId: "user_owner" }),
    ).toMatchObject({ ok: true, user: { role: "user" } });
    expect((await provisionUser(db, "user_stranger", bootstrap)).ok).toBe(false);
  });

  it("promotes an existing ordinary account only while there is no administrator", async () => {
    await provisionUser(db, "user_owner", invited);
    expect(await provisionUser(db, "user_owner", bootstrap)).toMatchObject({
      ok: true,
      user: { role: "admin" },
    });
  });

  it("does not undo a deliberate demotion", async () => {
    const owner = await provisionUser(db, "user_owner", bootstrap);
    const second = await provisionUser(db, "user_second", invited);
    if (!owner.ok || !second.ok) throw new Error("setup failed");
    await updateUser(db, second.user.id, { role: "admin" });
    await updateUser(db, owner.user.id, { role: "user" });

    expect(await provisionUser(db, "user_owner", bootstrap)).toMatchObject({
      ok: true,
      user: { role: "user" },
    });
  });
});

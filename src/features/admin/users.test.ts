// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";

import { users, type UserRole, type UserStatus } from "@/db/schema";
import { createTestDatabase } from "@/db/testing";
import type { Database } from "@/db/types";
import { getUserCounts, updateUser } from "./users";

let db: Database;
beforeEach(async () => {
  db = await createTestDatabase();
});

async function add(clerkUserId: string, role: UserRole = "user", status: UserStatus = "active") {
  const [user] = await db.insert(users).values({ clerkUserId, role, status }).returning();
  return user;
}

describe("updateUser", () => {
  it("changes role and status", async () => {
    await add("user_admin", "admin");
    const user = await add("user_a");
    expect(await updateUser(db, user.id, { role: "admin" })).toMatchObject({
      ok: true,
      user: { role: "admin" },
    });
    expect(await updateUser(db, user.id, { status: "disabled" })).toMatchObject({
      ok: true,
      user: { status: "disabled", role: "admin" },
    });
  });

  it("refuses to demote the last active administrator", async () => {
    const admin = await add("user_admin", "admin");
    await add("user_a");
    expect(await updateUser(db, admin.id, { role: "user" })).toEqual({
      ok: false,
      reason: "last-admin",
    });
  });

  it("refuses to disable the last active administrator", async () => {
    const admin = await add("user_admin", "admin");
    // A disabled administrator does not count as cover.
    await add("user_old_admin", "admin", "disabled");
    expect(await updateUser(db, admin.id, { status: "disabled" })).toEqual({
      ok: false,
      reason: "last-admin",
    });
  });

  it("allows it once another active administrator exists", async () => {
    const first = await add("user_admin", "admin");
    await add("user_second", "admin");
    expect((await updateUser(db, first.id, { status: "disabled" })).ok).toBe(true);
  });

  it("reports an unknown user", async () => {
    expect(await updateUser(db, "00000000-0000-4000-8000-000000000000", { role: "admin" })).toEqual(
      { ok: false, reason: "not-found" },
    );
  });
});

describe("getUserCounts", () => {
  it("counts real rows", async () => {
    expect(await getUserCounts(db)).toEqual({ total: 0, active: 0, disabled: 0 });
    await add("user_a");
    await add("user_b", "user", "disabled");
    await add("user_c", "admin");
    expect(await getUserCounts(db)).toEqual({ total: 3, active: 2, disabled: 1 });
  });
});

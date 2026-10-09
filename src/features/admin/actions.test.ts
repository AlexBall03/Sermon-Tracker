// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { users, type AppUser, type UserRole, type UserStatus } from "@/db/schema";
import { createTestDatabase } from "@/db/testing";
import type { Database } from "@/db/types";
import type { Authorization } from "@/features/auth/access";

// Clerk and the request are mocked; the database is real (in memory).
const state = vi.hoisted(() => ({
  db: undefined as unknown,
  access: { ok: false, message: "signed out" } as unknown,
  clerk: {
    createInvitation: vi.fn(),
    revokeInvitation: vi.fn(),
    resendInvitation: vi.fn(),
    describeClerkError: vi.fn((_error: unknown, fallback: string) => fallback),
  },
}));

vi.mock("@/db", () => ({ getDb: () => state.db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ origin: "http://localhost" }),
}));
vi.mock("./clerk", () => state.clerk);
vi.mock("@/features/auth/access", () => ({
  // Mirrors the real helper's rule: admin actions need an active administrator.
  authorize: async (requirement: "active" | "admin"): Promise<Authorization> => {
    const access = state.access as Authorization;
    if (!access.ok) return access;
    if (requirement === "admin" && access.user.role !== "admin") {
      return { ok: false, message: "Only administrators can do that." };
    }
    return access;
  },
}));

import { inviteUser, revokeUserInvitation, setUserRole, setUserStatus } from "./actions";

let db: Database;

async function add(clerkUserId: string, role: UserRole = "user", status: UserStatus = "active") {
  const [user] = await db.insert(users).values({ clerkUserId, role, status }).returning();
  return user;
}

function signInAs(user: AppUser | null) {
  state.access = user ? { ok: true, user } : { ok: false, message: "Your session has ended." };
}

async function roleOf(user: AppUser) {
  const rows = await db.select().from(users);
  return rows.find((row) => row.id === user.id)?.role;
}

function inviteForm(email: string) {
  const form = new FormData();
  form.set("email", email);
  return form;
}

beforeEach(async () => {
  db = await createTestDatabase();
  state.db = db;
  vi.clearAllMocks();
});

describe("administrative actions", () => {
  it("reject a signed-out caller", async () => {
    const target = await add("user_target");
    signInAs(null);
    expect((await setUserRole(target.id, "admin")).ok).toBe(false);
    expect((await inviteUser(null, inviteForm("a@example.com"))).ok).toBe(false);
    expect(await roleOf(target)).toBe("user");
    expect(state.clerk.createInvitation).not.toHaveBeenCalled();
  });

  it("reject a standard user, including a forged self-promotion", async () => {
    const user = await add("user_standard");
    const other = await add("user_other");
    signInAs(user);

    expect((await setUserRole(user.id, "admin")).ok).toBe(false);
    expect((await setUserRole(other.id, "admin")).ok).toBe(false);
    expect((await setUserStatus(other.id, "disabled")).ok).toBe(false);
    expect((await revokeUserInvitation("inv_123")).ok).toBe(false);
    expect(await roleOf(user)).toBe("user");
    expect(state.clerk.revokeInvitation).not.toHaveBeenCalled();
  });

  it("let an administrator change another user", async () => {
    const admin = await add("user_admin", "admin");
    const target = await add("user_target");
    signInAs(admin);

    expect(await setUserRole(target.id, "admin")).toMatchObject({ ok: true });
    expect(await roleOf(target)).toBe("admin");
    expect(await setUserStatus(target.id, "disabled")).toMatchObject({ ok: true });
  });

  it("do not let an administrator change their own account", async () => {
    const admin = await add("user_admin", "admin");
    await add("user_second", "admin");
    signInAs(admin);
    expect((await setUserRole(admin.id, "user")).ok).toBe(false);
    expect(await roleOf(admin)).toBe("admin");
  });

  it("keep the last active administrator", async () => {
    const acting = await add("user_acting", "admin");
    const other = await add("user_other", "admin");
    signInAs(acting);
    await db.update(users).set({ status: "disabled" });
    // Both are now disabled in the database; re-enable only `other`.
    await setUserStatus(other.id, "active");
    const result = await setUserRole(other.id, "user");
    expect(result).toEqual({
      ok: false,
      message: "There must always be at least one active administrator.",
    });
  });

  it("reject values outside the allowed sets", async () => {
    const admin = await add("user_admin", "admin");
    const target = await add("user_target");
    signInAs(admin);
    expect((await setUserRole(target.id, "owner")).ok).toBe(false);
    expect((await setUserStatus(target.id, "banned")).ok).toBe(false);
    expect((await setUserRole("not-a-uuid", "admin")).ok).toBe(false);
    expect((await revokeUserInvitation("'; drop table users; --")).ok).toBe(false);
  });
});

describe("invitations", () => {
  it("validate the email address before calling Clerk", async () => {
    signInAs(await add("user_admin", "admin"));
    expect((await inviteUser(null, inviteForm("not-an-email"))).ok).toBe(false);
    expect(state.clerk.createInvitation).not.toHaveBeenCalled();
  });

  it("send an invitation for an administrator", async () => {
    signInAs(await add("user_admin", "admin"));
    expect(await inviteUser(null, inviteForm(" new@example.com "))).toEqual({
      ok: true,
      message: "Invitation sent to new@example.com.",
    });
    expect(state.clerk.createInvitation).toHaveBeenCalledWith(
      "new@example.com",
      "http://localhost",
    );
  });

  it("report a Clerk failure without throwing", async () => {
    signInAs(await add("user_admin", "admin"));
    state.clerk.createInvitation.mockRejectedValueOnce(new Error("duplicate"));
    expect((await inviteUser(null, inviteForm("dup@example.com"))).ok).toBe(false);
  });
});

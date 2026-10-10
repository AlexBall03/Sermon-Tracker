// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Authorization } from "@/features/auth/access";

// Clerk's Backend API and the access helper are mocked; no provider is contacted.
const state = vi.hoisted(() => ({
  access: { ok: false, message: "Your session has ended. Sign in again." } as unknown,
  updateUser: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: async () => ({ users: { updateUser: state.updateUser } }),
}));
vi.mock("@/features/auth/access", () => ({
  authorize: async (): Promise<Authorization> => state.access as Authorization,
}));

import { updateProfileName } from "./actions";

function signInAs(clerkUserId: string) {
  state.access = {
    ok: true,
    user: {
      id: "11111111-1111-4111-8111-111111111111",
      clerkUserId,
      role: "user",
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  state.updateUser.mockResolvedValue({});
  state.access = { ok: false, message: "Your session has ended. Sign in again." };
});

describe("updateProfileName", () => {
  it("rejects a signed-out caller", async () => {
    const result = await updateProfileName({ firstName: "Ada", lastName: "Lovelace" });
    expect(result.ok).toBe(false);
    expect(state.updateUser).not.toHaveBeenCalled();
  });

  it("rejects a disabled or uninvited account", async () => {
    state.access = { ok: false, message: "Your account does not have access." };
    const result = await updateProfileName({ firstName: "Ada", lastName: "" });
    expect(result).toEqual({ ok: false, message: "Your account does not have access." });
    expect(state.updateUser).not.toHaveBeenCalled();
  });

  it("validates the name before calling Clerk", async () => {
    signInAs("user_me");
    for (const input of [
      { firstName: "   ", lastName: "Lovelace" },
      { firstName: "A".repeat(65), lastName: "" },
      { firstName: "Ada", lastName: "L".repeat(65) },
      { firstName: 42, lastName: "" },
      null,
      "Ada",
    ]) {
      expect((await updateProfileName(input)).ok).toBe(false);
    }
    expect(state.updateUser).not.toHaveBeenCalled();
  });

  it("saves the trimmed name for the session's own identity", async () => {
    signInAs("user_me");
    expect(await updateProfileName({ firstName: " Ada ", lastName: " Lovelace " })).toEqual({
      ok: true,
      message: "Your name has been saved.",
    });
    expect(state.updateUser).toHaveBeenCalledWith("user_me", {
      firstName: "Ada",
      lastName: "Lovelace",
    });
  });

  it("ignores a submitted user ID, role, or status", async () => {
    signInAs("user_me");
    await updateProfileName({
      firstName: "Ada",
      lastName: "",
      userId: "user_someone_else",
      clerkUserId: "user_someone_else",
      role: "admin",
      status: "active",
      publicMetadata: { appAccess: true },
    });
    expect(state.updateUser).toHaveBeenCalledTimes(1);
    expect(state.updateUser).toHaveBeenCalledWith("user_me", { firstName: "Ada", lastName: "" });
  });

  it("reports a Clerk failure with a fixed message", async () => {
    signInAs("user_me");
    state.updateUser.mockRejectedValueOnce(new Error("provider detail that must not leak"));
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await updateProfileName({ firstName: "Ada", lastName: "" })).toEqual({
      ok: false,
      message: "Your name could not be saved. Try again.",
    });
    errorLog.mockRestore();
  });
});

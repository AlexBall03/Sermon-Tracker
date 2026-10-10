import { describe, expect, it, vi } from "vitest";

// Clerk's error predicates are mocked, so this covers our wording, not Clerk's error shapes.
vi.mock("@clerk/nextjs/errors", () => ({
  isClerkAPIResponseError: (error: unknown) =>
    typeof error === "object" && error !== null && "errors" in error,
  isReverificationCancelledError: (error: unknown) =>
    typeof error === "object" && error !== null && "cancelled" in error,
}));

import { cancelledMessage, describeAccountError } from "./clerk-errors";

const clerkError = (code: string) => ({
  errors: [{ code, message: "raw provider text", longMessage: "raw provider text, at length" }],
});

describe("describeAccountError", () => {
  it("uses our wording for known codes", () => {
    expect(describeAccountError(clerkError("form_password_incorrect"), "fallback")).toBe(
      "Your current password is not correct.",
    );
    expect(describeAccountError(clerkError("form_identifier_exists"), "fallback")).toBe(
      "That email address is already in use.",
    );
  });

  it("never passes provider text through", () => {
    expect(describeAccountError(clerkError("something_new"), "fallback")).toBe("fallback");
    expect(describeAccountError(new Error("raw detail"), "fallback")).toBe("fallback");
    expect(describeAccountError(undefined, "fallback")).toBe("fallback");
  });

  it("treats a cancelled identity check as a cancellation, not a failure to explain", () => {
    expect(describeAccountError({ cancelled: true }, "fallback")).toBe(cancelledMessage);
  });
});

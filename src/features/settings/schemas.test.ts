import { describe, expect, it } from "vitest";

import {
  avatarMaxBytes,
  emailSchema,
  fieldErrors,
  nameSchema,
  passwordSchema,
  validateAvatar,
  verificationCodeSchema,
} from "./schemas";

describe("nameSchema", () => {
  it("trims, and allows an empty last name", () => {
    expect(nameSchema.parse({ firstName: " Ada ", lastName: "" })).toEqual({
      firstName: "Ada",
      lastName: "",
    });
  });

  it("requires a first name and caps both lengths", () => {
    const blank = nameSchema.safeParse({ firstName: " ", lastName: "x".repeat(65) });
    expect(blank.success).toBe(false);
    if (!blank.success) {
      expect(fieldErrors(blank.error)).toEqual({
        firstName: "Enter your first name.",
        lastName: "Use 64 characters or fewer.",
      });
    }
  });
});

describe("emailSchema", () => {
  it("accepts and trims a valid address", () => {
    expect(emailSchema.parse(" ada@example.com ")).toBe("ada@example.com");
  });

  it("rejects anything else", () => {
    for (const value of ["", "ada", "ada@", "@example.com", `${"a".repeat(250)}@example.com`]) {
      expect(emailSchema.safeParse(value).success).toBe(false);
    }
  });
});

describe("verificationCodeSchema", () => {
  it("is exactly six digits", () => {
    expect(verificationCodeSchema.parse(" 123456 ")).toBe("123456");
    for (const value of ["12345", "1234567", "12a456", ""]) {
      expect(verificationCodeSchema.safeParse(value).success).toBe(false);
    }
  });
});

describe("passwordSchema", () => {
  it("needs eight characters and a matching confirmation", () => {
    expect(
      passwordSchema.safeParse({ newPassword: "correct horse", confirmPassword: "correct horse" })
        .success,
    ).toBe(true);

    const short = passwordSchema.safeParse({ newPassword: "short", confirmPassword: "short" });
    expect(short.success).toBe(false);

    const mismatch = passwordSchema.safeParse({
      newPassword: "correct horse",
      confirmPassword: "correct house",
    });
    expect(mismatch.success).toBe(false);
    if (!mismatch.success) {
      expect(fieldErrors(mismatch.error)).toEqual({
        confirmPassword: "The two passwords do not match.",
      });
    }
  });
});

describe("validateAvatar", () => {
  it("accepts common image types within the size limit", () => {
    expect(validateAvatar({ type: "image/png", size: 1024 })).toBeNull();
    expect(validateAvatar({ type: "image/jpeg", size: avatarMaxBytes })).toBeNull();
  });

  it("rejects other files and oversized images", () => {
    expect(validateAvatar({ type: "application/pdf", size: 1024 })).toMatch(/PNG/);
    expect(validateAvatar({ type: "image/svg+xml", size: 1024 })).toMatch(/PNG/);
    expect(validateAvatar({ type: "image/png", size: avatarMaxBytes + 1 })).toMatch(/10 MB/);
  });
});

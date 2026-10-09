import { describe, expect, it } from "vitest";

import { describeDatabaseError } from "@/db/types";
import { isAuthConfigured, parseEnv, requireDatabaseUrl } from "./env";

const url = "postgresql://owner:s3cret@ep-example.aws.neon.tech/neondb";

describe("environment", () => {
  it("parses with no Clerk or database settings", () => {
    const env = parseEnv({});
    expect(isAuthConfigured(env)).toBe(false);
    expect(() => requireDatabaseUrl(env)).toThrow("DATABASE_URL is not set");
  });

  it("needs both Clerk keys", () => {
    expect(isAuthConfigured(parseEnv({ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_x" }))).toBe(
      false,
    );
    expect(
      isAuthConfigured(
        parseEnv({ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_x", CLERK_SECRET_KEY: "sk_test_x" }),
      ),
    ).toBe(true);
  });

  it("names a malformed variable without printing its value", () => {
    const attempt = () => parseEnv({ DATABASE_URL: "mysql://owner:s3cret@host/db" });
    expect(attempt).toThrow("DATABASE_URL");
    expect(attempt).not.toThrow("s3cret");
    expect(() => parseEnv({ INITIAL_ADMIN_CLERK_USER_ID: "someone@example.com" })).toThrow();
  });
});

describe("database and deployment separation", () => {
  const at = (DATABASE_ENVIRONMENT?: string, VERCEL_ENV?: string) =>
    parseEnv({ DATABASE_URL: url, DATABASE_ENVIRONMENT, VERCEL_ENV });

  it("requires the database to be identified", () => {
    expect(() => requireDatabaseUrl(at())).toThrow("DATABASE_ENVIRONMENT");
  });

  it("lets local development and previews use only the development database", () => {
    expect(requireDatabaseUrl(at("development"))).toBe(url);
    expect(requireDatabaseUrl(at("development", "preview"))).toBe(url);
    expect(() => requireDatabaseUrl(at("production"))).toThrow();
    expect(() => requireDatabaseUrl(at("production", "preview"))).toThrow();
  });

  it("lets production use only the production database", () => {
    expect(requireDatabaseUrl(at("production", "production"))).toBe(url);
    expect(() => requireDatabaseUrl(at("development", "production"))).toThrow();
  });

  it("keeps connection strings out of error text", () => {
    const text = describeDatabaseError(new Error(`could not connect to ${url}`));
    expect(text).not.toContain("s3cret");
    expect(text).toContain("could not connect");
  });
});

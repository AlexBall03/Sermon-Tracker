import { z } from "zod";

/** Environments a database can belong to. Previews share the development database. */
export const databaseEnvironments = ["development", "production"] as const;
export type DatabaseEnvironment = (typeof databaseEnvironments)[number];

/**
 * Validated environment access. Add variables here as later phases
 * introduce them (see docs/ENVIRONMENTS.md); never read process.env
 * directly elsewhere.
 *
 * Clerk and database values are optional here so builds, static pages, and
 * tests work without credentials. Code that needs one calls the matching
 * `require…` helper at the point of use.
 */
const envSchema = z.object({
  /** Set by Vercel. Absent locally. */
  VERCEL_ENV: z.enum(["production", "preview", "development"]).optional(),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().startsWith("pk_").optional(),
  CLERK_SECRET_KEY: z.string().startsWith("sk_").optional(),
  DATABASE_URL: z
    .string()
    .regex(/^postgres(ql)?:\/\//, "must be a postgres:// connection string")
    .optional(),
  /** Which database DATABASE_URL points at. Checked against the stamp inside the database. */
  DATABASE_ENVIRONMENT: z.enum(databaseEnvironments).optional(),
  /** Clerk user ID of the first administrator. */
  INITIAL_ADMIN_CLERK_USER_ID: z
    .string()
    .regex(/^user_\w+$/, "must be a Clerk user ID")
    .optional(),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const picked = Object.fromEntries(
    Object.keys(envSchema.shape).map((key) => [key, source[key]?.trim() || undefined]),
  );
  const result = envSchema.safeParse(picked);
  if (result.success) return result.data;
  // Name the variables only; never echo their values.
  const problems = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
  throw new Error(`Invalid environment configuration. ${problems.join("; ")}`);
}

export const env = parseEnv({
  ...process.env,
  // Referenced literally so the value is also available in browser bundles.
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
});

/** Only the production deployment may be indexed; previews never are. */
export function isIndexable(vercelEnv = env.VERCEL_ENV) {
  return vercelEnv === undefined || vercelEnv === "production";
}

/** True when both Clerk keys are present. Without them the app stays public-only. */
export function isAuthConfigured(source: Env = env) {
  return Boolean(source.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && source.CLERK_SECRET_KEY);
}

/**
 * Returns the connection string, refusing a database that does not belong to
 * the running deployment: production must use the production database and
 * nothing else may.
 */
export function requireDatabaseUrl(source: Env = env) {
  if (!source.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set. See docs/ENVIRONMENTS.md.");
  }
  if (!source.DATABASE_ENVIRONMENT) {
    throw new Error("DATABASE_ENVIRONMENT is not set. See docs/ENVIRONMENTS.md.");
  }
  const expected: DatabaseEnvironment =
    source.VERCEL_ENV === "production" ? "production" : "development";
  if (source.DATABASE_ENVIRONMENT !== expected) {
    throw new Error(
      `This deployment must use the ${expected} database, but DATABASE_ENVIRONMENT is "${source.DATABASE_ENVIRONMENT}".`,
    );
  }
  return source.DATABASE_URL;
}

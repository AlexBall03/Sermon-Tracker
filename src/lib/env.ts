import { z } from "zod";

/**
 * Validated environment access. Add variables here as later phases
 * introduce them (see docs/ENVIRONMENTS.md); never read process.env
 * directly elsewhere.
 */
const envSchema = z.object({
  /** Set by Vercel. Absent locally. */
  VERCEL_ENV: z.enum(["production", "preview", "development"]).optional(),
});

export function parseEnv(source: Record<string, string | undefined>) {
  return envSchema.parse({ VERCEL_ENV: source.VERCEL_ENV || undefined });
}

export const env = parseEnv(process.env);

/** Only the production deployment may be indexed; previews never are. */
export function isIndexable(vercelEnv = env.VERCEL_ENV) {
  return vercelEnv === undefined || vercelEnv === "production";
}

import "server-only";

import { timingSafeEqual } from "node:crypto";

import { env } from "@/lib/env";

/** Whether the request carries `Authorization: Bearer <CRON_SECRET>`. Never true without a secret. */
export function isCronRequest(request: Request, secret = env.CRON_SECRET) {
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

import "server-only";

import { del, get, put } from "@vercel/blob";

import { env } from "@/lib/env";

/*
 * Screenshots in a private Vercel Blob store. Nothing here decides who may
 * see one: a stored file has no public address, and it reaches a browser only
 * through `/api/support/attachments/<id>`, which asks the database first.
 */

function options() {
  // Without a token the SDK authenticates through Vercel OIDC and BLOB_STORE_ID.
  return env.BLOB_READ_WRITE_TOKEN ? { token: env.BLOB_READ_WRITE_TOKEN } : {};
}

export async function storeScreenshot(pathname: string, bytes: Uint8Array, contentType: string) {
  await put(pathname, Buffer.from(bytes), {
    ...options(),
    access: "private",
    contentType,
    addRandomSuffix: false,
    allowOverwrite: false,
  });
}

export async function readScreenshot(pathname: string) {
  const result = await get(pathname, { ...options(), access: "private", useCache: false });
  return result?.statusCode === 200 ? result : null;
}

/** Removes stored screenshots. A failure is logged and left for the next clean-up. */
export async function deleteScreenshots(pathnames: string[]) {
  if (pathnames.length === 0) return true;
  try {
    await del(pathnames, options());
    return true;
  } catch (error) {
    console.error("Could not delete screenshots:", error instanceof Error ? error.message : error);
    return false;
  }
}

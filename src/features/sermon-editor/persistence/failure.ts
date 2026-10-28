/**
 * What is logged of a failure: its kind and SQLSTATE, and nothing else.
 * Not `describeDatabaseError`: Drizzle puts every parameter of the failed
 * query in its message, and here that is the whole document, which is never
 * logged (migration document, section 10).
 */
export function failure(error: unknown): string {
  let code: unknown;
  for (let current = error, depth = 0; current && depth < 3; depth += 1) {
    if (typeof current !== "object") break;
    code ??= (current as { code?: unknown }).code;
    current = (current as { cause?: unknown }).cause;
  }
  // Only a real SQLSTATE (five digits or capitals) and a plain name: nothing else of the error.
  const kind = error instanceof Error && /^\w{1,40}$/.test(error.name) ? error.name : "Error";
  return typeof code === "string" && /^[0-9A-Z]{5}$/.test(code) ? `${kind} (${code})` : kind;
}

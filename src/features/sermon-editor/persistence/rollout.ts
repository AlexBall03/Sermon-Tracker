/*
 * Whether an outline with no sermon document is converted when it is opened
 * (A3, the owner's decision). Off in production until A2.3D (devices told an
 * outline is converted) is live and the Vercel checks of A2.2's rollout are
 * done; then the owner sets `SERMON_DOCUMENT_CONVERSION=on` there.
 *
 * It fails closed: only the exact value "on" turns it on, except that a local
 * `next dev` with nothing set has it on. Anything else, a misspelling
 * included, is off. It only decides whether a legacy outline is converted: an
 * outline that has a document is the document's whatever this says, and
 * nothing here can give legacy writes back to it.
 *
 * Read on the server only, by the page and by `convertOutlineDocument`, which
 * refuses by itself when it is off, so a browser cannot ask for a conversion.
 */
export function conversionEnabled(
  setting: string | undefined = process.env.SERMON_DOCUMENT_CONVERSION,
  environment: string | undefined = process.env.NODE_ENV,
): boolean {
  if (setting === undefined || setting === "") return environment === "development";
  return setting === "on";
}

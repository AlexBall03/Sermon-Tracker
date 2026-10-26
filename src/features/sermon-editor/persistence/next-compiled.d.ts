/*
 * Types for two modules Next ships untyped, used only by `transport.test.ts`
 * to measure a save exactly as the framework parses and encodes it.
 */

declare module "next/dist/compiled/bytes" {
  const bytes: { parse(value: string | number): number | null };
  export default bytes;
}

declare module "next/dist/compiled/react-server-dom-webpack/client.edge" {
  /** How the client encodes a Server Action's arguments. */
  export function encodeReply(value: unknown): Promise<string | FormData>;
}

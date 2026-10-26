// @vitest-environment node
import type { JSONContent } from "@tiptap/core";
import bytes from "next/dist/compiled/bytes";
// The encoder Next's client uses for a Server Action's arguments.
import { encodeReply } from "next/dist/compiled/react-server-dom-webpack/client.edge";
import { describe, expect, it } from "vitest";

import { documentV4, pointV4, proseV4 } from "@/features/editor-lab/v4/fixtures";
import { restoreSermonDocument } from "@/features/sermon-editor/document";
import nextConfig from "../../../../next.config";
import { prepareDocument } from "./documents";
import { documentLimits, utf8Bytes } from "./model";
import { plainDocument } from "./saving";

/*
 * The document limit and the Server Action body limit are set in two places
 * (`documentLimits`, `next.config.ts`) and must stay in step (A2.3A): the
 * action must carry a document at the limit, with room for its encoding, and
 * stay under Vercel's request cap.
 */

/** Vercel Functions refuse a request body over 4.5 MB. */
const vercelRequestCap = 4_500_000;

const bodyLimit = () => {
  const configured = nextConfig.experimental?.serverActions?.bodySizeLimit;
  expect(configured).toBeDefined();
  const parsed = bytes.parse(configured as string | number);
  expect(typeof parsed).toBe("number");
  return parsed as number;
};

const canonical = (json: JSONContent) => {
  const restored = restoreSermonDocument(json);
  if (!restored.ok) throw new Error(JSON.stringify(restored.problems));
  return restored.doc.toJSON() as JSONContent;
};

/** A canonical document of exactly `documentLimits.bytes`, in one long paragraph. */
function documentAtLimit(char = "x") {
  const withText = (text: string) => documentV4([pointV4("p-1", "Long", 1), proseV4(text, 1)]);
  // What one character weighs in JSON: `"` is escaped to two bytes.
  const weight = utf8Bytes(JSON.stringify(char)) - 2;
  const base = utf8Bytes(JSON.stringify(canonical(withText(char)))) - weight;
  const room = documentLimits.bytes - base;
  const text = char.repeat(Math.floor(room / weight)) + "x".repeat(room % weight);
  const json = canonical(withText(text));
  expect(utf8Bytes(JSON.stringify(json))).toBe(documentLimits.bytes);
  return json;
}

async function encodedBytes(args: unknown[]) {
  const body = await encodeReply(args as never);
  expect(typeof body).toBe("string");
  return utf8Bytes(body as string);
}

describe("the save transport", () => {
  it("cannot carry the editor's own JSON, whose attributes have no prototype", async () => {
    const json = canonical(documentV4([pointV4("p-1", "Grace", 1)]));
    await expect(encodeReply([json] as never)).rejects.toThrow(/plain objects/);
    await expect(encodeReply([plainDocument(json)] as never)).resolves.toBeTypeOf("string");
  });

  it("is 3 MiB for a document", () => {
    expect(documentLimits.bytes).toBe(3 * 1024 * 1024);
  });

  it("lets an action carry more than the document limit, and stays under Vercel's cap", () => {
    const limit = bodyLimit();
    expect(limit).toBeGreaterThanOrEqual(documentLimits.bytes + 512 * 1024);
    expect(limit).toBeLessThanOrEqual(vercelRequestCap);
  });

  it("encodes a save of a document at the limit within the body limit", async () => {
    const outlineId = "0b6a3c1e-9d54-4c7e-8a55-1f1f6d3b2a10";
    for (const char of ["x", "é", "😀", '"']) {
      const json = documentAtLimit(char);
      expect(prepareDocument(json).ok).toBe(true);
      const body = await encodedBytes([outlineId, plainDocument(json), 2_147_483_647]);
      // The arguments' encoding adds little beyond the JSON itself.
      expect(body - documentLimits.bytes).toBeLessThan(4 * 1024);
      expect(body).toBeLessThan(bodyLimit());
    }
  });
});

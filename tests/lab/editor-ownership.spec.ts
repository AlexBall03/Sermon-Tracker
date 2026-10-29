import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";

import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { build } from "esbuild";

/*
 * Editor sessions in a real browser (A2.3B.3): the session modules on
 * Chromium's own Web Locks, BroadcastChannel, IndexedDB, and page events,
 * with pages of one browser context standing for tabs of one profile.
 *
 * The page is the harness (ownership-harness.ts), bundled here with esbuild
 * and served from 127.0.0.1 (a secure context, where Web Locks exist) by a
 * Node server that also plays the document server: it writes only at the
 * revision a save names, and can hold saves unanswered. Nothing of the
 * application runs: no route, no development server, no database.
 */

const owner = "4f1c2d3e-0000-4000-8000-00000000a11c";
let outline = "";
let counter = 0;
const nextOutline = () =>
  `0b6a3c1e-9d54-4c7e-8a55-${(counter += 1).toString(16).padStart(12, "0")}`;

const R0 = 8;
const doc = { content: null as unknown, revision: R0, writes: 0, saves: 0, hold: false };
const held: (() => void)[] = [];

let server: Server;
let base = "";
let bundle = "";

const page = `<!doctype html><html><head><meta charset="utf-8"><title>Ownership</title></head>
<body><p>Editor session harness</p><script src="/harness.js"></script></body></html>`;

function body(request: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let text = "";
    request.on("data", (chunk) => (text += chunk));
    request.on("end", () => resolve(text));
  });
}

function json(response: ServerResponse, value: unknown) {
  response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
  response.end(JSON.stringify(value));
}

test.beforeAll(async () => {
  const built = await build({
    entryPoints: [path.join(__dirname, "ownership-harness.ts")],
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2022",
    write: false,
    define: { "process.env.NODE_ENV": '"production"' },
    logLevel: "silent",
  });
  bundle = built.outputFiles[0].text;

  server = createServer(async (request, response) => {
    const url = request.url ?? "/";
    if (url === "/" || url === "/other") {
      response.writeHead(200, { "content-type": "text/html" });
      response.end(url === "/" ? page : "<!doctype html><title>Other</title><p>Elsewhere</p>");
      return;
    }
    if (url === "/harness.js") {
      response.writeHead(200, { "content-type": "text/javascript" });
      response.end(bundle);
      return;
    }
    if (url === "/reset") {
      doc.content = JSON.parse(await body(request));
      json(response, { ok: true });
      return;
    }
    if (url.startsWith("/read")) {
      json(response, { kind: "found", content: doc.content, revision: doc.revision });
      return;
    }
    if (url === "/save") {
      const saved = JSON.parse(await body(request)) as {
        content: unknown;
        expectedRevision: number;
        sequence: number;
      };
      doc.saves += 1;
      const commit = () => {
        if (saved.expectedRevision !== doc.revision) {
          return {
            kind: "conflict",
            sequence: saved.sequence,
            code: "stale",
            revision: doc.revision,
          };
        }
        doc.content = saved.content;
        doc.revision += 1;
        doc.writes += 1;
        return { kind: "confirmed", sequence: saved.sequence, revision: doc.revision };
      };
      if (doc.hold) held.push(() => json(response, commit()));
      else json(response, commit());
      return;
    }
    response.writeHead(404);
    response.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

test.afterAll(async () => {
  for (const answer of held.splice(0)) answer();
  await new Promise((resolve) => server.close(resolve));
});

test.beforeEach(() => {
  outline = nextOutline();
  Object.assign(doc, { content: null, revision: R0, writes: 0, saves: 0, hold: false });
  for (const answer of held.splice(0)) answer();
});

type Harness = {
  log: string[];
  canonical(words: string): unknown;
  open(owner: string, outline: string): void;
  kind(): string;
  revision(): number | null;
  takeoverState(): string | null;
  attach(): boolean;
  edit(words: string): boolean;
  canEdit(): boolean;
  takeover(): void;
  recheck(): void;
  status(): string | null;
  drafts(owner: string, outline: string): Promise<string[]>;
  units(): Promise<
    { head: string | null; ancestors: (string | null)[]; restorable: boolean }[] | null
  >;
  restore(): Promise<string>;
  dispose(): Promise<void>;
};
declare global {
  interface Window {
    harness: Harness;
  }
}

async function tab(context: BrowserContext, { start = true } = {}) {
  const opened = await context.newPage();
  await opened.goto(`${base}/`);
  if (doc.content === null) {
    const content = await opened.evaluate(() => window.harness.canonical("Opened"));
    await opened.evaluate(
      (value) => fetch("/reset", { method: "POST", body: JSON.stringify(value) }),
      content,
    );
  }
  if (start)
    await opened.evaluate(([o, id]) => window.harness.open(o, id), [owner, outline] as const);
  return opened;
}

const kind = (target: Page) => target.evaluate(() => window.harness.kind());
const drafts = (target: Page) =>
  target.evaluate(([o, id]) => window.harness.drafts(o, id), [owner, outline] as const);

async function editor(target: Page) {
  await expect.poll(() => kind(target)).toBe("ready");
  expect(await target.evaluate(() => window.harness.attach())).toBe(true);
}

test("one tab edits; another is read only and never becomes editable by itself", async ({
  context,
}) => {
  const a = await tab(context);
  await editor(a);
  const b = await tab(context);
  await expect.poll(() => kind(b)).toBe("read_only");
  expect(await b.evaluate(() => window.harness.attach())).toBe(false);
  expect(await b.evaluate(() => window.harness.edit("Not allowed"))).toBe(false);

  await a.close();
  await b.waitForTimeout(1_500);
  expect(await kind(b)).toBe("read_only");
  expect(await b.evaluate(() => window.harness.canEdit())).toBe(false);

  await b.evaluate(() => window.harness.takeover());
  await expect.poll(() => kind(b)).toBe("ready");
});

test("two tabs opening at once: exactly one gets the lock", async ({ context }) => {
  const a = await tab(context, { start: false });
  const b = await tab(context, { start: false });
  await Promise.all(
    [a, b].map((target) =>
      target.evaluate(([o, id]) => window.harness.open(o, id), [owner, outline] as const),
    ),
  );
  await expect
    .poll(async () => [await kind(a), await kind(b)].sort().join())
    .toBe("read_only,ready");
});

test("hands over cleanly: the newest words saved, then the other tab verifies", async ({
  context,
}) => {
  const a = await tab(context);
  await editor(a);
  const b = await tab(context);
  await expect.poll(() => kind(b)).toBe("read_only");
  expect(await a.evaluate(() => window.harness.edit("Typed in A"))).toBe(true);
  await b.evaluate(() => window.harness.takeover());
  await expect.poll(() => kind(a)).toBe("lost");
  await expect.poll(() => kind(b)).toBe("ready");
  expect(await b.evaluate(() => window.harness.revision())).toBe(R0 + 1);
  expect(doc.writes).toBe(1);
  expect(JSON.stringify(doc.content)).toContain("Typed in A");
  expect(await drafts(b)).toEqual([]);
  expect(await a.evaluate(() => window.harness.edit("After"))).toBe(false);
});

test("a tab closed with a save in flight: its words survive in IndexedDB, nothing is resent", async ({
  context,
}) => {
  doc.hold = true;
  const a = await tab(context);
  await editor(a);
  expect(await a.evaluate(() => window.harness.edit("Unanswered"))).toBe(true);
  await expect.poll(() => doc.saves).toBe(1);
  await expect.poll(() => drafts(a)).toEqual(["ok"]);
  await a.close();

  const b = await tab(context);
  await expect.poll(() => kind(b)).toBe("recovery_required");
  // Reopening another tab later finds the same.
  const c = await tab(context);
  await expect.poll(() => kind(c)).toBe("read_only");

  // The original lands after all (its tab will never hear): the draft now says what the server says.
  doc.hold = false;
  held.splice(0).forEach((answer) => answer());
  await b.evaluate(() => window.harness.recheck());
  await expect.poll(() => kind(b)).toBe("ready");
  expect(await b.evaluate(() => window.harness.revision())).toBe(R0 + 1);
  expect(doc.saves).toBe(1);
  expect(doc.writes).toBe(1);
});

test("a fresh tab after every tab closed still waits for recovery", async ({ context }) => {
  doc.hold = true;
  const a = await tab(context);
  await editor(a);
  await a.evaluate(() => window.harness.edit("Left behind"));
  await expect.poll(() => drafts(a)).toEqual(["ok"]);
  await a.close();
  const b = await tab(context);
  await expect.poll(() => kind(b)).toBe("recovery_required");
  expect(await b.evaluate(() => window.harness.canEdit())).toBe(false);
});

test("navigating away ends the session, keeps the draft, and frees the lock", async ({
  context,
}) => {
  doc.hold = true;
  const a = await tab(context);
  await editor(a);
  await a.evaluate(() => window.harness.edit("Before navigating"));
  await expect.poll(() => drafts(a)).toEqual(["ok"]);
  const b = await tab(context);
  await expect.poll(() => kind(b)).toBe("read_only");

  await a.goto(`${base}/other`);
  await b.evaluate(() => window.harness.takeover());
  await expect.poll(() => kind(b)).toBe("recovery_required");

  // Back: from the back-forward cache (the session is ended) or loaded afresh (no session).
  await a.goBack();
  const restored = await a.evaluate(() => ({
    kind: window.harness.kind(),
    log: window.harness.log,
    canEdit: window.harness.canEdit(),
  }));
  test.info().annotations.push({
    type: "back-forward cache",
    description: restored.log.includes("pageshow:true")
      ? `restored from bfcache; session ${restored.kind}`
      : `not restored from bfcache (fresh load); session ${restored.kind}`,
  });
  expect(restored.canEdit).toBe(false);
  expect(["lost", "none"]).toContain(restored.kind);
});

test("A2.3C: restores a closed tab's unsent words, saves them conditionally, then cleans up the original", async ({
  context,
}) => {
  doc.hold = true;
  const a = await tab(context);
  await editor(a);
  expect(await a.evaluate(() => window.harness.edit("Never answered"))).toBe(true);
  await expect.poll(() => doc.saves).toBe(1);
  await expect.poll(() => drafts(a)).toEqual(["ok"]);
  await a.close();
  // The request is lost: the server never wrote it.
  held.splice(0);
  doc.hold = false;

  const b = await tab(context);
  await expect.poll(() => kind(b)).toBe("recovery_required");
  expect(await b.evaluate(() => window.harness.restore())).toBe("restored");
  await expect.poll(() => kind(b)).toBe("ready");
  // Durable before editing: the original and the restored draft are both in real IndexedDB.
  expect(await drafts(b)).toEqual(["ok", "ok"]);
  expect(await b.evaluate(() => window.harness.attach())).toBe(true);
  expect(await b.evaluate(() => window.harness.status())).not.toBe("saved");
  await expect
    .poll(() => b.evaluate(() => window.harness.status()), { timeout: 15_000 })
    .toBe("saved");
  expect(doc.writes).toBe(1);
  expect(JSON.stringify(doc.content)).toContain("Never answered");
  await expect.poll(() => drafts(b)).toEqual([]);
});

test("A2.3C: a tab closed straight after restoring leaves the work for the next one, with its original", async ({
  context,
}) => {
  doc.hold = true;
  const a = await tab(context);
  await editor(a);
  await a.evaluate(() => window.harness.edit("Left behind"));
  await expect.poll(() => drafts(a)).toEqual(["ok"]);
  await a.close();
  held.splice(0);
  doc.hold = false;

  const b = await tab(context);
  await expect.poll(() => kind(b)).toBe("recovery_required");
  expect(await b.evaluate(() => window.harness.restore())).toBe("restored");
  await b.close();

  const c = await tab(context);
  await expect.poll(() => kind(c)).toBe("recovery_required");
  const units = await c.evaluate(() => window.harness.units());
  expect(units).toHaveLength(1);
  expect(units![0].ancestors).toHaveLength(1);
  expect(units![0].restorable).toBe(true);
  expect(await c.evaluate(() => window.harness.restore())).toBe("restored");
  await expect.poll(() => kind(c)).toBe("ready");
  expect(await c.evaluate(() => window.harness.attach())).toBe(true);
  await expect
    .poll(() => c.evaluate(() => window.harness.status()), { timeout: 15_000 })
    .toBe("saved");
  expect(doc.writes).toBe(1);
  await expect.poll(() => drafts(c)).toEqual([]);
});

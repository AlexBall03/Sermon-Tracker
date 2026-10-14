// @vitest-environment node
import { runInNewContext } from "node:vm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { serviceWorkerSource } from "./service-worker";

/*
 * The worker's script, run as the browser would run it, against a stand-in
 * for the worker's globals: its event listeners, `caches`, and `fetch`.
 */

const origin = "https://sermontracker.com";

type Listener = (event: unknown) => void;

/** A minimal Cache Storage: keys are paths, values are Responses. */
function fakeCaches() {
  const stores = new Map<string, Map<string, Response>>();
  const keyOf = (request: Request | string, ignoreSearch = false) => {
    const url = new URL(typeof request === "string" ? request : request.url, origin);
    return ignoreSearch ? url.pathname : url.pathname + url.search;
  };
  const open = async (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name)!;
    return {
      async match(request: Request | string, options?: { ignoreSearch?: boolean }) {
        const wanted = keyOf(request, options?.ignoreSearch);
        for (const [key, value] of store) {
          const candidate = options?.ignoreSearch ? new URL(key, origin).pathname : key;
          if (candidate === wanted) return value.clone();
        }
        return undefined;
      },
      async put(request: Request | string, response: Response) {
        store.set(keyOf(request), response);
      },
      async add(request: string) {
        const response = await sandbox.fetch(request);
        if (!response.ok) throw new Error("add failed");
        store.set(keyOf(request), response);
      },
      async addAll(requests: string[]) {
        for (const request of requests) await this.add(request);
      },
    };
  };
  return {
    stores,
    open,
    async keys() {
      return [...stores.keys()];
    },
    async delete(name: string) {
      return stores.delete(name);
    },
  };
}

let listeners: Record<string, Listener>;
let caches: ReturnType<typeof fakeCaches>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sandbox: any;
let network: (request: Request | string, init?: RequestInit) => Promise<Response>;

/** A basic (same-origin) response, as `fetch` gives one. */
function basic(body: string, init: ResponseInit = {}) {
  const response = new Response(body, { status: 200, ...init });
  Object.defineProperty(response, "type", { value: "basic" });
  return response;
}

function load(version = "v1") {
  listeners = {};
  caches = fakeCaches();
  sandbox = {
    URL,
    Request,
    Response,
    Promise,
    Error,
    Boolean,
    caches,
    fetch: (request: Request | string, init?: RequestInit) => network(request, init),
    self: {
      location: new URL(origin),
      registration: { navigationPreload: { enable: vi.fn(async () => {}) } },
      clients: { claim: vi.fn(async () => {}) },
      skipWaiting: vi.fn(),
      addEventListener: (type: string, listener: Listener) => {
        listeners[type] = listener;
      },
    },
  };
  runInNewContext(serviceWorkerSource(version), sandbox);
}

function request(path: string, init: RequestInit & { mode?: RequestMode } = {}) {
  const { mode, ...rest } = init;
  const made = new Request(new URL(path, origin), rest);
  // Request refuses to be constructed in "navigate" mode, so it is said afterwards.
  if (mode) Object.defineProperty(made, "mode", { value: mode });
  return made;
}

/** Dispatches a fetch event; resolves with what the worker answered, or "untouched". */
async function dispatch(made: Request, preload?: Promise<Response | undefined>) {
  let answer: Promise<Response> | undefined;
  const waits: Promise<unknown>[] = [];
  listeners.fetch({
    request: made,
    preloadResponse: preload ?? Promise.resolve(undefined),
    respondWith: (value: Promise<Response>) => {
      answer = value;
    },
    waitUntil: (value: Promise<unknown>) => waits.push(value),
  });
  if (!answer) return "untouched" as const;
  const response = await answer;
  await Promise.all(waits);
  return response;
}

async function install() {
  let done: Promise<unknown> = Promise.resolve();
  listeners.install({ waitUntil: (value: Promise<unknown>) => (done = value) });
  await done;
}

const offlineHtml = `<!doctype html><html><head>
<link rel="stylesheet" href="/_next/static/css/app.css"/>
<script src="/_next/static/chunks/main.js" async></script>
</head><body><script>self.__next_f.push([1,"I[1,[\\"static/chunks/offline.js\\"]]"])</script></body></html>`;

beforeEach(() => {
  network = async (input) => {
    const path = new URL(typeof input === "string" ? input : input.url, origin).pathname;
    if (path === "/offline")
      return basic(offlineHtml, { headers: { "Content-Type": "text/html" } });
    if (path === "/_next/static/css/app.css") {
      return basic("@font-face{src:url(../media/figtree.woff2) format('woff2')}");
    }
    return basic(`file ${path}`);
  };
  load();
});

describe("which requests the worker answers", () => {
  it("answers pages, static files, and public files, and nothing else", () => {
    const route = sandbox.route as (request: Request) => string | null;
    expect(route(request("/dashboard", { mode: "navigate" }))).toBe("navigate");
    expect(route(request("/_next/static/chunks/a.js"))).toBe("static");
    expect(route(request("/brand/icon-192.png"))).toBe("public");
    expect(route(request("/manifest.webmanifest"))).toBe("public");

    // Never the router's data, an action, the API, Clerk, images, or another site.
    expect(route(request("/dashboard", { headers: { RSC: "1" } }))).toBeNull();
    expect(route(request("/dashboard?_rsc=abc"))).toBeNull();
    expect(route(request("/library", { headers: { "Next-Router-Prefetch": "1" } }))).toBeNull();
    expect(
      route(request("/library", { method: "POST", headers: { "Next-Action": "x" } })),
    ).toBeNull();
    expect(route(request("/api/bible/1/1"))).toBeNull();
    expect(route(request("/__clerk/v1/client"))).toBeNull();
    expect(route(request("/_next/image?url=%2Fa.png&w=64&q=75"))).toBeNull();
    expect(route(request("https://clerk.sermontracker.com/v1/client"))).toBeNull();
    expect(route(request("/dashboard"))).toBeNull();
  });

  it("leaves a request it does not answer entirely to the network", async () => {
    expect(await dispatch(request("/api/ideas/search?q=x"))).toBe("untouched");
    expect(await dispatch(request("/dashboard", { headers: { RSC: "1" } }))).toBe("untouched");
    expect(caches.stores.size).toBe(0);
  });
});

describe("installing", () => {
  it("keeps the offline page, without credentials, and the files it needs", async () => {
    const seen: { path: string; credentials?: RequestCredentials }[] = [];
    const inner = network;
    network = async (input, init) => {
      const path = new URL(typeof input === "string" ? input : input.url, origin).pathname;
      seen.push({ path, credentials: init?.credentials });
      return inner(input, init);
    };
    await install();

    expect(seen.find((entry) => entry.path === "/offline")?.credentials).toBe("omit");
    const kept = [...caches.stores.get("st-v1")!.keys()].sort();
    expect(kept).toEqual(
      [
        "/_next/static/chunks/main.js",
        "/_next/static/chunks/offline.js",
        "/_next/static/css/app.css",
        "/_next/static/media/figtree.woff2",
        "/apple-icon.png",
        "/brand/icon-192.png",
        "/brand/icon-512.png",
        "/brand/icon-maskable-192.png",
        "/brand/icon-maskable-512.png",
        "/icon.svg",
        "/manifest.webmanifest",
        "/offline",
      ].sort(),
    );
    // An update waits to be asked.
    expect(sandbox.self.skipWaiting).not.toHaveBeenCalled();
  });

  it("fails the install when the offline page cannot be fetched", async () => {
    network = async () => basic("no", { status: 500 });
    await expect(install()).rejects.toThrow();
  });
});

describe("pages", () => {
  beforeEach(install);

  it("are fetched from the network and never stored", async () => {
    const response = await dispatch(request("/dashboard", { mode: "navigate" }));
    expect(response).not.toBe("untouched");
    expect(await (response as Response).text()).toBe("file /dashboard");
    expect(caches.stores.get("st-v1")!.has("/dashboard")).toBe(false);
  });

  it("pass the server's own answer on, a redirect to sign-in included", async () => {
    network = async () =>
      basic("", { status: 307, headers: { Location: "/sign-in?redirect_url=%2Fdashboard" } });
    const response = (await dispatch(request("/dashboard", { mode: "navigate" }))) as Response;
    expect(response.status).toBe(307);
  });

  it("use the navigation preload when there is one", async () => {
    const preloaded = basic("preloaded");
    const response = (await dispatch(
      request("/library", { mode: "navigate" }),
      Promise.resolve(preloaded),
    )) as Response;
    expect(await response.text()).toBe("preloaded");
  });

  it("show the offline page only when the network cannot be reached", async () => {
    network = async () => {
      throw new TypeError("Failed to fetch");
    };
    const response = (await dispatch(request("/outlines/abc", { mode: "navigate" }))) as Response;
    expect(await response.text()).toBe(offlineHtml);
  });
});

describe("files", () => {
  it("serves a static file from the cache first and keeps only a good answer", async () => {
    let calls = 0;
    network = async (input) => {
      calls += 1;
      const path = new URL(typeof input === "string" ? input : input.url, origin).pathname;
      return path.endsWith("bad.js") ? basic("missing", { status: 404 }) : basic("chunk");
    };
    await dispatch(request("/_next/static/chunks/a.js"));
    const again = (await dispatch(request("/_next/static/chunks/a.js?dpl=x"))) as Response;
    expect(await again.text()).toBe("chunk");
    expect(calls).toBe(1);

    await dispatch(request("/_next/static/chunks/bad.js"));
    expect(caches.stores.get("st-v1")!.has("/_next/static/chunks/bad.js")).toBe(false);
  });

  it("never keeps an opaque answer", async () => {
    network = async () => new Response("opaque");
    await dispatch(request("/_next/static/chunks/b.js"));
    expect(caches.stores.get("st-v1")?.has("/_next/static/chunks/b.js") ?? false).toBe(false);
  });

  it("refreshes a public file behind the copy it serves", async () => {
    network = async () => basic("first");
    await dispatch(request("/brand/icon-192.png"));
    network = async () => basic("second");
    const served = (await dispatch(request("/brand/icon-192.png"))) as Response;
    expect(await served.text()).toBe("first");
    const kept = await (await caches.open("st-v1")).match("/brand/icon-192.png");
    expect(await kept!.text()).toBe("second");
  });
});

describe("versions", () => {
  it("removes the caches of other versions, and only its own", async () => {
    await caches.open("st-old");
    await caches.open("someone-else");
    load("v2");
    caches.stores.set("st-old", new Map());
    caches.stores.set("someone-else", new Map());
    caches.stores.set("st-v2", new Map());
    let done: Promise<unknown> = Promise.resolve();
    listeners.activate({ waitUntil: (value: Promise<unknown>) => (done = value) });
    await done;
    expect([...caches.stores.keys()].sort()).toEqual(["someone-else", "st-v2"]);
    expect(sandbox.self.clients.claim).toHaveBeenCalled();
    expect(sandbox.self.registration.navigationPreload.enable).toHaveBeenCalled();
  });

  it("takes over only when asked, and says its version", () => {
    const port = { postMessage: vi.fn() };
    listeners.message({ data: { type: "GET_VERSION" }, ports: [port] });
    expect(port.postMessage).toHaveBeenCalledWith({ version: "v1" });
    expect(sandbox.self.skipWaiting).not.toHaveBeenCalled();
    listeners.message({ data: { type: "SKIP_WAITING" }, ports: [] });
    expect(sandbox.self.skipWaiting).toHaveBeenCalled();
  });

  it("writes the version in as a string", () => {
    expect(serviceWorkerSource('a"b')).toContain('var VERSION = "a\\"b";');
  });
});

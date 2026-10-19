/*
 * The service worker, as the script the browser runs. It is served at
 * `/sw.js` by `app/sw.js/route.ts` with this build's version written into it,
 * so each deployment is a different script and the browser finds the update
 * by itself.
 *
 * What it does is deliberately small (Phase 5A), and it is an allowlist:
 *
 * - A page (a navigation) always goes to the network and is never stored.
 *   Only when the network cannot be reached at all is the offline page shown
 *   instead. Any answer the server gives, a redirect to sign-in included, is
 *   passed on as it came, so being offline never looks like being signed out.
 * - `/_next/static/…` (hashed, the same for everyone, never changed) is kept
 *   and served from the cache first.
 * - The icons and the manifest are served from the cache and refreshed behind.
 * - Everything else is not touched: Server Component payloads, Server
 *   Actions, `/api`, Clerk, images, and anything from another origin go to the
 *   network as if there were no worker. No account's data is ever stored.
 *
 * The one page kept is `/offline`, fetched without credentials so it cannot
 * carry anything of an account, together with the static files it needs.
 * Each version keeps one cache, `st-<version>`; activating removes the others.
 * A new version waits until the page asks it to take over (`SKIP_WAITING`),
 * which the application does only when nothing unsaved would be lost
 * (features/pwa/pwa-provider.tsx).
 *
 * Later phases (5B and on) keep account data in IndexedDB, not here, and add
 * their own messages beside the two below.
 *
 * Written as plain script text, not a module: it must run as it is, in the
 * worker, with nothing bundled into it. `service-worker.test.ts` runs it.
 */

const script = String.raw`
"use strict";

var PREFIX = "st-";
var CACHE = PREFIX + VERSION;
var OFFLINE = "/offline";

/** Public files the worker keeps beside the static build: icons and the manifest. */
var PUBLIC_FILES = [
  "/manifest.webmanifest",
  "/icon.svg",
  "/apple-icon.png",
  "/brand/icon-192.png",
  "/brand/icon-512.png",
  "/brand/icon-maskable-192.png",
  "/brand/icon-maskable-512.png",
];

/** Headers that mark a request as the router's or a Server Action's, never a file. */
var NEXT_HEADERS = ["rsc", "next-action", "next-router-state-tree", "next-router-prefetch", "next-router-segment-prefetch"];

/**
 * How a request is answered: "navigate", "static", "public", or null for
 * "not this worker's business", which leaves it to the network untouched.
 */
function route(request) {
  if (request.method !== "GET") return null;
  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return null;
  if (url.searchParams.has("_rsc")) return null;
  for (var i = 0; i < NEXT_HEADERS.length; i++) {
    if (request.headers.has(NEXT_HEADERS[i])) return null;
  }
  if (request.mode === "navigate") return "navigate";
  if (url.pathname.indexOf("/_next/static/") === 0) return "static";
  if (url.pathname.indexOf("/brand/") === 0 || PUBLIC_FILES.indexOf(url.pathname) !== -1) {
    return "public";
  }
  return null;
}

/** Only a whole, same-origin, successful answer is ever stored. */
function storable(response) {
  return Boolean(response) && response.ok && response.type === "basic";
}

/** The build's static files named in a page: its scripts, styles, and the chunks its payload lists. */
function staticUrls(html) {
  var found = html.match(/(?:\/_next\/)?static\/(?:chunks|css|media)\/[A-Za-z0-9._~\/-]+/g) || [];
  var urls = [];
  for (var i = 0; i < found.length; i++) {
    var path = "/_next/" + found[i].replace(/^\/_next\//, "");
    if (urls.indexOf(path) === -1) urls.push(path);
  }
  return urls;
}

/** The files a stylesheet loads (its fonts), as same-origin static paths. */
function cssUrls(css, base) {
  var urls = [];
  var pattern = /url\(\s*['"]?([^'")]+)['"]?\s*\)/g;
  var match;
  while ((match = pattern.exec(css)) !== null) {
    if (match[1].indexOf("data:") === 0) continue;
    var url = new URL(match[1], base);
    if (url.origin !== self.location.origin) continue;
    if (url.pathname.indexOf("/_next/static/") !== 0) continue;
    if (urls.indexOf(url.pathname) === -1) urls.push(url.pathname);
  }
  return urls;
}

/** Keeps the offline page and everything it needs to be drawn. */
async function keepOfflinePage() {
  var cache = await caches.open(CACHE);
  // Without credentials: what is kept can hold nothing of an account, and sets no cookie.
  var page = await fetch(OFFLINE, { credentials: "omit", cache: "no-store" });
  if (!storable(page)) throw new Error("The offline page could not be fetched: " + page.status);
  var assets = staticUrls(await page.clone().text());
  await cache.addAll(assets);
  // Fonts and icons make it look right; the page still works without them.
  var extras = PUBLIC_FILES.slice();
  for (var i = 0; i < assets.length; i++) {
    if (!/\.css$/.test(assets[i])) continue;
    var sheet = await cache.match(assets[i]);
    if (sheet) extras = extras.concat(cssUrls(await sheet.text(), self.location.origin + assets[i]));
  }
  await Promise.all(
    extras.map(function (url) {
      return cache.add(url).catch(function () {});
    }),
  );
  await cache.put(OFFLINE, page);
}

async function navigate(event) {
  try {
    var preloaded = await event.preloadResponse;
    if (preloaded) return preloaded;
    return await fetch(event.request);
  } catch (error) {
    // Only a network failure comes here: the server's own answers were returned above.
    var cache = await caches.open(CACHE);
    var offline = await cache.match(OFFLINE);
    if (offline) return offline;
    throw error;
  }
}

async function cacheFirst(request) {
  var cache = await caches.open(CACHE);
  // A static file's name is its content; a deployment's query string does not change it.
  var kept = await cache.match(request, { ignoreSearch: true });
  if (kept) return kept;
  var response = await fetch(request);
  if (storable(response)) await cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(event) {
  var cache = await caches.open(CACHE);
  var kept = await cache.match(event.request, { ignoreSearch: true });
  var fresh = fetch(event.request)
    .then(function (response) {
      if (storable(response)) return cache.put(event.request, response.clone()).then(function () {
        return response;
      });
      return response;
    })
    .catch(function () {
      return undefined;
    });
  event.waitUntil(fresh);
  return kept || (await fresh) || Response.error();
}

self.addEventListener("install", function (event) {
  // No skipWaiting: an update waits until the page asks (see "message").
  event.waitUntil(keepOfflinePage());
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    (async function () {
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
      var names = await caches.keys();
      await Promise.all(
        names
          .filter(function (name) {
            return name.indexOf(PREFIX) === 0 && name !== CACHE;
          })
          .map(function (name) {
            return caches.delete(name);
          }),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", function (event) {
  var kind = route(event.request);
  if (kind === "navigate") event.respondWith(navigate(event));
  else if (kind === "static") event.respondWith(cacheFirst(event.request));
  else if (kind === "public") event.respondWith(staleWhileRevalidate(event));
});

self.addEventListener("message", function (event) {
  var type = event.data && event.data.type;
  if (type === "SKIP_WAITING") self.skipWaiting();
  else if (type === "GET_VERSION" && event.ports && event.ports[0]) {
    event.ports[0].postMessage({ version: VERSION });
  }
});

// Web Push (features/notifications): show what the server sent, which is never
// anything a person wrote, tell open windows to ask again, and open only an
// address inside the application.
function safePath(value) {
  try {
    var url = new URL(typeof value === "string" ? value : "/dashboard", self.location.origin);
    if (url.origin !== self.location.origin) return "/dashboard";
    return url.pathname + url.search;
  } catch (e) {
    return "/dashboard";
  }
}

self.addEventListener("push", function (event) {
  var data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = {};
  }
  var shown = self.registration.showNotification(String(data.title || "Sermon Tracker"), {
    body: typeof data.body === "string" ? data.body : "",
    tag: typeof data.tag === "string" ? data.tag : undefined,
    icon: "/brand/icon-192.png",
    badge: "/brand/icon-192.png",
    data: { url: safePath(data.url) },
  });
  event.waitUntil(Promise.all([shown, tellWindows()]));
});

// Tells the application's open windows that their notifications changed, so a
// bell asks again (features/notifications/refresh.ts). The message is the type
// alone: nothing of the push, the account, or the ticket. It never fails the push.
async function tellWindows() {
  try {
    var windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (var i = 0; i < windows.length; i++) {
      try {
        if (new URL(windows[i].url).origin !== self.location.origin) continue;
        windows[i].postMessage({ type: "NOTIFICATIONS_CHANGED" });
      } catch (e) {}
    }
  } catch (e) {}
}

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var path = safePath(event.notification.data && event.notification.data.url);
  event.waitUntil(
    (async function () {
      var windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (var i = 0; i < windows.length; i++) {
        var client = windows[i];
        if (new URL(client.url).origin === self.location.origin && "focus" in client) {
          await client.focus();
          if ("navigate" in client) await client.navigate(path).catch(function () {});
          return;
        }
      }
      await self.clients.openWindow(path);
    })(),
  );
});
`;

/** The worker's script for one version of the application. */
export function serviceWorkerSource(version: string): string {
  return `var VERSION = ${JSON.stringify(version)};\n${script.trimStart()}`;
}

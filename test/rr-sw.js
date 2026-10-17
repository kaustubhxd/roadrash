// Road Rash evaluation: the page's service worker.
// 1. Cross-origin isolation: adds COOP/COEP/CORP to every response, which the
//    game's shared memory needs and static hosts like GitHub Pages can't send
//    (this replaces coi-serviceworker).
// 2. Game file cache: anything under rr/ (except crypt.json) is kept in Cache
//    Storage after its first download and served from there afterwards, also
//    to the game's synchronous reads, so a file is fetched over the network once.

const CACHE = "rr-files-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

// The page names the current encrypted folder; drop files of older ones.
self.addEventListener("message", (e) => {
  const keep = e.data && e.data.rrKeepDir;
  if (keep === undefined) return;
  e.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      for (const req of await cache.keys()) {
        const m = new URL(req.url).pathname.match(/\/rr\/(v[0-9a-f]+)\//);
        if (m && m[1] + "/" !== keep) await cache.delete(req);
      }
    }),
  );
});

function isolate(res) {
  if (res.status === 0) return res;
  const headers = new Headers(res.headers);
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Cross-Origin-Embedder-Policy", "require-corp");
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

async function gameFile(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req.url);
  if (hit) return hit;
  const res = await fetch(req.url);
  if (res.ok) {
    const out = isolate(res);
    await cache.put(req.url, out.clone());
    return out;
  }
  return isolate(res);
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  const path = new URL(req.url).pathname;
  if (/\/rr\/./.test(path) && !path.endsWith("/rr/crypt.json") && !req.headers.has("range")) {
    e.respondWith(gameFile(req));
  } else {
    e.respondWith(fetch(req).then(isolate));
  }
});

const CACHE_NAME = "sitesafety-shell-v1";
const SHELL_URLS = [
  "/",
  "/report",
  "/dashboard",
  "/manifest.json",
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await Promise.allSettled(SHELL_URLS.map((url) => cache.add(url)));
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }

  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(request));
  }
});

function isStaticAsset(pathname) {
  return (
    pathname.startsWith("/_next/static/") ||
    pathname.startsWith("/icons/") ||
    pathname === "/manifest.json" ||
    pathname === "/sw.js" ||
    /\.(?:js|css|png|jpg|jpeg|svg|webp|woff2|ico|json)$/i.test(pathname)
  );
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || (await caches.match("/report")) || (await caches.match("/"));
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    void updateCache(request);
    return cached;
  }
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
}

async function updateCache(request) {
  try {
    const response = await fetch(request);
    if (!response.ok) return;
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  } catch {
    // Stay on the cached shell when the site radio drops.
  }
}

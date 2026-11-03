/*
 * laundriroom service worker.
 * Required for the browser install prompt and basic offline behaviour.
 * Strategy: network-first for page navigations (so app code is never stale),
 * falling back to a cached shell / offline page when the network is unavailable.
 * Static assets are served cache-first. Supabase/API calls are never cached.
 */
const CACHE = "laundriroom-v2";
const OFFLINE_URL = "/offline.html";
const PRECACHE = ["/offline.html", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/brand/mark-light.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Never cache cross-origin (Supabase, Paystack, fonts) or API/auth routes.
  const isApi = url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/");
  if (url.origin !== self.location.origin || isApi) return;

  // Page navigations: network-first, offline fallback.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match(req).then((r) => r || caches.match(OFFLINE_URL)))
    );
    return;
  }

  // Static assets: cache-first, then network (and cache a copy).
  event.respondWith(
    caches.match(req).then((cached) =>
      cached ||
      fetch(req).then((res) => {
        if (res.ok && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => cached)
    )
  );
});

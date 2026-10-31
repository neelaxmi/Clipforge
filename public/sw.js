const CACHE = "clipforge-phase1-v2";
const SHELL = ["./", "./index.html", "./css/style.css", "./manifest.webmanifest", "./assets/icon.svg"];
self.addEventListener("install", event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener("activate", event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener("fetch", event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.includes("/api/")) return;
  event.respondWith(fetch(request).then(response => {
    if (response.ok && (request.mode === "navigate" || /\.(css|js|svg|webmanifest)$/.test(url.pathname))) {
      const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(request, copy));
    }
    return response;
  }).catch(() => caches.match(request).then(cached => cached || caches.match("./index.html"))));
});

/* SpotFlow Kucindan — basic PWA shell cache (do not cache Apps Script) */
const CACHE = "spotflow-kucindan-shell-v1";
const SHELL = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/app.js",
  "./js/sync.js",
  "./manifest.webmanifest",
  "./icon.svg",
  "./data/sheet-sync.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.hostname === "script.google.com" || url.hostname.endsWith("googleusercontent.com") ||
      url.hostname === "script.googleusercontent.com") {
    return; // network only — never cache Sheets / Apps Script
  }
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetched = fetch(req).then((res) => {
        if (res && res.ok && (url.pathname.endsWith(".html") || url.pathname.endsWith(".css") ||
            url.pathname.endsWith(".js") || url.pathname.endsWith(".svg") ||
            url.pathname.endsWith(".json") || url.pathname.endsWith(".webmanifest") ||
            url.pathname.endsWith("/") || !url.pathname.includes("."))) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => cached);
      return cached || fetched;
    })
  );
});

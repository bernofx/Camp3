const CACHE = "volleystars-v1-test-8";
const ASSETS = ["./", "./index.html", "./styles.css", "./config.js", "./static-data.js", "./app.js", "./manifest.webmanifest", "./icon.svg"];
self.addEventListener("install", event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
self.addEventListener("activate", event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))));
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  event.respondWith(fetch(event.request).then(response => {
    const clone = response.clone(); caches.open(CACHE).then(cache => cache.put(event.request, clone)); return response;
  }).catch(() => caches.match(event.request)));
});

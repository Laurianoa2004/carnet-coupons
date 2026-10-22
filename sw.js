// Carnet de Coupons — service worker: offline shell + push notifications.
const CACHE = "carnet-v1";
const SHELL = ["./", "index.html", "manifest.webmanifest", "icon-192.png", "icon-512.png", "apple-touch-icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

// App shell: network first so updates land immediately, cache as the offline fallback.
// GitHub API calls are never cached here; the page keeps its own last-known data.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(event.request, copy));
        return res;
      })
      .catch(() => caches.match(event.request).then((r) => r || caches.match("index.html")))
  );
});

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { message: event.data ? event.data.text() : "" }; }
  const title = data.titre || "Carnet de Coupons";
  const options = {
    body: data.message || "Nouveau coupon disponible.",
    icon: "icon-192.png",
    badge: "icon-192.png",
    tag: data.tag || undefined,
    data: { url: data.url || "./" }
  };
  event.waitUntil(
    self.registration.showNotification(title, options).then(() =>
      self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => list.forEach((c) => c.postMessage({ type: "refresh" })))
    )
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "./", self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.startsWith(self.registration.scope)) { c.postMessage({ type: "refresh" }); return c.focus(); }
      }
      return self.clients.openWindow(target);
    })
  );
});

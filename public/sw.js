// Sharpen service worker: push notifications + an offline cache.
// Data itself is cached by the app in IndexedDB; this caches the app shell so
// it opens with no connection.
const CACHE = "sharpen-v2";
const PAGES = ["/", "/reminders", "/tasks", "/settings"];

self.addEventListener("install", (e) => {
  // Best effort: pages need a signed-in session, so a failure here is fine.
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => Promise.allSettled(PAGES.map((p) => fetch(p, { credentials: "include" }).then((r) => r.ok && !r.redirected && c.put(p, r)))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  // Pages: network first, keep the latest copy, fall back to it offline.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && !res.redirected) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(url.pathname, copy));
          }
          return res;
        })
        .catch(async () => (await caches.match(url.pathname)) || (await caches.match("/")) || Response.error())
    );
    return;
  }

  // Built assets, fonts and icons never change under the same URL: cache first.
  if (url.pathname.startsWith("/_next/static/") || /\.(png|ico|woff2?)$/.test(url.pathname)) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          })
      )
    );
  }
});

// iOS requires every push to show a notification, so no early returns.
self.addEventListener("push", (e) => {
  const d = e.data ? e.data.json() : { title: "Sharpen" };
  e.waitUntil(
    self.registration.showNotification(d.title, {
      body: d.body,
      tag: d.tag,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
    })
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const c = list[0];
      return c ? c.focus() : clients.openWindow("/");
    })
  );
});

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

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

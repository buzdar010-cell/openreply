/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope;

// injectManifest replaces this with the real list of build assets at build time --
// switched here from vite-plugin-pwa's default generateSW strategy specifically so this
// file can also handle push/notificationclick below (generateSW doesn't allow custom code).
precacheAndRoute(self.__WB_MANIFEST);

// generateSW's workbox output includes skip-waiting/clients-claim wiring automatically;
// injectManifest does not, since this file is 100% custom -- without this, a new deploy
// installs and then sits in "waiting" forever, still serving the OLD cached app to anyone
// with a tab/PWA instance already open, until they fully force-close and reopen it (not
// just background/resume it). Confirmed as the real cause of a beta tester getting a
// pre-auth build of the app with no login screen at all, days after auth shipped.
self.skipWaiting();
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data: { title?: string; body?: string; url?: string } = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    // Malformed or missing payload -- still show something rather than silently drop the push.
  }
  const title = data.title || 'Nutrition Tracker';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string } | undefined)?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) return client.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});

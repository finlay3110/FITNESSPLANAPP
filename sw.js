/* Offline support: the app shell is precached on install; photos and Chart.js are
   cached as they are used (or in one go via "Save for offline" in the app). */
var SHELL = 'jrft-shell-v1';
var MEDIA = 'jrft-media-v1';

var SHELL_FILES = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'data.js',
  'manifest.webmanifest',
  'icon-192.png',
  'icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(SHELL).then(function (c) { return c.addAll(SHELL_FILES); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== SHELL && k !== MEDIA) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  if (new URL(req.url).origin === self.location.origin) {
    // App shell: answer from cache for speed, then refresh it in the background so a
    // new version of the app is picked up on the next load rather than never. The
    // background fetch bypasses the HTTP cache, or a max-age header would hide updates.
    var refresh = null;
    var handled = caches.open(SHELL).then(function (cache) {
      return cache.match(req).then(function (hit) {
        var network = fetch(req.url, { cache: 'reload', credentials: 'same-origin' })
          .then(function (res) {
            if (res && res.ok) return cache.put(req, res.clone()).then(function () { return res; });
            return res;
          });
        if (hit) {
          refresh = network.catch(function () {});
          return hit;
        }
        return network.catch(function () {
          return (req.mode === 'navigate' ? cache.match('index.html') : null)
            || new Response('', { status: 504, statusText: 'Offline' });
        });
      });
    });
    e.respondWith(handled);
    // Keep the worker alive until the background refresh finishes.
    e.waitUntil(handled.then(function () { return refresh; }).catch(function () {}));
    return;
  }

  // Photos and Chart.js never change at their URL, so cache-first is right for them.
  e.respondWith(
    caches.open(MEDIA).then(function (cache) {
      return cache.match(req).then(function (hit) {
        if (hit) return hit;
        return fetch(req).then(function (res) {
          cache.put(req, res.clone()).catch(function () {});
          return res;
        }).catch(function () {
          return new Response('', { status: 504, statusText: 'Offline' });
        });
      });
    })
  );
});

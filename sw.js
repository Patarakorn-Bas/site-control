/* Service worker: ทำให้แอปเปิดได้แม้ไม่มีอินเทอร์เน็ต • เปลี่ยน VERSION ทุกครั้งที่อัปเดตไฟล์ */
var VERSION = 'sc-v2.4.0';
var CORE = ['./', 'index.html', 'app.js', 'spec-data.js', 'manifest.webmanifest', 'vendor/chart.umd.min.js', 'vendor/xlsx.full.min.js', 'vendor/jszip.min.js', 'fonts/THSarabunPSK-Regular.woff2', 'fonts/THSarabunPSK-Bold.woff2', 'templates/template_single.xlsx', 'templates/template_multi.xlsx',
  'icons/icon-v3-192.png', 'icons/icon-v3-512.png', 'icons/icon-v3-maskable-512.png', 'icons/apple-touch-icon-v3.png', 'icons/favicon-v3.ico'];
self.addEventListener('install', function (e) { e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(CORE); })); });
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('message', function (e) { if (e.data === 'skipWaiting') self.skipWaiting(); });
self.addEventListener('fetch', function (e) {
  var req = e.request; if (req.method !== 'GET') return;
  var url = new URL(req.url);
  // ฟอนต์ Google: เก็บไว้ใช้ออฟไลน์
  if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(caches.open(VERSION + '-fonts').then(function (c) { return c.match(req).then(function (hit) {
      var net = fetch(req).then(function (r) { if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone()); return r; }).catch(function () { return hit; });
      return hit || net; }); }));
    return;
  }
  if (url.origin !== location.origin) return;
  // ไฟล์ของแอป: ใช้จากแคชก่อน (เร็ว/ออฟไลน์) • หน้าเว็บ: ถ้าไม่มีเน็ตให้ใช้ index.html
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(function (hit) {
    return hit || fetch(req).then(function (r) {
      if (r && r.ok) { var cp = r.clone(); caches.open(VERSION).then(function (c) { c.put(req, cp); }); }
      return r;
    }).catch(function () { return req.mode === 'navigate' ? caches.match('index.html') : undefined; });
  }));
});

// 농가 경영진단 AI 대시보드 — Service Worker
// 오프라인/재방문 시 빠른 로딩 (네트워크 우선, 실패 시 캐시 폴백)
const CACHE = 'agr-dashboard-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './data/income_2024.json',
  './data/pubdata-catalog.json',
  './data/rda-cases.sample.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html')))
  );
});

/* アプリ本体(同一オリジンの GET)だけをキャッシュするシンプルな Service Worker。
   - インストール時に起動に必要なファイル(index.html とそこから参照される JS/CSS/アイコン)を先に保存する
   - 通信できるときは最新を取りに行き、通信できないときはキャッシュで起動する(network-first)
   - GitHub API(別オリジン)は一切キャッシュしない */
const CACHE = 'interview-note-v2';

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE);
        const res = await fetch('./', { cache: 'reload' });
        if (!res.ok) return; // 404 などはキャッシュしない
        const html = await res.clone().text();
        await cache.put('./', res);
        const urls = [...html.matchAll(/(?:src|href)="(\.\/[^"#?]+)"/g)].map((m) => m[1]);
        await Promise.all([...new Set(urls)].map((u) => cache.add(u).catch(() => undefined)));
      } catch {
        /* 先読みに失敗してもインストール自体は続ける(実行時キャッシュで補う) */
      } finally {
        await self.skipWaiting();
      }
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(async () => {
        const hit = await caches.match(req, { ignoreSearch: req.mode === 'navigate' });
        if (hit) return hit;
        if (req.mode === 'navigate') {
          const shell = await caches.match('./');
          if (shell) return shell;
        }
        return Response.error();
      }),
  );
});

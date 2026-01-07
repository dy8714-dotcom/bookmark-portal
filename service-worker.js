const CACHE_NAME = 'bookmark-portal-v1';
const urlsToCache = [
  '/bookmark-portal/',
  '/bookmark-portal/index.html',
  '/bookmark-portal/styles.css',
  '/bookmark-portal/script.js',
  '/bookmark-portal/manifest.json'
];

// インストール時にキャッシュ
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('キャッシュを開きました');
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting();
});

// アクティベーション時に古いキャッシュを削除
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('古いキャッシュを削除:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// フェッチ時にキャッシュを使用（オフライン対応）
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // キャッシュがあればそれを返す
        if (response) {
          return response;
        }

        // キャッシュになければネットワークから取得
        return fetch(event.request).then((response) => {
          // レスポンスが有効でない場合はそのまま返す
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // レスポンスをクローンしてキャッシュに保存
          const responseToCache = response.clone();
          caches.open(CACHE_NAME)
            .then((cache) => {
              cache.put(event.request, responseToCache);
            });

          return response;
        }).catch(() => {
          // ネットワークエラー時はオフラインページを表示
          return caches.match('/bookmark-portal/index.html');
        });
      })
  );
});

// バックグラウンド同期（オプション）
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-bookmarks') {
    event.waitUntil(syncBookmarks());
  }
});

async function syncBookmarks() {
  // Firebaseとの同期処理（既存のコードで実装済み）
  console.log('バックグラウンド同期を実行');
}

// プッシュ通知（オプション）
self.addEventListener('push', (event) => {
  const options = {
    body: event.data ? event.data.text() : '新しいブックマークが追加されました',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    vibrate: [200, 100, 200]
  };

  event.waitUntil(
    self.registration.showNotification('ブックマークポータル', options)
  );
});

// 通知クリック時の処理
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow('/bookmark-portal/')
  );
});

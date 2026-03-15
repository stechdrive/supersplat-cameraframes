const buildInfo = {
    version: 'v2.20.5-1773568089'
};

const cacheName = `superSplat-cFrames-${buildInfo.version}`;
const scopeUrl = new URL(self.location.href);
const withVersion = (path) => `${path}?v=${buildInfo.version}`;
const toAbsoluteUrl = (path) => new URL(path, scopeUrl).toString();
const versionedAssets = [
    './index.html',
    './index.js',
    './index.css',
    './manifest.json'
].map(path => withVersion(path));
const staticAssets = [
    './index.js.map',
    './help/camera_frames_manual.html',
    './static/icons/logo-192.png',
    './static/icons/logo-512.png',
    './static/images/header.webp',
    './static/images/screenshot-cameraframes.jpg',
    './static/images/screenshot-narrow.jpg',
    './static/images/screenshot-wide.jpg',
    './static/lib/lodepng/lodepng.js',
    './static/lib/lodepng/lodepng.wasm',
    './static/lib/webp/webp.mjs',
    './static/lib/webp/webp.wasm',
    './static/locales/de.json',
    './static/locales/en.json',
    './static/locales/es.json',
    './static/locales/fr.json',
    './static/locales/ja.json',
    './static/locales/ko.json',
    './static/locales/pt-BR.json',
    './static/locales/ru.json',
    './static/locales/zh-CN.json',
    './static/env/VertebraeHDRI_v1_512.png'
];
const cacheUrls = [...versionedAssets, ...staticAssets];
const absoluteCacheUrls = cacheUrls.map(url => toAbsoluteUrl(url));
const cacheFirstTargets = new Set(absoluteCacheUrls);
const navigationFallbackUrl = toAbsoluteUrl(withVersion('./index.html'));
self.addEventListener('install', (event) => {
    console.log(`installing ${cacheName}`);
    self.skipWaiting();
    event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(absoluteCacheUrls)));
});
self.addEventListener('activate', (event) => {
    console.log(`activating ${cacheName}`);
    event.waitUntil((async () => {
        const names = await caches.keys();
        const deletions = names.filter(name => name !== cacheName).map(name => caches.delete(name));
        await Promise.all(deletions);
        await self.clients.claim();
    })());
});
self.addEventListener('message', (event) => {
    if (event.data?.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
const isNavigationRequest = (request) => request.mode === 'navigate' || request.destination === 'document';
const cacheFirst = async (request) => {
    const cached = await caches.match(request, { ignoreSearch: false });
    if (cached) {
        return cached;
    }
    const response = await fetch(request);
    if (response && response.ok) {
        const cache = await caches.open(cacheName);
        cache.put(request, response.clone());
    }
    return response;
};
const networkFirst = async (request, fallbackUrl) => {
    try {
        const response = await fetch(request);
        if (response && response.ok) {
            const cache = await caches.open(cacheName);
            cache.put(request, response.clone());
        }
        return response;
    }
    catch (err) {
        const cached = await caches.match(request, { ignoreSearch: false });
        if (cached) {
            return cached;
        }
        if (fallbackUrl) {
            const fallbackResponse = await caches.match(fallbackUrl, { ignoreSearch: false });
            if (fallbackResponse) {
                return fallbackResponse;
            }
        }
        throw err;
    }
};
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') {
        return;
    }
    const url = new URL(event.request.url);
    if (url.origin !== scopeUrl.origin) {
        return;
    }
    if (isNavigationRequest(event.request)) {
        event.respondWith(networkFirst(event.request, navigationFallbackUrl));
        return;
    }
    if (event.request.destination === 'manifest') {
        event.respondWith(networkFirst(event.request));
        return;
    }
    const normalizedUrl = url.toString();
    if (cacheFirstTargets.has(normalizedUrl)) {
        event.respondWith(cacheFirst(event.request));
        return;
    }
    if (url.searchParams.get('v') === buildInfo.version) {
        event.respondWith(cacheFirst(event.request));
    }
});
//# sourceMappingURL=sw.js.map

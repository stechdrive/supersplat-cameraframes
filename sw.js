const buildInfo = {
    version: 'v1.4.2-1764994935'
};

const cacheName = `superSplat-cFrames-${buildInfo.version}`;
const cacheUrls = [
    './',
    './index.css',
    './index.html',
    './index.js',
    './index.js.map',
    './jszip.js',
    './manifest.json',
    './static/icons/logo-192.png',
    './static/icons/logo-512.png',
    './static/images/screenshot-narrow.jpg',
    './static/images/screenshot-wide.jpg',
    './static/lib/lodepng/lodepng.js',
    './static/lib/lodepng/lodepng.wasm',
    './static/locales/de.json',
    './static/locales/en.json',
    './static/locales/fr.json',
    './static/locales/ja.json',
    './static/locales/ko.json',
    './static/locales/zh-CN.json'
];
self.addEventListener('install', (event) => {
    console.log(`installing ${cacheName}`);
    self.skipWaiting();
    // create cache for current version
    event.waitUntil(caches.open(cacheName)
        .then((cache) => {
        // Append version to requests if they don't have them to match HTML injection? 
        // Actually HTML injection adds query params, so requests will have them naturally.
        // But cacheUrls above are clean.
        // We should cache the exact URLs or let the fetch handler handle it.
        // For simplicity and robustness, we can cache the "clean" URLs 
        // but the fetch handler might see "dirty" URLs (with query params).
        // However, the browser cache (not SW cache) handles the query params for busting.
        // SW cache is separate.
        // Let's stick to caching the files. 
        // Note: `cache.addAll` makes requests. If we want those requests to be fresh, 
        // we could append a random query param here too, or rely on the fact that 
        // this SW version is new so it runs this install step again.
        return cache.addAll(cacheUrls);
    }));
});
self.addEventListener('activate', (event) => {
    console.log(`activating ${cacheName}`);
    event.waitUntil(self.clients.claim());
    // delete the old caches once this one is activated
    event.waitUntil(caches.keys().then((names) => {
        return Promise.all(names.map((name) => {
            if (name !== cacheName) {
                return caches.delete(name);
            }
        }));
    }));
});
self.addEventListener('fetch', (event) => {
    event.respondWith(caches.match(event.request, { ignoreSearch: true })
        .then(response => response ?? fetch(event.request)));
});
//# sourceMappingURL=sw.js.map

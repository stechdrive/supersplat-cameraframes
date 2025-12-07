const buildInfo = {
    version: 'v2.1.0-1765088892'
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
    event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(cacheUrls)));
});
self.addEventListener('activate', (event) => {
    console.log(`activating ${cacheName}`);
    event.waitUntil(self.clients.claim());
    // delete the old caches once this one is activated
    event.waitUntil(caches.keys().then((names) => {
        const deletions = names.filter(name => name !== cacheName).map(name => caches.delete(name));
        return Promise.all(deletions);
    }));
});
self.addEventListener('fetch', (event) => {
    event.respondWith(caches.match(event.request, { ignoreSearch: true }).then(response => response ?? fetch(event.request)));
});
//# sourceMappingURL=sw.js.map

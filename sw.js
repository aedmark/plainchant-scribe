const CACHE_PREFIX = 'plainchant-scribe-';
const CACHE_NAME = 'plainchant-scribe-v1';
const APP_FILES = [
    './',
    'index.html',
    'app.html',
    'manifest.webmanifest',
    'src/home.css',
    'src/styles.css',
    'src/html-ast.js',
    'src/css-ast.js',
    'src/vendor/prism/prism.js',
    'src/code-shade.js',
    'src/dom-outline.js',
    'src/project.js',
    'src/parts.js',
    'src/links.js',
    'src/editing.js',
    'src/suggest.js',
    'src/library.js',
    'src/store.js',
    'src/versions.js',
    'src/filesync.js',
    'src/finding.js',
    'src/zip.js',
    'src/imagelib.js',
    'src/hints.js',
    'src/preview.js',
    'src/projectlink.js',
    'src/format.js',
    'src/shortcuts.js',
    'src/xml-ast.js',
    'src/book-template.js',
    'src/book.js',
    'src/opf-edit.js',
    'src/nav.js',
    'src/book-stage.js',
    'src/example-book.js',
    'src/book-meta.js',
    'src/book-chapters.js',
    'src/importing.js',
    'src/app/core.js',
    'src/app/layout.js',
    'src/app/persistence.js',
    'src/app/assets.js',
    'src/app/dialogs.js',
    'src/app/library-ui.js',
    'src/app/versions-ui.js',
    'src/app/settings.js',
    'src/app/typing.js',
    'src/app/shade.js',
    'src/app/find.js',
    'src/app/find-project.js',
    'src/app/panes.js',
    'src/app/dock-ui.js',
    'src/app/stage.js',
    'src/app/stage-links.js',
    'src/app/stage-book.js',
    'src/app/reader-ui.js',
    'src/app/reader-device.js',
    'src/app/stage-nav.js',
    'src/app/book-ui.js',
    'src/app/spine-ui.js',
    'src/app/inspector-ui.js',
    'src/app/parts-ui.js',
    'src/app/problems-ui.js',
    'src/app/outline-ui.js',
    'src/app/explorer-ui.js',
    'src/app/asset-ui.js',
    'src/app/explorer-move.js',
    'src/app/export.js',
    'src/app/import.js',
    'src/app/tauri-files.js',
    'src/app/project-links.js',
    'src/app/zip-ui.js',
    'src/app/preview-ui.js',
    'src/app/format-ui.js',
    'src/app/menus.js',
    'src/app/help.js',
    'src/app/offline.js',
    'src/app/main.js',
    'fonts/courier-prime-latin-400-italic.woff2',
    'fonts/courier-prime-latin-400-normal.woff2',
    'fonts/courier-prime-latin-700-italic.woff2',
    'fonts/courier-prime-latin-700-normal.woff2',
    'fonts/courier-prime-latin-ext-400-italic.woff2',
    'fonts/courier-prime-latin-ext-400-normal.woff2',
    'fonts/courier-prime-latin-ext-700-italic.woff2',
    'fonts/courier-prime-latin-ext-700-normal.woff2',
    'fonts/eb-garamond-latin-400-normal.woff2',
    'fonts/eb-garamond-latin-400-italic.woff2',
    'fonts/eb-garamond-latin-600-normal.woff2',
    'fonts/eb-garamond-latin-ext-400-normal.woff2',
    'fonts/eb-garamond-latin-ext-400-italic.woff2',
    'fonts/eb-garamond-latin-ext-600-normal.woff2',
    'fonts/inter-latin-400-normal.woff2',
    'fonts/inter-latin-600-normal.woff2',
    'fonts/inter-latin-ext-400-normal.woff2',
    'fonts/inter-latin-ext-600-normal.woff2',
    'icons/apple-touch-icon.png',
    'icons/icon-192.png',
    'icons/icon-512.png',
    'icons/icon-maskable-512.png',
    'icons/icon.svg'
];

// cache: 'reload' skips the browser's HTTP cache, so the copy kept for offline use is the server's current one.
self.addEventListener('install', (e) => {
    e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(APP_FILES.map((f) => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        // Only Scribe's own old caches: another app on the same origin keeps its cache.
        caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

// Network first (P0-07, D-019): online, every file comes from the server, revalidated past the HTTP cache, and
// refreshes the stored copy, so an update shows on the next load; offline, the stored copy answers. Copies are
// keyed without the query string. caches.match() would search every cache on the origin, including another
// app's, so only Scribe's own cache is read or written (D-013).
const cacheKey = (url) => { const u = new URL(url); u.search = ''; u.hash = ''; return u.href; };

self.addEventListener('fetch', (e) => {
    const req = e.request;
    if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
    const key = cacheKey(req.url);
    const fromCache = () => caches.open(CACHE_NAME).then((c) => c.match(key)).then((hit) => hit || Response.error());
    e.respondWith(fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }).then((res) => {
        if (!res || !res.ok) return res;
        const copy = res.clone();
        return caches.open(CACHE_NAME).then((c) => c.put(key, copy)).catch(() => {}).then(() => res);
    }, fromCache));
});

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

self.addEventListener('install', (e) => {
    e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(APP_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        // Only Scribe's own old caches: another app on the same origin keeps its cache.
        caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (e) => {
    if (e.request.method !== 'GET') return;
    // caches.match() would search every cache on the origin, including another app's, so look only in Scribe's.
    e.respondWith(caches.open(CACHE_NAME).then((c) => c.match(e.request)).then((hit) => hit || fetch(e.request)));
});

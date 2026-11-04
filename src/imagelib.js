(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.ImageLib = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const IMAGE_RE = /\.(png|jpe?g|gif|webp|avif|svg|ico|bmp)$/i;

    function isImage(path) {
        return IMAGE_RE.test(String(path || ''));
    }

    function list(sources) {
        const found = new Map();
        const add = (path, source) => {
            if (!isImage(path) || found.has(path)) return;
            found.set(path, { path: path, name: path.split('/').pop(), folder: path.split('/').slice(0, -1).join('/'), source: source });
        };
        Object.keys((sources && sources.assets) || {}).forEach((p) => add(p, 'asset'));
        ((sources && sources.tree) || []).forEach((item) => { if (item && item.kind === 'file' && item.is_text === false) add(item.path, 'file'); });
        Object.keys((sources && sources.entries) || {}).forEach((p) => add(p, 'text'));
        return Array.from(found.values()).sort((a, b) => (a.path < b.path ? -1 : (a.path > b.path ? 1 : 0)));
    }

    function uniquePath(existing, fileName, folder) {
        const clean = String(fileName || 'image').replace(/[\\/<>:"|?*\u0000-\u001f]/g, '').trim().replace(/\s+/g, '-') || 'image';
        const dot = clean.lastIndexOf('.');
        const stem = dot > 0 ? clean.slice(0, dot) : clean;
        const ext = dot > 0 ? clean.slice(dot) : '';
        const dir = folder == null ? 'images' : String(folder).replace(/^\/+|\/+$/g, '');
        const taken = new Set(Array.from(existing || []).map((p) => String(p).toLowerCase()));
        const make = (n) => (dir ? dir + '/' : '') + stem + (n > 1 ? '-' + n : '') + ext;
        let n = 1;
        while (taken.has(make(n).toLowerCase())) n++;
        return make(n);
    }

    function formatBytes(bytes) {
        if (typeof bytes !== 'number' || !isFinite(bytes) || bytes < 0) return '';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0) + ' KB';
        return (bytes / 1024 / 1024).toFixed(1) + ' MB';
    }

    return { isImage: isImage, list: list, uniquePath: uniquePath, formatBytes: formatBytes };
});

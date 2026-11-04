(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.ProjectLink = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    function normalizePath(path) {
        const text = String(path || '').replace(/\\/g, '/').replace(/\/+$/, '');
        return /^([A-Za-z]:|\/\/)/.test(text) ? text.toLowerCase() : text;
    }

    function findByPath(links, scripts, path, exceptId) {
        const want = normalizePath(path);
        if (!want) return null;
        const ids = Object.keys(links || {});
        for (let i = 0; i < ids.length; i++) {
            const id = ids[i];
            const link = links[id];
            const script = (scripts || {})[id];
            if (id === exceptId || !link || !link.path || !script || script.deletedAt) continue;
            if (normalizePath(link.path) === want) return id;
        }
        return null;
    }

    function hashText(text) {
        const s = String(text == null ? '' : text).replace(/\r\n?/g, '\n').replace(/\n*$/, '\n');
        let h = 0x811c9dc5;
        for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = Math.imul(h, 0x01000193) >>> 0;
        }
        return h.toString(16);
    }

    function hashEntries(entries) {
        const out = {};
        Object.keys(entries || {}).forEach((path) => { out[path] = hashText(entries[path]); });
        return out;
    }

    function changedOnDisk(synced, diskEntries) {
        const before = synced || {};
        const now = hashEntries(diskEntries);
        const paths = new Set(Object.keys(before).concat(Object.keys(now)));
        const changed = [];
        const added = [];
        const removed = [];
        Array.from(paths).sort().forEach((p) => {
            if (!(p in before)) added.push(p);
            else if (!(p in now)) removed.push(p);
            else if (before[p] !== now[p]) changed.push(p);
        });
        return { changed: changed, added: added, removed: removed, count: changed.length + added.length + removed.length };
    }

    return { normalizePath: normalizePath, findByPath: findByPath, hashText: hashText, hashEntries: hashEntries, changedOnDisk: changedOnDisk };
});

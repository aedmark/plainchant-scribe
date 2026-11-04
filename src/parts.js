(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./project.js'));
    else root.Parts = factory(root.Project);
})(typeof self !== 'undefined' ? self : this, function (Project) {
    'use strict';

    const MARKER_RE = /<!--\s*pc:part\s+src=(?:"([^"]*)"|'([^']*)')\s*-->|<!--\s*\/pc:part\s*-->/g;

    function isHtml(path) {
        return /\.html?$/i.test(path);
    }

    function find(html) {
        const text = String(html == null ? '' : html);
        const regions = [];
        const invalid = [];
        let open = null;
        let m;
        MARKER_RE.lastIndex = 0;
        while ((m = MARKER_RE.exec(text)) !== null) {
            if (m[1] != null || m[2] != null) {
                if (open) invalid.push({ src: open.src, openStart: open.openStart });
                open = { src: m[1] != null ? m[1] : m[2], openStart: m.index, openEnd: m.index + m[0].length };
            } else if (open) {
                regions.push({
                    src: open.src, openStart: open.openStart, openEnd: open.openEnd,
                    closeStart: m.index, closeEnd: m.index + m[0].length
                });
                open = null;
            } else {
                invalid.push({ src: null, openStart: m.index });
            }
        }
        if (open) invalid.push({ src: open.src, openStart: open.openStart });
        return { regions: regions, invalid: invalid };
    }

    function trimEnd(text) {
        return String(text == null ? '' : text).replace(/^\s+/, '').replace(/\s+$/, '');
    }

    function regionText(html, region) {
        return trimEnd(html.slice(region.openEnd, region.closeStart));
    }

    const relPath = Project.relativePath;

    function wrap(src, text, indent) {
        return '<!-- pc:part src="' + src + '" -->\n' + (indent || '') + trimEnd(text) + '\n' + (indent || '') + '<!-- /pc:part -->';
    }

    function scan(entries) {
        const found = [];
        const invalid = [];
        const parts = {};
        Object.keys(entries).filter(isHtml).forEach((page) => {
            const res = find(entries[page]);
            res.regions.forEach((region, index) => { found.push({ page: page, index: index, region: region, path: Project.resolveRelativePath(page, region.src) }); });
            res.invalid.forEach((bad) => invalid.push({ page: page, src: bad.src }));
        });
        const partPaths = new Set(found.map((f) => f.path).filter(Boolean));
        const regions = found.filter((f) => !partPaths.has(f.page)).map((f) => {
            let state = 'missing';
            if (f.path && typeof entries[f.path] === 'string') {
                state = regionText(entries[f.page], f.region) === trimEnd(entries[f.path]) ? 'synced' : 'differs';
            }
            if (f.path) parts[f.path] = (parts[f.path] || 0) + 1;
            return { page: f.page, index: f.index, src: f.region.src, path: f.path, state: state };
        });
        return { regions: regions, parts: parts, invalid: invalid.filter((b) => !partPaths.has(b.page)) };
    }

    function isPart(entries, path) {
        return Object.keys(entries).some((page) => page !== path && isHtml(page) &&
            find(entries[page]).regions.some((r) => Project.resolveRelativePath(page, r.src) === path));
    }

    function sync(entries, only) {
        const next = Object.assign({}, entries);
        const changed = [];
        const info = scan(entries);
        const targets = info.regions.filter((r) => r.state === 'differs' &&
            (!only || ((only.part == null || r.path === only.part) && (only.page == null || r.page === only.page) && (only.index == null || r.index === only.index))));
        const byPage = {};
        targets.forEach((r) => { (byPage[r.page] = byPage[r.page] || []).push(r); });
        Object.keys(byPage).forEach((page) => {
            let html = next[page];
            const regions = find(html).regions;
            byPage[page].sort((a, b) => b.index - a.index).forEach((r) => {
                const region = regions[r.index];
                const inner = html.slice(region.openEnd, region.closeStart);
                const closeIndent = (/\n([ \t]*)$/.exec(inner) || [])[1] || '';
                const firstIndent = (/^\n([ \t]*)/.exec(inner) || [])[1];
                html = html.slice(0, region.openEnd) + '\n' + (firstIndent == null ? closeIndent : firstIndent) + trimEnd(next[r.path]) + '\n' + closeIndent + html.slice(region.closeStart);
            });
            next[page] = html;
            changed.push(page);
        });
        return { entries: next, changed: changed };
    }

    function pull(entries, page, index) {
        const region = find(entries[page]).regions[index];
        const path = region ? Project.resolveRelativePath(page, region.src) : null;
        if (!path) return { entries: entries, changed: [] };
        const next = Object.assign({}, entries);
        next[path] = regionText(entries[page], region) + '\n';
        const res = sync(next, { part: path });
        return { entries: res.entries, changed: [path].concat(res.changed) };
    }

    return { find: find, regionText: regionText, relPath: relPath, wrap: wrap, scan: scan, isPart: isPart, sync: sync, pull: pull };
});

(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.Finding = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    function matcher(query, caseSensitive) {
        return new RegExp(String(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), caseSensitive ? 'g' : 'gi');
    }

    function findAll(text, query, options) {
        const found = [];
        if (!query) return found;
        const re = matcher(query, options && options.caseSensitive);
        const source = String(text == null ? '' : text);
        let m;
        while ((m = re.exec(source)) !== null) {
            found.push({ start: m.index, end: m.index + m[0].length });
        }
        return found;
    }

    function nearest(matches, offset) {
        if (!matches.length) return -1;
        const at = matches.findIndex((m) => m.start >= offset);
        return at === -1 ? 0 : at;
    }

    function step(matches, current, direction) {
        const n = matches.length;
        if (!n) return -1;
        if (current < 0 || current >= n) return direction > 0 ? 0 : n - 1;
        return (current + (direction > 0 ? 1 : -1) + n) % n;
    }

    function replaceAt(text, match, replacement) {
        return { text: text.slice(0, match.start) + replacement + text.slice(match.end), caret: match.start + replacement.length };
    }

    function replaceAll(text, query, replacement, options) {
        const matches = findAll(text, query, options);
        let out = '';
        let last = 0;
        matches.forEach((m) => {
            out += text.slice(last, m.start) + replacement;
            last = m.end;
        });
        return { text: out + text.slice(last), count: matches.length };
    }

    function findInFiles(entries, query, options) {
        const files = [];
        let total = 0;
        if (!query) return { files: files, total: 0 };
        Object.keys(entries).forEach((path) => {
            const text = String(entries[path] == null ? '' : entries[path]);
            const hits = findAll(text, query, options);
            if (!hits.length) return;
            let line = 1;
            let scanned = 0;
            let lineStart = 0;
            const matches = hits.map((m) => {
                for (let i = scanned; i < m.start; i++) {
                    if (text.charCodeAt(i) === 10) { line++; lineStart = i + 1; }
                }
                scanned = m.start;
                const lineEndAt = text.indexOf('\n', m.end);
                const lineEnd = lineEndAt === -1 ? text.length : lineEndAt;
                const col = m.start - lineStart;
                const from = Math.max(lineStart, m.start - 30);
                const to = Math.min(lineEnd, m.end + 50);
                return {
                    start: m.start, end: m.end, line: line,
                    before: (from > lineStart ? '\u2026' : '') + text.slice(from, m.start).replace(/^\s+/, ''),
                    hit: text.slice(m.start, Math.min(m.end, lineEnd)),
                    after: text.slice(Math.min(m.end, lineEnd), to) + (to < lineEnd ? '\u2026' : ''),
                    column: col + 1
                };
            });
            files.push({ path: path, matches: matches });
            total += matches.length;
        });
        return { files: files, total: total };
    }

    function replaceInFiles(entries, query, replacement, options) {
        const only = options && options.paths ? new Set(options.paths) : null;
        const next = Object.assign({}, entries);
        const changed = [];
        let count = 0;
        Object.keys(entries).forEach((path) => {
            if (only && !only.has(path)) return;
            const res = replaceAll(String(entries[path] == null ? '' : entries[path]), query, replacement, options);
            if (!res.count) return;
            next[path] = res.text;
            changed.push(path);
            count += res.count;
        });
        return { entries: next, files: changed, count: count };
    }

    return { findInFiles: findInFiles, replaceInFiles: replaceInFiles, findAll: findAll, nearest: nearest, step: step, replaceAt: replaceAt, replaceAll: replaceAll };
});

(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./html-ast.js'), require('./project.js'));
    else root.Links = factory(root.HtmlAst, root.Project);
})(typeof self !== 'undefined' ? self : this, function (HtmlAst, Project) {
    'use strict';

    const LABELS = {
        link: 'Linked page', image: 'Image', media: 'Media file', stylesheet: 'Stylesheet', script: 'Script', asset: 'File'
    };

    function lineIndex(text) {
        const starts = [0];
        for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1);
        return (offset) => {
            let lo = 0;
            let hi = starts.length - 1;
            while (lo < hi) {
                const mid = (lo + hi + 1) >> 1;
                if (starts[mid] <= offset) lo = mid; else hi = mid - 1;
            }
            return lo + 1;
        };
    }

    function cssRefs(css, baseOffset, lineOf, wholeSpan) {
        const blanked = css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
        const refs = [];
        const place = (m, raw, kind) => {
            const at = baseOffset + m.index + m[0].indexOf(raw);
            refs.push({ kind: kind, raw: raw, start: wholeSpan ? wholeSpan.start : at, end: wholeSpan ? wholeSpan.end : at + raw.length, line: lineOf(wholeSpan ? wholeSpan.start : at) });
        };
        let m;
        const urlRe = /url\(\s*(['"]?)([^'")]*?)\1\s*\)/gi;
        while ((m = urlRe.exec(blanked)) !== null) {
            if (/^\s*@import\s+$/i.test(blanked.slice(Math.max(0, m.index - 12), m.index))) place(m, m[2], 'stylesheet');
            else place(m, m[2], 'asset');
        }
        const importRe = /@import\s+(['"])([^'"]+)\1/gi;
        while ((m = importRe.exec(blanked)) !== null) place(m, m[2], 'stylesheet');
        return refs;
    }

    function extractHtml(text) {
        const ast = HtmlAst.parse(text);
        const lineOf = lineIndex(text);
        const refs = [];
        const ids = new Set();
        const add = (el, attr, kind, raw) => {
            const span = el.attrSpans[attr];
            if (span && raw != null) refs.push({ kind: kind, raw: String(raw), start: span.start, end: span.end, line: lineOf(span.start) });
        };
        ast.elements.forEach((el) => {
            const a = el.attrs;
            const tag = el.tag;
            if (a.id) ids.add(a.id);
            if (tag === 'a' && a.name) ids.add(a.name);
            if ((tag === 'a' || tag === 'area') && a.href != null) add(el, 'href', 'link', a.href);
            else if (tag === 'link' && a.href != null) add(el, 'href', /\bstylesheet\b/i.test(a.rel || '') ? 'stylesheet' : 'asset', a.href);
            else if (tag === 'script' && a.src != null) add(el, 'src', 'script', a.src);
            else if (tag === 'img') {
                if (a.src != null) add(el, 'src', 'image', a.src);
            } else if (tag === 'iframe' && a.src != null) add(el, 'src', 'link', a.src);
            else if ((tag === 'video' || tag === 'audio' || tag === 'source' || tag === 'track' || tag === 'embed') && a.src != null) {
                add(el, 'src', tag === 'source' && /image/i.test(a.type || '') ? 'image' : 'media', a.src);
            } else if (tag === 'input' && /^image$/i.test(a.type || '') && a.src != null) add(el, 'src', 'image', a.src);
            if (a.poster != null) add(el, 'poster', 'image', a.poster);
            if ((tag === 'img' || tag === 'source') && a.srcset != null) {
                a.srcset.split(',').forEach((candidate) => {
                    const url = candidate.trim().split(/\s+/)[0];
                    if (url) add(el, 'srcset', 'image', url);
                });
            }
            if (a.style && el.attrSpans.style) refs.push.apply(refs, cssRefs(a.style, 0, lineOf, el.attrSpans.style));
            if (tag === 'style') {
                el.children.filter((c) => c.type === 'text').forEach((c) => refs.push.apply(refs, cssRefs(c.text, c.start, lineOf)));
            }
        });
        return { refs: refs, ids: ids };
    }

    function extract(path, text) {
        if (/\.html?$/i.test(path)) return extractHtml(String(text));
        if (/\.css$/i.test(path)) return { refs: cssRefs(String(text), 0, lineIndex(String(text))), ids: new Set() };
        return { refs: [], ids: new Set() };
    }

    function createChecker() {
        const cache = new Map();
        const dataFor = (path, text) => {
            const hit = cache.get(path);
            if (hit && hit.text === text) return hit.data;
            const data = extract(path, text);
            cache.set(path, { text: text, data: data });
            return data;
        };

        function check(entries, knownPaths) {
            const known = new Set(Object.keys(entries).concat(knownPaths || []));
            const folded = new Map();
            known.forEach((p) => folded.set(p.toLowerCase(), p));
            const problems = [];
            const idsOf = (path) => (path in entries && /\.html?$/i.test(path) ? dataFor(path, entries[path]).ids : null);
            const report = (file, ref, severity, message, target) => {
                problems.push({ file: file, start: ref.start, end: ref.end, line: ref.line, kind: ref.kind, severity: severity, message: message, ref: ref.raw.trim(), target: target || null });
            };
            Object.keys(entries).forEach((file) => {
                dataFor(file, entries[file]).refs.forEach((ref) => {
                    const raw = ref.raw.trim();
                    if (!raw || raw === '.' || raw.charAt(0) === '?' || /\{\{|\{%|<%|\$\{|<\?/.test(raw) || /^([a-z][a-z0-9+.-]*:|\/\/)/i.test(raw)) return;
                    const hashAt = raw.indexOf('#');
                    const fragment = hashAt === -1 ? '' : decodeFragment(raw.slice(hashAt + 1));
                    const anchorKinds = ref.kind === 'link';
                    if (raw.charAt(0) === '#') {
                        const own = idsOf(file);
                        if (anchorKinds && own && fragment && fragment.toLowerCase() !== 'top' && !own.has(fragment)) {
                            report(file, ref, 'warning', 'No element with id "' + fragment + '" on this page.', file);
                        }
                        return;
                    }
                    const target = Project.resolveRelativePath(file, raw);
                    if (!target) {
                        report(file, ref, 'error', LABELS[ref.kind] + ' "' + raw + '" points outside the project.', null);
                        return;
                    }
                    let found = target;
                    if (!known.has(target)) {
                        const sameName = folded.get(target.toLowerCase());
                        if (sameName) {
                            report(file, ref, 'warning', LABELS[ref.kind] + ' "' + raw + '" matches ' + sameName + ' only if case is ignored; it will break on case-sensitive servers.', sameName);
                            found = sameName;
                        } else if (anchorKinds && !/\.[a-z0-9]+$/i.test(target) && known.has(target + '.html')) {
                            report(file, ref, 'warning', 'Link "' + raw + '" has no extension; it only works on hosts that serve ' + target + '.html for it.', target + '.html');
                            return;
                        } else {
                            report(file, ref, 'error', LABELS[ref.kind] + ' not found: ' + target, target);
                            return;
                        }
                    }
                    if (anchorKinds && fragment && fragment.toLowerCase() !== 'top') {
                        const ids = idsOf(found);
                        if (ids && !ids.has(fragment)) report(file, ref, 'warning', 'No element with id "' + fragment + '" in ' + found + '.', found);
                    }
                });
            });
            const order = Object.keys(entries);
            problems.sort((a, b) => (order.indexOf(a.file) - order.indexOf(b.file)) || (a.start - b.start));
            return {
                problems: problems,
                errors: problems.filter((p) => p.severity === 'error').length,
                warnings: problems.filter((p) => p.severity === 'warning').length
            };
        }

        return { check: check };
    }

    function decodeFragment(fragment) {
        try { return decodeURIComponent(fragment); } catch (e) { return fragment; }
    }

    function usage(entries) {
        const used = {};
        Object.keys(entries).forEach((file) => {
            extract(file, entries[file]).refs.forEach((ref) => {
                const raw = ref.raw.trim();
                if (!raw || raw.charAt(0) === '#' || raw.charAt(0) === '?' || /\{\{|\{%|<%|\$\{|<\?/.test(raw) || /^([a-z][a-z0-9+.-]*:|\/\/)/i.test(raw)) return;
                const target = Project.resolveRelativePath(file, raw);
                if (target) (used[target] = used[target] || []).push({ file: file, line: ref.line });
            });
        });
        return used;
    }

    return { createChecker: createChecker, extract: extract, usage: usage };
});

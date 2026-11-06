/*
 * BookCheck: the Problems tab's checks for a book (P5-04, D-040). Report only: nothing is rewritten.
 *
 * check(entries, { assets, heads }) reads the book as EPUBCheck would and returns { problems }, each { file, start,
 * end, line, code, severity, category, message } with offsets into `file`. Categories: 'package' (the container,
 * package document, nav, file names, media types, cover, chapter size), 'links' (every href and src in the
 * chapters and every url() in the stylesheets), 'accessibility', and 'markup' (Xhtml.check's rules, ids, lang).
 * Errors are rules EPUBCheck 5.4.0 enforces (its message ID is cited); warnings are readers' or WCAG's advice;
 * info notes legacy EPUB 2 parts. heads: { path: Uint8Array } of an image's first bytes, so its format can be
 * checked against its media type. Chapter scans are cached by text, so a check after one edit re-reads one file.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./xml-ast.js'), require('./book.js'), require('./nav.js'), require('./xhtml.js'), require('./links.js'));
    else root.BookCheck = factory(root.XmlAst, root.Book, root.Nav, root.Xhtml, root.Links);
})(typeof self !== 'undefined' ? self : this, function (XmlAst, Book, Nav, Xhtml, Links) {
    'use strict';

    const NS = {
        xhtml: 'http://www.w3.org/1999/xhtml', epub: 'http://www.idpf.org/2007/ops', opf: 'http://www.idpf.org/2007/opf',
        xml: 'http://www.w3.org/XML/1998/namespace', xmlns: 'http://www.w3.org/2000/xmlns/', xlink: 'http://www.w3.org/1999/xlink',
        svg: 'http://www.w3.org/2000/svg', mathml: 'http://www.w3.org/1998/Math/MathML', ssml: 'http://www.w3.org/2001/10/synthesis'
    };
    const KNOWN_NS = new Set(Object.keys(NS).map((k) => NS[k]));
    const CONTENT_TYPES = { 'application/xhtml+xml': true, 'image/svg+xml': true };
    // Adobe-based readers have failed on content documents over about 300 KB, and long ones page slowly everywhere.
    const CHAPTER_LIMIT = 300 * 1024;
    const HEADING = /^h([1-6])$/;
    // XHTML attributes that load a resource. EPUB 3.3 §3.6: only audio, video, and fonts may be remote.
    const RESOURCES = { img: ['src'], audio: ['src'], video: ['src', 'poster'], source: ['src'], track: ['src'], script: ['src'], iframe: ['src'], embed: ['src'], object: ['data'], link: ['href'], input: ['src'] };
    const REMOTE_OK = { audio: 1, video: 1, source: 1 };
    // Image signatures, for OPF-029 (the file does not match its media type) and PKG-021 (corrupted image).
    const SIGNATURES = [
        ['image/png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
        ['image/jpeg', [0xff, 0xd8, 0xff]],
        ['image/gif', [0x47, 0x49, 0x46, 0x38]],
        ['image/webp', [0x52, 0x49, 0x46, 0x46, -1, -1, -1, -1, 0x57, 0x45, 0x42, 0x50]]
    ];
    const IMAGE_NAMES = { 'image/png': 'a PNG', 'image/jpeg': 'a JPEG', 'image/gif': 'a GIF', 'image/webp': 'a WebP', 'image/svg+xml': 'an SVG' };
    // EPUB 3.3 §4.2.3: characters a file name must not contain.
    const BAD_NAME = /["*:<>?\\\u0000-\u001f\u007f-\u009f-﷐-﷯￰-￿]/;

    const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
    const collapse = (s) => String(s || '').replace(/[ \t\n\r\f]+/g, ' ').trim();
    const attrOf = (el, local, ns) => el.attrs.find((a) => a.local === local && a.ns === (ns || null)) || null;
    const valueOf = (el, local, ns) => { const a = attrOf(el, local, ns); return a ? a.value : null; };
    const decode = (s) => { try { return decodeURIComponent(s); } catch (e) { return s; } };

    // Text a reader hears: text nodes and the alt of images inside.
    function spoken(node) {
        if (!node) return '';
        if (node.type === 'text' || node.type === 'cdata') return node.value;
        if (node.type !== 'element') return '';
        if (node.local === 'img') return valueOf(node, 'alt') || '';
        return (node.children || []).map(spoken).join('');
    }
    const named = (el) => Boolean(collapse(valueOf(el, 'aria-label') || valueOf(el, 'aria-labelledby') || valueOf(el, 'title') || spoken(el)));

    function sniff(head) {
        if (typeof head === 'string') return /<svg[\s>]/.test(head.slice(0, 4096)) ? 'image/svg+xml' : null;
        const hit = SIGNATURES.find((s) => s[1].every((b, i) => b === -1 || head[i] === b));
        if (hit) return hit[0];
        const text = String.fromCharCode.apply(null, Array.from(head.subarray(0, 256)));
        return /^(﻿|\xef\xbb\xbf)?\s*<(\?xml|svg|!--)/.test(text) ? 'image/svg+xml' : null;
    }

    // One content document's own problems, ids, and references.
    function scan(path, text) {
        const res = Xhtml.check(text, { path: path });
        const ast = res.ast;
        const problems = res.problems.map((p) => Object.assign({ category: 'markup' }, p));
        const ids = new Set(), refs = [];
        const usable = ast.documentElement && (ast.wellFormed || ast.errors.every((e) => e.code === 'undeclared-entity'));
        if (!usable) return { problems: problems, ids: ids, refs: refs };
        const add = (category, severity, code, message, start, end) => problems.push({ category: category, severity: severity, code: code, message: message, path: path, start: start, end: end });
        const at = (category, severity, code, message, el) => add(category, severity, code, message, el.start, el.openEnd);
        const firstAt = new Map();
        let previous = 0;
        const inNav = (el) => { for (let p = ast.byId[el.parentId]; p; p = ast.byId[p.parentId]) if (p.ns === NS.xhtml && p.local === 'nav') return true; return false; };
        const ref = (el, a, kind) => refs.push({ kind: kind, raw: a.value, start: a.valueStart, end: a.valueEnd, local: el.local, attr: a.local, inNav: inNav(el) });
        ast.elements.forEach((el) => {
            const idAttr = attrOf(el, 'id') || attrOf(el, 'id', NS.xml);
            if (idAttr && idAttr.value) {
                // HTML and XML: an id is unique in its document (EPUBCheck RSC-005).
                if (firstAt.has(idAttr.value)) add('markup', 'error', 'duplicate-id', 'The id "' + idAttr.value + '" is already used on line ' + firstAt.get(idAttr.value) + '. Each id in a chapter must be different (EPUBCheck RSC-005).', idAttr.start, idAttr.end);
                else firstAt.set(idAttr.value, XmlAst.position(ast, idAttr.start).line + 1);
                ids.add(idAttr.value);
            }
            // HTML: when lang and xml:lang are both set they must match, ignoring case (EPUBCheck RSC-005).
            const lang = valueOf(el, 'lang'), xmlLang = valueOf(el, 'lang', NS.xml);
            if (lang != null && xmlLang != null && lang.toLowerCase() !== xmlLang.toLowerCase()) at('markup', 'error', 'lang-mismatch', 'lang="' + lang + '" and xml:lang="' + xmlLang + '" disagree; give both the same language (HTML; EPUBCheck RSC-005).', el);
            el.attrs.forEach((a) => {
                // EPUB 3.3 §6.1.3.5: a custom attribute's namespace must not be on w3.org or idpf.org (EPUBCheck HTM-054).
                if (a.ns && !KNOWN_NS.has(a.ns) && /^[a-z]+:\/\/([^/]*\.)?(w3|idpf)\.org(\/|$)/i.test(a.ns)) add('markup', 'error', 'reserved-namespace', 'The attribute ' + a.name + ' uses the namespace ' + a.ns + '; custom attributes must not use a w3.org or idpf.org namespace (EPUB 3.3 §6.1.3.5; EPUBCheck HTM-054).', a.start, a.end);
            });
            if (el.ns === NS.svg && (el.local === 'image' || el.local === 'use')) {
                const a = attrOf(el, 'href') || attrOf(el, 'href', NS.xlink);
                if (a) ref(el, a, 'resource');
            }
            if (el.ns !== NS.xhtml) return;
            if ((el.local === 'a' || el.local === 'area') && attrOf(el, 'href')) ref(el, attrOf(el, 'href'), 'link');
            (RESOURCES[el.local] || []).forEach((name) => { const a = attrOf(el, name); if (a && collapse(a.value)) ref(el, a, 'resource'); });
            // WCAG 2 1.1.1: an image needs a text alternative; alt="" marks it decorative. EPUBCheck allows none.
            if (el.local === 'img' && !attrOf(el, 'alt')) at('accessibility', 'warning', 'img-alt-missing', 'This image has no alt text, so readers who listen hear nothing, or the file name. Describe it, or set alt="" if it is decorative (WCAG 2 1.1.1).', el);
            const level = HEADING.exec(el.local);
            if (level) {
                const n = Number(level[1]);
                if (previous && n > previous + 1) at('accessibility', 'warning', 'heading-skip', 'The headings jump from h' + previous + ' to h' + n + ', so the chapter outline has a gap. Use h' + (previous + 1) + ' here (WCAG 2 1.3.1).', el);
                previous = n;
                if (!named(el)) at('accessibility', 'warning', 'heading-empty', 'This <' + el.local + '> is empty; screen readers announce a heading with no name.', el);
            }
            if (el.local === 'a' && attrOf(el, 'href') && !named(el)) at('accessibility', 'warning', 'link-no-text', 'This link has no text, so a screen reader cannot say where it goes. Add text or an aria-label (WCAG 2 2.4.4).', el);
            if (el === ast.documentElement && lang == null && xmlLang == null) at('accessibility', 'warning', 'lang-missing', '<html> has no lang or xml:lang, so a screen reader may read the chapter in the wrong voice. Set both to the book\'s language (WCAG 2 3.1.1).', el);
        });
        return { problems: problems, ids: ids, refs: refs };
    }

    function createChecker() {
        const cache = new Map();
        function scanned(path, text) {
            let hit = cache.get(path);
            if (!hit || hit.text !== text) { hit = { text: text, result: scan(path, text) }; cache.set(path, hit); }
            return hit.result;
        }

        function check(entries, options) {
            const o = options || {};
            const assets = o.assets || [];
            const heads = o.heads || {};
            const assetSet = new Set(assets);
            const exists = (p) => has(entries, p) || assetSet.has(p);
            const all = Array.from(new Set(Object.keys(entries).concat(assets)));
            const problems = [];
            // Lines count from 1, worked out from the offset (XmlAst counts from 0).
            const lineAt = (file, offset) => { const t = entries[file]; let n = 1; if (typeof t === 'string') for (let i = 0; i < offset && i < t.length; i++) if (t.charCodeAt(i) === 10) n++; return n; };
            const push = (p, category) => problems.push({ file: p.path, start: p.start || 0, end: p.end || 0, line: lineAt(p.path, p.start || 0), code: p.code, severity: p.severity, category: p.category || category, message: p.message });
            const read = Book.read(entries, { assets: assets });
            read.problems.forEach((p) => push(p, 'package'));
            const model = read.model;
            // EPUB 3.3 §4.2.3: file names; EPUBCheck warns about spaces (PKG-010).
            all.forEach((path) => {
                const name = path.split('/').pop();
                const p = { path: path, code: 'file-name', severity: 'error' };
                if (BAD_NAME.test(path) || /\.$/.test(name)) push(Object.assign(p, { message: '"' + path + '" has a character file names must not use (" * : < > ? \\, control or private-use characters) or ends in a full stop (EPUB 3.3 §4.2.3).' }), 'package');
                else if (/ /.test(path)) push(Object.assign(p, { code: 'file-name-space', severity: 'warning', message: '"' + path + '" has a space in its name, which some older readers cannot open. Rename it with hyphens (EPUBCheck PKG-010).' }), 'package');
            });
            if (!model) return finish(problems, null);
            const opf = model.opfPath;
            const opfAt = (code, severity, message, node) => push({ path: opf, code: code, severity: severity, message: message, start: node ? node.start : 0, end: node ? (node.openEnd || node.end) : 0 }, 'package');
            Nav.read(entries, model).problems.forEach((p) => push(p, 'package'));
            // EPUB 2's opf: attributes (opf:role, opf:file-as, opf:scheme, opf:event) are not in the EPUB 3 schema.
            model.ast.elements.forEach((el) => el.attrs.forEach((a) => {
                if (a.ns === NS.opf) push({ path: opf, code: 'opf-attribute', severity: 'error', start: a.start, end: a.end, message: a.name + ' is an EPUB 2 attribute that EPUB 3 does not allow. Use a <meta refines> instead, as the Book tab writes (EPUBCheck RSC-005).' }, 'package');
            }));
            if (!model.cover && model.manifest.node) opfAt('cover-missing', 'warning', 'No image is marked as the cover (properties="cover-image"), so stores and libraries show a blank or a page of text. Set a cover in the Book tab.', model.manifest.node);
            const byPath = new Map();
            model.manifest.items.forEach((it) => { if (it.path && !byPath.has(it.path)) byPath.set(it.path, it); });
            // Linked records (EPUB 3.3 §5.5.6) are exported though the manifest must not list them.
            const linked = new Set(model.metadata.links.map((l) => l.path).filter(Boolean));
            all.forEach((path) => {
                if (path === 'mimetype' || path === opf || /^META-INF\//.test(path) || byPath.has(path) || linked.has(path)) return;
                push({ path: path, code: 'not-in-manifest', severity: 'warning', message: '"' + path + '" is not in the manifest, so it is left out of the exported book. Remove it, or link it from a chapter and list it.' }, 'package');
            });
            const spine = new Set(model.spine.itemrefs.map((r) => r.item && r.item.path).filter(Boolean));
            const folded = new Map();
            all.forEach((p) => folded.set(p.toLowerCase(), p));
            const scans = new Map();
            model.manifest.items.forEach((it) => {
                if (!it.path || !it.exists) return;
                const data = has(entries, it.path) ? entries[it.path] : heads[it.path];
                if (it.mediaType === 'application/xhtml+xml' && typeof data === 'string') {
                    const s = scanned(it.path, data);
                    scans.set(it.path, s);
                    s.problems.forEach((p) => push(p));
                    if (data.length > CHAPTER_LIMIT) push({ path: it.path, code: 'chapter-size', severity: 'warning', message: it.path + ' is ' + Math.round(data.length / 1024) + ' KB; some readers fail on chapters over 300 KB, and long ones turn pages slowly. Split it into smaller chapters.' }, 'package');
                } else if (/^image\//.test(it.mediaType || '') && IMAGE_NAMES[it.mediaType] && data != null && (typeof data === 'string' || data instanceof Uint8Array)) {
                    const found = sniff(data);
                    if (!found) opfAt('image-unreadable', 'error', it.path + ' is listed as ' + it.mediaType + ' but is not a readable image (EPUBCheck PKG-021).', it.node);
                    else if (found !== it.mediaType) opfAt('media-type-mismatch', 'error', it.path + ' is listed as ' + it.mediaType + ' but holds ' + IMAGE_NAMES[found] + ' image. Fix its media-type, or replace the file (EPUBCheck OPF-029).', it.node);
                } else if (it.mediaType === 'text/css' && typeof data === 'string') {
                    Links.extract(it.path, data).refs.forEach((r) => checkRef(it.path, Object.assign({ kind: 'resource', local: 'css' }, r)));
                }
            });
            scans.forEach((s, path) => s.refs.forEach((r) => checkRef(path, r)));
            return finish(problems, model);

            function checkRef(file, r) {
                const raw = collapse(r.raw);
                const bad = (code, message) => push({ path: file, code: code, severity: 'error', start: r.start, end: r.end, message: message }, 'links');
                if (!raw) return;
                if (/^data:/i.test(raw)) {
                    // EPUB 3.3 §3.7: a data URL must not open as a top-level document (EPUBCheck RSC-029).
                    if (r.kind === 'link') bad('link-data-url', 'A link cannot open a data: URL in a reading system; link to a chapter instead (EPUB 3.3 §3.7; EPUBCheck RSC-029).');
                    return;
                }
                const t = Book.resolveHref(file, raw);
                if (t.remote) {
                    if (r.kind === 'link' || r.local === 'css') return;
                    const chapter = byPath.get(file);
                    const listed = model.manifest.items.some((it) => it.remote && it.href === raw);
                    if (!REMOTE_OK[r.local] || r.attr !== 'src') bad('remote-resource', '"' + raw + '" is on the web; a book must carry its ' + (r.local === 'img' ? 'images' : 'files') + ' inside it. Add the file to the book (EPUB 3.3 §3.6; EPUBCheck RSC-006).');
                    else if (!listed) bad('remote-not-in-manifest', '"' + raw + '" is played from the web, so it must be listed in the manifest with its full URL (EPUB 3.3 §3.6; EPUBCheck RSC-008).');
                    if (REMOTE_OK[r.local] && r.attr === 'src' && chapter && chapter.properties.indexOf('remote-resources') === -1) bad('remote-resources-missing', 'This chapter plays "' + raw + '" from the web, so its manifest item needs properties="remote-resources" (EPUB 3.3 §5.6.2; EPUBCheck OPF-014).');
                    return;
                }
                if (t.outside || t.invalid) { bad('link-invalid', '"' + raw + '" is not a valid path inside the book.'); return; }
                const self = t.path === file;
                if (!self && !r.inNav) {
                    if (!exists(t.path)) {
                        const same = folded.get(t.path.toLowerCase());
                        bad('link-missing', same ? '"' + raw + '" matches ' + same + ' only if case is ignored; file names in a book are case-sensitive (EPUBCheck RSC-007).' : '"' + raw + '" points at ' + t.path + ', which is not in the book (EPUBCheck RSC-007).');
                        return;
                    }
                    const item = byPath.get(t.path);
                    if (!item) { bad('link-not-in-manifest', t.path + ' is in the book but not in the manifest, so reading systems may not load it (EPUBCheck RSC-008).'); return; }
                    if (r.kind === 'link') {
                        if (!CONTENT_TYPES[item.mediaType]) { bad('link-not-content', 'A link must open a chapter, not ' + item.mediaType + ' (' + t.path + '). Show it in a chapter instead (EPUBCheck RSC-010).'); return; }
                        if (!spine.has(t.path)) { bad('link-not-in-spine', 'The link opens ' + t.path + ', which is not in the reading order. Add it in the Chapters tab (EPUBCheck RSC-011).'); return; }
                    }
                }
                if (r.kind === 'link' && t.fragment && !/^epubcfi\(/.test(t.fragment) && scans.has(t.path)) {
                    const id = decode(t.fragment);
                    if (!scans.get(t.path).ids.has(id)) bad('fragment-missing', 'No element has the id "' + id + '"' + (self ? ' in this chapter' : ' in ' + t.path) + ', so the link goes to the top of the page (EPUBCheck RSC-012).');
                }
            }
        }

        // Problems in book order: the container, the package document, then the manifest's files.
        function finish(problems, model) {
            const order = [Book.CONTAINER_PATH].concat(model ? [model.opfPath].concat(model.manifest.items.map((i) => i.path)) : []);
            const rank = (f) => { const i = order.indexOf(f); return i === -1 ? order.length : i; };
            problems.sort((a, b) => (rank(a.file) - rank(b.file)) || (a.file < b.file ? -1 : a.file > b.file ? 1 : 0) || (a.start - b.start));
            return { problems: problems };
        }

        return { check: check };
    }

    const check = (entries, options) => createChecker().check(entries, options);

    return { CHAPTER_LIMIT: CHAPTER_LIMIT, sniff: sniff, scan: scan, createChecker: createChecker, check: check };
});

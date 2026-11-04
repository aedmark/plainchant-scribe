/*
 * BookStage: picks the chapter the Reading Stage shows and builds the document it loads (P2-01, D-018).
 *
 * The Stage loads a chapter as application/xhtml+xml, the way reading systems parse it, so markup that is not
 * well-formed shows as an error rather than being repaired. assemble() splices a copy of the chapter: the book's
 * stylesheets are inlined (with @import followed inside the book), asset URLs point at the Studio's Blob URLs, and
 * scripts, event handler attributes, and javascript: URLs are removed, so book content never runs (SECURITY).
 * The book's own files are never changed.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./xml-ast.js'), require('./book.js'), require('./nav.js'));
    else root.BookStage = factory(root.XmlAst, root.Book, root.Nav);
})(typeof self !== 'undefined' ? self : this, function (XmlAst, Book, Nav) {
    'use strict';

    const XHTML = 'http://www.w3.org/1999/xhtml';
    const XLINK = 'http://www.w3.org/1999/xlink';
    const CONTAINER = 'META-INF/container.xml';
    const URL_ATTRS = { src: true, poster: true, href: true, data: true };
    const UNSAFE = /^\s*(?:javascript|vbscript):/i;
    const MAX_IMPORT_DEPTH = 8;
    // Reader settings (P2-02, D-020): overrides on the Stage's copy only. Text size scales the book's own root size
    // (stage-book.js does it on load, from the computed value), so em and rem follow and px does not.
    const READER = {
        sizes: [75, 90, 100, 115, 130, 150, 175, 200],
        // Vertical and horizontal page margins, in the book's body em.
        margins: { none: [0, 0], narrow: [0.5, 0.75], normal: [1, 1.5], wide: [1.5, 3] },
        modes: ['paged', 'scroll'],
        // Device presets (P2-04, D-022): portrait screen sizes in CSS px; Fit fills the Stage. Approximate by nature.
        devices: {
            fit: null,
            phone: { label: 'Phone', width: 390, height: 844 },
            eink: { label: 'E-ink 6"', width: 600, height: 800, greyscale: true, still: true },
            tablet: { label: 'Tablet', width: 820, height: 1180 }
        },
        orientations: ['portrait', 'landscape'],
        themes: {
            light: { page: '#ffffff', text: '#000000', link: null },
            sepia: { page: '#f4ecd8', text: '#5b4636', link: '#8a3b12' },
            dark: { page: '#121212', text: '#e0e0e0', link: '#8ab4f8' }
        },
        defaults: { size: 100, margins: 'normal', theme: 'light', mode: 'paged', device: 'fit', orientation: 'portrait' }
    };

    const has = (o, k) => Object.prototype.hasOwnProperty.call(o || {}, k);
    const isBook = (entries) => typeof (entries || {})[CONTAINER] === 'string';

    // Spine documents in reading order that are XHTML content documents in the working copy.
    function chapters(entries, assets) {
        if (!isBook(entries)) return [];
        const r = Book.read(entries, { assets: assets });
        if (!r.model) return [];
        return r.model.spine.itemrefs.map((ref) => ref.item).filter((it) => it && it.mediaType === 'application/xhtml+xml' && it.path && typeof entries[it.path] === 'string').map((it) => it.path);
    }

    // The spine's XHTML documents with their linear flag (EPUB 3.3 §5.7.2: linear="no" items are auxiliary).
    function readingOrder(entries, assets) {
        if (!isBook(entries)) return [];
        const r = Book.read(entries, { assets: assets });
        if (!r.model) return [];
        return r.model.spine.itemrefs.filter((ref) => ref.item && ref.item.mediaType === 'application/xhtml+xml' && ref.item.path && typeof entries[ref.item.path] === 'string')
            .map((ref) => ({ path: ref.item.path, linear: ref.linear }));
    }

    // The previous (dir -1) or next (dir 1) linear chapter from path, as a reader steps; null at either end. From a
    // document outside the spine, next is the first chapter.
    function neighbour(entries, path, dir, assets) {
        const order = readingOrder(entries, assets);
        const at = order.findIndex((o) => o.path === path);
        if (at === -1) return dir > 0 && order.length ? (order.find((o) => o.linear) || order[0]).path : null;
        for (let i = at + dir; i >= 0 && i < order.length; i += dir) if (order[i].linear) return order[i].path;
        return null;
    }

    // What a link in a chapter leads to: { kind: 'fragment' | 'chapter' | 'external' | 'file' | 'missing' | 'invalid',
    // path, fragment }. Chapters are XHTML documents in the book; a file is any other book file.
    function linkTarget(entries, fromPath, href, assets) {
        const raw = String(href == null ? '' : href).trim();
        const r = Book.resolveHref(fromPath, raw);
        let fragment = r.fragment;
        try { fragment = fragment == null ? null : decodeURIComponent(fragment); } catch (e) { /* keep it as written */ }
        if (r.remote) return { kind: 'external', path: null, fragment: null, href: raw };
        if (r.outside || r.invalid || !r.path) return { kind: 'invalid', path: null, fragment: null, href: raw };
        if (r.path === fromPath) return { kind: 'fragment', path: fromPath, fragment: fragment, href: raw };
        if (typeof (entries || {})[r.path] === 'string' && /\.xhtml?$/i.test(r.path)) return { kind: 'chapter', path: r.path, fragment: fragment, href: raw };
        if (has(entries, r.path) || (assets || []).indexOf(r.path) !== -1) return { kind: 'file', path: r.path, fragment: fragment, href: raw };
        return { kind: 'missing', path: r.path, fragment: fragment, href: raw };
    }

    // The nav document's toc as a tree of { label, path, fragment, children }, or [] when there is none.
    function contents(entries, assets) {
        if (!isBook(entries)) return [];
        const r = Book.read(entries, { assets: assets });
        const nav = r.model ? Nav.read(entries, r.model).nav : null;
        if (!nav || !nav.toc) return [];
        const conv = (e) => ({ label: e.label, path: e.target && !e.target.remote ? e.target.path : null, fragment: e.target ? e.target.fragment : null, children: e.children.map(conv) });
        return nav.toc.entries.map(conv);
    }

    // The chapter to show: the preferred path if it is an XHTML document of the book, else the first in the spine.
    function chapterFor(entries, preferred, assets) {
        if (!isBook(entries)) return null;
        if (preferred && /\.xhtml?$/i.test(preferred) && typeof entries[preferred] === 'string') return preferred;
        const list = chapters(entries, assets);
        if (list.length) return list[0];
        return Object.keys(entries).filter((p) => /\.xhtml$/i.test(p)).sort()[0] || null;
    }

    function assetUrl(urls, fromPath, raw) {
        const r = Book.resolveHref(fromPath, raw);
        if (!r.path || r.remote) return null;
        return has(urls, r.path) ? urls[r.path] + (r.fragment != null ? '#' + r.fragment : '') : null;
    }

    // Rewrites url() references to Blob URLs and inlines @import of the book's own stylesheets.
    function rewriteCss(css, cssPath, entries, urls, seen, depth) {
        const withImports = String(css).replace(/@import\s+(?:url\(\s*)?(['"]?)([^'")\s;]+)\1\s*\)?([^;]*);/gi, (full, q, href, media) => {
            const r = Book.resolveHref(cssPath, href);
            if (!r.path || r.remote || typeof entries[r.path] !== 'string' || seen.has(r.path) || depth >= MAX_IMPORT_DEPTH) return full;
            const inner = rewriteCss(entries[r.path], r.path, entries, urls, new Set(seen).add(r.path), depth + 1);
            const m = media.trim();
            return m ? '@media ' + m + ' {\n' + inner + '\n}' : inner;
        });
        return withImports.replace(/url\(\s*(['"]?)([^'")]*?)\1\s*\)/gi, (full, q, raw) => {
            const hit = assetUrl(urls, cssPath, raw);
            return hit ? 'url("' + hit + '")' : full;
        });
    }

    function readerPrefs(prefs) {
        const p = prefs || {}, d = READER.defaults;
        return {
            size: READER.sizes.indexOf(p.size) !== -1 ? p.size : d.size,
            margins: has(READER.margins, p.margins) ? p.margins : d.margins,
            theme: has(READER.themes, p.theme) ? p.theme : d.theme,
            mode: READER.modes.indexOf(p.mode) !== -1 ? p.mode : d.mode,
            device: has(READER.devices, p.device) ? p.device : d.device,
            orientation: READER.orientations.indexOf(p.orientation) !== -1 ? p.orientation : d.orientation
        };
    }

    // Margins and the theme's page and text colours are forced on html and body, as a reading system does; colours
    // the book sets on particular elements stay, and its link colours win over the theme's.
    // Paged mode (P2-03, D-021) lays the body out in columns one viewport wide: each column's width plus the gap is
    // exactly 100vw, so page n starts at scrollLeft = n * viewport width. Media are kept within one page.
    function readerCss(prefs) {
        const p = readerPrefs(prefs), t = READER.themes[p.theme];
        const v = READER.margins[p.margins][0] + 'em', h = READER.margins[p.margins][1] + 'em';
        const lines = [
            '/* Scribe reader settings: on the Stage only, never written to the book (P2-02). */',
            'html, body { background-color: ' + t.page + ' !important; color: ' + t.text + ' !important; }',
            'body { margin: 0 !important; padding: ' + (v === '0em' && h === '0em' ? '0' : v + ' ' + h) + ' !important; }'
        ];
        if (t.link) lines.push('a:link, a:visited { color: ' + t.link + '; }');
        if (p.mode === 'paged') {
            const gap = 'calc(2 * ' + h + ')';
            lines.push(
                'html { height: 100% !important; overflow: hidden !important; }',
                'body { box-sizing: border-box !important; height: 100vh !important; overflow: visible !important; column-width: calc(100vw - ' + gap + ') !important; column-gap: ' + gap + ' !important; column-fill: auto !important; }',
                'img, svg, video { max-width: 100% !important; max-height: calc(100vh - 2 * ' + v + ') !important; object-fit: contain; }'
            );
        }
        // An e-ink screen does not animate. (Its greyscale is a filter on the Stage frame, so it covers the page too.)
        const device = READER.devices[p.device];
        if (device && device.still) lines.push('*, *::before, *::after { animation: none !important; transition: none !important; }');
        return lines.join('\n');
    }

    // The screen size for a device and orientation, or null for Fit.
    function deviceSize(prefs) {
        const p = readerPrefs(prefs), dev = READER.devices[p.device];
        if (!dev) return null;
        const landscape = p.orientation === 'landscape';
        return { width: landscape ? dev.height : dev.width, height: landscape ? dev.width : dev.height, greyscale: !!dev.greyscale, label: dev.label };
    }

    // The scale that fits a device screen into the space available, never above 1.
    function fitScale(size, availWidth, availHeight) {
        if (!size || !(availWidth > 0) || !(availHeight > 0)) return 1;
        return Math.min(1, availWidth / size.width, availHeight / size.height);
    }

    // Returns { ok: true, xhtml } or { ok: false, errors } when the chapter is not well-formed.
    // options.css is added last in <head>, after the book's own styles.
    function assemble(entries, path, assetUrls, options) {
        const text = (entries || {})[path];
        if (typeof text !== 'string') return { ok: false, errors: [{ message: 'The chapter "' + path + '" is not in the book.', line: 0, column: 0 }] };
        const urls = assetUrls || {};
        const ast = XmlAst.parse(text);
        if (!ast.wellFormed) return { ok: false, errors: ast.errors };
        const edits = [];
        const gone = new Set();
        const inside = (el) => { for (let p = ast.byId[el.parentId]; p; p = ast.byId[p.parentId]) if (gone.has(p)) return true; return false; };

        ast.elements.forEach((el) => {
            if (inside(el)) return;
            const local = el.local;
            if (local === 'script') { gone.add(el); edits.push({ start: el.start, end: el.end, text: '' }); return; }
            const rel = el.ns === XHTML && local === 'link' ? ' ' + String(XmlAst.getAttr(el, 'rel') || '').toLowerCase().split(/\s+/).join(' ') + ' ' : '';
            if (rel.indexOf(' stylesheet ') !== -1) {
                const r = Book.resolveHref(path, XmlAst.getAttr(el, 'href') || '');
                gone.add(el);
                if (r.path && !r.remote && typeof entries[r.path] === 'string') {
                    const css = rewriteCss(entries[r.path], r.path, entries, urls, new Set([r.path]), 0);
                    const name = el.prefix ? el.prefix + ':style' : 'style';
                    const media = XmlAst.getAttr(el, 'media');
                    edits.push({ start: el.start, end: el.end, text: '<' + name + (media ? ' media="' + XmlAst.escapeAttr(media) + '"' : '') + '>' + XmlAst.escapeText(css) + '</' + name + '>' });
                } else edits.push({ start: el.start, end: el.end, text: '' });
                return;
            }
            if (el.ns === XHTML && local === 'style') {
                const css = XmlAst.textContent(el);
                const next = rewriteCss(css, path, entries, urls, new Set(), 0);
                if (next !== css) edits.push.apply(edits, XmlAst.setText(ast, el, next));
            }
            el.attrs.forEach((a) => {
                if (a.ns === XmlAst.NS_XMLNS) return;
                const name = a.local.toLowerCase();
                if (!a.ns && /^on/.test(name)) { edits.push.apply(edits, XmlAst.removeAttr(ast, el, a.name)); return; }
                const isUrl = (!a.ns && URL_ATTRS[name]) || (a.ns === XLINK && name === 'href');
                if (isUrl && UNSAFE.test(a.value)) { edits.push.apply(edits, XmlAst.removeAttr(ast, el, a.name)); return; }
                if (isUrl && !(el.ns === XHTML && local === 'a')) {
                    const hit = assetUrl(urls, path, a.value);
                    if (hit) edits.push.apply(edits, XmlAst.setAttr(ast, el, a.name, hit));
                } else if (!a.ns && name === 'style') {
                    const next = rewriteCss(a.value, path, entries, urls, new Set(), 0);
                    if (next !== a.value) edits.push.apply(edits, XmlAst.setAttr(ast, el, a.name, next));
                }
            });
        });
        // The Studio's own Stage script (the Design bridge) goes last in <body>, after every book script is gone, in a
        // CDATA section so the XML parser leaves it alone.
        const script = options && options.script;
        if (script) {
            const body = XmlAst.elementChildren(ast.documentElement).find((el) => el.local === 'body' && el.ns === XHTML);
            if (body && !body.selfClosing) {
                const name = body.prefix ? body.prefix + ':script' : 'script';
                edits.push({ start: body.closeStart, end: body.closeStart, text: '<' + name + ' id="scribe-bridge">//<![CDATA[\n' + String(script).split(']]>').join(']]]]><![CDATA[>') + '\n//]]></' + name + '>' });
            }
        }
        const extra = options && options.css;
        if (extra) {
            const root = ast.documentElement;
            const head = XmlAst.elementChildren(root).find((el) => el.local === 'head' && el.ns === XHTML);
            const name = (head || root).prefix ? (head || root).prefix + ':style' : 'style';
            const style = '<' + name + ' id="scribe-reader">' + XmlAst.escapeText(extra) + '</' + name + '>';
            if (head && !head.selfClosing) edits.push({ start: head.closeStart, end: head.closeStart, text: style });
            else if (head) edits.push({ start: head.start, end: head.end, text: '<' + head.name + '>' + style + '</' + head.name + '>' });
            else if (!root.selfClosing) edits.push({ start: root.openEnd, end: root.openEnd, text: style });
        }
        return { ok: true, xhtml: XmlAst.applyEdits(text, edits) };
    }

    return { CONTAINER: CONTAINER, READER: READER, isBook: isBook, chapters: chapters, chapterFor: chapterFor, readingOrder: readingOrder, neighbour: neighbour, linkTarget: linkTarget, contents: contents, assemble: assemble, rewriteCss: rewriteCss, readerPrefs: readerPrefs, readerCss: readerCss, deviceSize: deviceSize, fitScale: fitScale };
});

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
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./xml-ast.js'), require('./book.js'));
    else root.BookStage = factory(root.XmlAst, root.Book);
})(typeof self !== 'undefined' ? self : this, function (XmlAst, Book) {
    'use strict';

    const XHTML = 'http://www.w3.org/1999/xhtml';
    const XLINK = 'http://www.w3.org/1999/xlink';
    const CONTAINER = 'META-INF/container.xml';
    const URL_ATTRS = { src: true, poster: true, href: true, data: true };
    const UNSAFE = /^\s*(?:javascript|vbscript):/i;
    const MAX_IMPORT_DEPTH = 8;

    const has = (o, k) => Object.prototype.hasOwnProperty.call(o || {}, k);
    const isBook = (entries) => typeof (entries || {})[CONTAINER] === 'string';

    // Spine documents in reading order that are XHTML content documents in the working copy.
    function chapters(entries, assets) {
        if (!isBook(entries)) return [];
        const r = Book.read(entries, { assets: assets });
        if (!r.model) return [];
        return r.model.spine.itemrefs.map((ref) => ref.item).filter((it) => it && it.mediaType === 'application/xhtml+xml' && it.path && typeof entries[it.path] === 'string').map((it) => it.path);
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

    // Returns { ok: true, xhtml } or { ok: false, errors } when the chapter is not well-formed.
    function assemble(entries, path, assetUrls) {
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
        return { ok: true, xhtml: XmlAst.applyEdits(text, edits) };
    }

    return { CONTAINER: CONTAINER, isBook: isBook, chapters: chapters, chapterFor: chapterFor, assemble: assemble, rewriteCss: rewriteCss };
});

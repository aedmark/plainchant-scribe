/*
 * BookLayout: fixed-layout books (P7-01, D-052), whole-book. EPUB 3.3 §8.2.2: a book is pre-paginated when its package
 * says <meta property="rendition:layout">pre-paginated</meta> (once, without refines, §8.2.2.1), and a spine item may
 * override that with rendition:layout-pre-paginated or rendition:layout-reflowable (§8.2.2.1.1). Each fixed-layout
 * XHTML document sets its page size in the first viewport meta tag in its head, with exactly one positive width and
 * height (§8.2.2.6), written in the Appendix F syntax. rendition:spread (§8.2.2.3) asks for two-page spreads, and
 * page-spread-left/right (§8.2.2.4, D.7) place a page in one.
 *
 * Scribe writes the whole-book switch, one page size, and the spread setting. Overrides and page-spread properties
 * from imported books are kept and checked, and the Stage follows them. The checks are EPUBCheck 5.4.0's: HTM-046,
 * HTM-047, HTM-056, HTM-057, and HTM-059 for the viewport, HTM-048 for an SVG page, its package schema (RSC-005) for
 * the rendition properties and spine overrides, and OPF-086 for the deprecated portrait spread. A second viewport and
 * a viewport in a reflowable page (HTM-060a/b) are EPUBCheck usage notes, so they are notes here too.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./xml-ast.js'), require('./book.js'), require('./opf-edit.js'));
    else root.BookLayout = factory(root.XmlAst, root.Book, root.OpfEdit);
})(typeof self !== 'undefined' ? self : this, function (XmlAst, Book, OpfEdit) {
    'use strict';

    const XHTML = 'http://www.w3.org/1999/xhtml';
    const PRESETS = [
        { id: 'portrait', label: 'Portrait 3:4', width: 1200, height: 1600 },
        { id: 'landscape', label: 'Landscape 4:3', width: 1600, height: 1200 },
        { id: 'tablet', label: 'Tablet 3:4, high resolution', width: 1536, height: 2048 },
        { id: 'square', label: 'Square', width: 1600, height: 1600 }
    ];
    const VALUES = {
        'rendition:layout': ['reflowable', 'pre-paginated'],
        'rendition:orientation': ['landscape', 'portrait', 'auto'],
        'rendition:spread': ['none', 'landscape', 'portrait', 'both', 'auto']
    };
    // Spine overrides: no more than one of each group on an itemref (§8.2.2.1.1, §8.2.2.2.1, §8.2.2.3.1, §8.2.2.4).
    const OVERRIDES = {
        layout: ['rendition:layout-pre-paginated', 'rendition:layout-reflowable'],
        orientation: ['rendition:orientation-auto', 'rendition:orientation-landscape', 'rendition:orientation-portrait'],
        spread: ['rendition:spread-auto', 'rendition:spread-both', 'rendition:spread-landscape', 'rendition:spread-none', 'rendition:spread-portrait']
    };
    const SPREADS = ['none', 'landscape', 'both'];
    const MAX_SIDE = 10000;

    function fail(code, message) {
        const e = new Error(message);
        e.code = code;
        return e;
    }

    function readBook(entries, assets) {
        const model = Book.read(entries, { assets: assets || [] }).model;
        if (!model) throw fail('unreadable', 'content.opf cannot be read; fix it in the code editor first.');
        return model;
    }

    const globalMeta = (model, property) => model.metadata.metas.filter((m) => m.property === property && m.refines == null);
    const globalValue = (model, property, fallback) => { const m = globalMeta(model, property)[0]; return m ? m.value : fallback; };

    // True when the spine item is a fixed-layout document: its override, else the book's rendition:layout.
    function fixedRef(model, ref) {
        if (ref.properties.indexOf('rendition:layout-pre-paginated') !== -1) return true;
        if (ref.properties.indexOf('rendition:layout-reflowable') !== -1) return false;
        return globalValue(model, 'rendition:layout', 'reflowable') === 'pre-paginated';
    }

    const xhtmlRefs = (entries, model) => model.spine.itemrefs.filter((r) => r.item && r.item.path && r.item.mediaType === 'application/xhtml+xml' && typeof entries[r.item.path] === 'string');
    const fixedDocs = (entries, model) => xhtmlRefs(entries, model).filter((r) => fixedRef(model, r)).map((r) => r.item.path);

    // Appendix F: name[=value] pairs split by runs of ";", ",", or space, after whitespace normalisation, with optional
    // spaces around "=". Returns { width, height, problems }, width and height as numbers or "device-width"/"device-height".
    function parseViewport(content) {
        const text = String(content == null ? '' : content).replace(/[ \t\n\r]+/g, ' ').trim().replace(/ ?= ?/g, '=');
        const problems = [];
        const props = text ? text.split(/[;, ]+/) : [];
        const seen = { width: [], height: [] };
        // A leading or trailing separator leaves an empty name, which is a syntax error.
        let syntax = !text;
        props.forEach((p) => {
            const at = p.indexOf('=');
            const name = at === -1 ? p : p.slice(0, at), value = at === -1 ? null : p.slice(at + 1);
            if (!name || (value != null && (value === '' || value.indexOf('=') !== -1))) syntax = true;
            if (seen[name]) seen[name].push(value);
        });
        if (syntax) problems.push({ code: 'viewport-syntax', message: 'The viewport "' + content + '" is not written as name=value pairs separated by commas (EPUB 3.3 Appendix F; EPUBCheck HTM-047).' });
        const out = { width: null, height: null, problems: problems };
        if (syntax) return out;
        ['width', 'height'].forEach((dim) => {
            const vals = seen[dim];
            if (!vals.length) { problems.push({ code: 'viewport-' + dim + '-missing', message: 'The viewport has no ' + dim + '; a fixed-layout page needs both width and height (EPUB 3.3 §8.2.2.6; EPUBCheck HTM-056).' }); return; }
            if (vals.length > 1) { problems.push({ code: 'viewport-repeated', message: 'The viewport gives ' + dim + ' ' + vals.length + ' times; give it once (EPUB 3.3 §8.2.2.6; EPUBCheck HTM-059).' }); return; }
            const v = vals[0];
            if (v === 'device-' + dim) { out[dim] = v; return; }
            const n = /^(\d+(\.\d+)?|\.\d+)$/.test(v || '') ? Number(v) : NaN;
            if (!(n > 0)) { problems.push({ code: 'viewport-value', message: 'The viewport ' + dim + ' "' + (v == null ? '' : v) + '" must be a positive number or device-' + dim + ' (EPUB 3.3 §8.2.2.6; EPUBCheck HTM-057).' }); return; }
            out[dim] = n;
        });
        return out;
    }

    // The head's viewport meta elements in document order.
    function viewports(ast) {
        const head = ast.wellFormed && ast.documentElement ? XmlAst.elementChildren(ast.documentElement).find((el) => el.ns === XHTML && el.local === 'head') : null;
        if (!head) return { head: null, metas: [] };
        return { head: head, metas: XmlAst.elementChildren(head).filter((el) => el.ns === XHTML && el.local === 'meta' && String(XmlAst.getAttr(el, 'name') || '').trim() === 'viewport') };
    }

    // The page size of a document's first viewport, or null.
    function pageSize(text) {
        const v = viewports(XmlAst.parse(text || ''));
        if (!v.metas.length) return null;
        const p = parseViewport(XmlAst.getAttr(v.metas[0], 'content'));
        return typeof p.width === 'number' && typeof p.height === 'number' ? { width: p.width, height: p.height } : null;
    }

    // { on, spread, orientation, width, height, docs }: the size is the one most fixed pages use.
    function state(entries, assets) {
        const model = Book.read(entries, { assets: assets || [] }).model;
        if (!model) return { on: false, spread: 'auto', orientation: 'auto', width: null, height: null, docs: [] };
        const docs = fixedDocs(entries, model);
        const counts = new Map();
        docs.forEach((p) => { const s = pageSize(entries[p]); if (s) { const k = s.width + 'x' + s.height; counts.set(k, (counts.get(k) || 0) + 1); } });
        let best = null;
        counts.forEach((n, k) => { if (!best || n > counts.get(best)) best = k; });
        const size = best ? best.split('x').map(Number) : [null, null];
        return { on: globalValue(model, 'rendition:layout', 'reflowable') === 'pre-paginated', spread: globalValue(model, 'rendition:spread', 'auto'), orientation: globalValue(model, 'rendition:orientation', 'auto'), width: size[0], height: size[1], docs: docs };
    }

    function checkSize(width, height) {
        [width, height].forEach((n) => { if (!(Number.isInteger(n) && n > 0 && n <= MAX_SIDE)) throw fail('bad-size', 'A page size is a whole number of pixels from 1 to ' + MAX_SIDE + '.'); });
    }

    const viewportText = (width, height) => 'width=' + width + ', height=' + height;

    // Sets a document's first viewport to the size, adding one after <title> (or first in <head>) when it has none.
    function withViewport(text, width, height) {
        const ast = XmlAst.parse(text);
        const v = viewports(ast);
        if (!v.head) return text;
        if (v.metas.length) {
            const was = XmlAst.getAttr(v.metas[0], 'content');
            return was === viewportText(width, height) ? text : XmlAst.applyEdits(text, XmlAst.setAttr(ast, v.metas[0], 'content', viewportText(width, height)));
        }
        const name = v.head.prefix ? v.head.prefix + ':meta' : 'meta';
        const markup = '<' + name + ' name="viewport" content="' + viewportText(width, height) + '"/>';
        const title = XmlAst.elementChildren(v.head).find((el) => el.ns === XHTML && el.local === 'title');
        return XmlAst.applyEdits(text, title ? XmlAst.insert(ast, title, 'after', markup) : XmlAst.insert(ast, v.head, 'prepend', markup));
    }

    function withoutViewports(text) {
        const ast = XmlAst.parse(text);
        const v = viewports(ast);
        return v.metas.length ? XmlAst.applyEdits(text, [].concat.apply([], v.metas.map((m) => XmlAst.remove(ast, m)))) : text;
    }

    function setGlobal(entries, assets, property, value) {
        const model = readBook(entries, assets);
        const ops = value == null ? OpfEdit.removeMeta(model, property) : OpfEdit.setMeta(model, property, value);
        return ops.length ? Object.assign({}, entries, { [model.opfPath]: XmlAst.applyEdits(entries[model.opfPath], ops) }) : entries;
    }

    function mapDocs(entries, paths, fn) {
        let next = entries;
        paths.forEach((p) => { const t = fn(next[p]); if (t !== next[p]) next = Object.assign({}, next, { [p]: t }); });
        return next;
    }

    // Makes the whole book fixed layout: rendition:layout and rendition:spread in the package, and the size in every
    // spine XHTML document's viewport. options: { width, height, spread }.
    function enable(entries, assets, options) {
        const o = options || {};
        checkSize(o.width, o.height);
        const spread = o.spread || 'landscape';
        if (SPREADS.indexOf(spread) === -1) throw fail('bad-spread', 'Spreads are none, landscape, or both.');
        let next = setGlobal(entries, assets, 'rendition:layout', 'pre-paginated');
        next = setGlobal(next, assets, 'rendition:spread', spread);
        return mapDocs(next, fixedDocs(next, readBook(next, assets)), (t) => withViewport(t, o.width, o.height));
    }

    // Back to reflowable: the rendition:layout and rendition:spread metas go, and so do the viewport meta tags of the
    // pages that were fixed, since reading systems ignore them in reflowable documents (EPUBCheck HTM-060b).
    function disable(entries, assets) {
        const docs = fixedDocs(entries, readBook(entries, assets));
        let next = setGlobal(entries, assets, 'rendition:layout', null);
        next = setGlobal(next, assets, 'rendition:spread', null);
        return mapDocs(next, docs, withoutViewports);
    }

    function setSize(entries, assets, width, height) {
        checkSize(width, height);
        return mapDocs(entries, fixedDocs(entries, readBook(entries, assets)), (t) => withViewport(t, width, height));
    }

    function setSpread(entries, assets, spread) {
        if (SPREADS.indexOf(spread) === -1) throw fail('bad-spread', 'Spreads are none, landscape, or both.');
        return setGlobal(entries, assets, 'rendition:spread', spread);
    }

    // A fixed page without a viewport (a chapter added since) gets the book's size. Returns the same object when
    // nothing changes, and never touches a reflowable book.
    function refresh(entries, assets) {
        const model = Book.read(entries, { assets: assets || [] }).model;
        if (!model || globalValue(model, 'rendition:layout', 'reflowable') !== 'pre-paginated') return entries;
        const s = state(entries, assets);
        if (!s.width) return entries;
        const bare = fixedDocs(entries, model).filter((p) => { const v = viewports(XmlAst.parse(entries[p])); return v.head && !v.metas.length; });
        return mapDocs(entries, bare, (t) => withViewport(t, s.width, s.height));
    }

    // The book's linear XHTML pages as spreads, [left, right] with null for an empty side, in reading order. A spread
    // fills its first slot (left in a left-to-right book) and then its second; the book's first page starts in the
    // second slot, as a cover does, page-spread-left/right move a page to a side, and page-spread-center or
    // spread-none shows it alone (§8.2.2.4).
    function spreads(entries, assets) {
        const model = Book.read(entries, { assets: assets || [] }).model;
        if (!model) return [];
        const rtl = model.spine.pageProgressionDirection === 'rtl';
        const a = rtl ? 'right' : 'left', b = rtl ? 'left' : 'right';
        const out = [];
        let open = null, next = b;
        const close = () => { if (open) { out.push([open.left, open.right]); open = null; } };
        xhtmlRefs(entries, model).filter((r) => r.linear).forEach((r) => {
            const props = r.properties;
            const side = props.some((p) => p === 'page-spread-left' || p === 'rendition:page-spread-left') ? 'left'
                : props.some((p) => p === 'page-spread-right' || p === 'rendition:page-spread-right') ? 'right'
                    : props.some((p) => p === 'rendition:page-spread-center' || p === 'rendition:spread-none') ? 'center' : next;
            if (side === 'center') { close(); out.push([r.item.path, null]); next = a; return; }
            if (side === a) { close(); open = { left: null, right: null }; open[a] = r.item.path; next = b; return; }
            if (!open) open = { left: null, right: null };
            open[b] = r.item.path;
            close();
            next = a;
        });
        close();
        return out;
    }

    // Problems rows: the rendition properties in the package, the spine overrides, and each fixed page's viewport.
    function rows(entries, model) {
        const out = [];
        if (!model) return out;
        const opf = model.opfPath, opfText = entries[opf] || '';
        const lineAt = (text, at) => text.slice(0, at).split('\n').length;
        const row = (file, node, text, severity, code, message) => out.push({ file: file, start: node ? node.start : 0, end: node ? node.end : 0, line: node ? lineAt(text, node.start) : 0, code: code, severity: severity, category: 'package', message: message });
        Object.keys(VALUES).forEach((property) => {
            const metas = model.metadata.metas.filter((m) => m.property === property);
            metas.filter((m) => m.refines != null).forEach((m) => row(opf, m.node, opfText, 'error', 'rendition-refines', property + ' applies to the whole book, so it cannot refine another element (EPUB 3.3 §8.2.2).'));
            const book = metas.filter((m) => m.refines == null);
            if (book.length > 1) row(opf, book[1].node, opfText, 'error', 'rendition-repeated', property + ' is declared ' + book.length + ' times; declare it once (EPUB 3.3 §8.2.2).');
            book.forEach((m) => { if (VALUES[property].indexOf(m.value) === -1) row(opf, m.node, opfText, 'error', 'rendition-value', '"' + m.value + '" is not a value of ' + property + '; use ' + VALUES[property].join(', ') + ' (EPUB 3.3 §8.2.2).'); });
            if (property === 'rendition:spread' && book.some((m) => m.value === 'portrait')) row(opf, book[0].node, opfText, 'warning', 'rendition-spread-portrait', 'rendition:spread "portrait" is deprecated; use "both" (EPUB 3.3 §8.2.2.3).');
        });
        model.spine.itemrefs.forEach((r) => {
            Object.keys(OVERRIDES).forEach((group) => {
                const hits = r.properties.filter((p) => OVERRIDES[group].indexOf(p) !== -1);
                if (hits.length > 1) row(opf, r.node, opfText, 'error', 'rendition-override-repeated', 'This spine item has ' + hits.join(' and ') + '; use one ' + group + ' override (EPUB 3.3 §8.2.2).');
            });
            const left = r.properties.some((p) => p === 'page-spread-left' || p === 'rendition:page-spread-left');
            const right = r.properties.some((p) => p === 'page-spread-right' || p === 'rendition:page-spread-right');
            if (left && right) row(opf, r.node, opfText, 'error', 'page-spread-both', 'This spine item is placed on both the left and the right of a spread (EPUB 3.3 §8.2.2.4; EPUBCheck RSC-005).');
        });
        model.spine.itemrefs.forEach((r) => {
            const it = r.item;
            if (!it || !it.path || typeof entries[it.path] !== 'string') return;
            const text = entries[it.path];
            const fixed = fixedRef(model, r);
            if (it.mediaType === 'image/svg+xml') {
                if (!fixed) return;
                const ast = XmlAst.parse(text);
                if (ast.wellFormed && ast.documentElement && XmlAst.getAttr(ast.documentElement, 'viewBox') == null) row(it.path, ast.documentElement, text, 'error', 'svg-viewbox-missing', 'An SVG fixed-layout page needs a viewBox on its svg element (EPUB 3.3 §8.2.2.6; EPUBCheck HTM-048).');
                return;
            }
            if (it.mediaType !== 'application/xhtml+xml') return;
            const v = viewports(XmlAst.parse(text));
            if (!v.head) return;
            if (!fixed) {
                v.metas.forEach((m) => row(it.path, m, text, 'info', 'viewport-reflowable', 'Reading systems ignore a viewport in a reflowable page; remove it (EPUBCheck HTM-060b).'));
                return;
            }
            if (!v.metas.length) { row(it.path, v.head, text, 'error', 'viewport-missing', 'This fixed-layout page has no <meta name="viewport" content="width=…, height=…"/> in its head (EPUB 3.3 §8.2.2.6; EPUBCheck HTM-046).'); return; }
            parseViewport(XmlAst.getAttr(v.metas[0], 'content')).problems.forEach((p) => row(it.path, v.metas[0], text, 'error', p.code, p.message));
            v.metas.slice(1).forEach((m) => row(it.path, m, text, 'info', 'viewport-second', 'Reading systems use only the first viewport in a fixed-layout page, so this one is ignored (EPUB 3.3 §8.2.2.6; EPUBCheck HTM-060a).'));
        });
        return out;
    }

    return { PRESETS: PRESETS, SPREADS: SPREADS, parseViewport: parseViewport, pageSize: pageSize, fixedDocs: (entries, assets) => { const m = Book.read(entries, { assets: assets || [] }).model; return m ? fixedDocs(entries, m) : []; }, state: state, enable: enable, disable: disable, setSize: setSize, setSpread: setSpread, refresh: refresh, spreads: spreads, rows: rows };
});

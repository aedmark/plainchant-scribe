/*
 * BookOrder: reading-order checks across the book (P6-02, D-045). Pure, no DOM.
 *
 * Two rules, each reported by EPUBCheck 5.4.0 as well (observed 2026-11-06, see test/epubcheck.test.js):
 * - EPUB 3.3 §5.7.2 (linear): EPUB creators MUST provide a way to reach every non-linear spine item, such as a link
 *   from the content or the nav (EPUBCheck OPF-096, an error).
 * - The toc lists chapters in spine order, so moving through the contents matches moving through the book
 *   (EPUBCheck NAV-011, a warning; WCAG 2 1.3.2 Meaningful Sequence and 2.4.3 Focus Order).
 * CSS that reorders content visually (order, *-reverse) is CssLint's css-reading-order.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./xml-ast.js'), require('./book.js'), require('./nav.js'));
    else root.BookOrder = factory(root.XmlAst, root.Book, root.Nav);
}(typeof self !== 'undefined' ? self : this, function (XmlAst, Book, Nav) {
    'use strict';

    const XHTML = 'http://www.w3.org/1999/xhtml';
    const SVG = 'http://www.w3.org/2000/svg';
    const XLINK = 'http://www.w3.org/1999/xlink';

    function rows(entries, model) {
        const out = [];
        const opfText = model.ast.text || '';
        const lineIn = (text, start) => text.slice(0, start).split('\n').length;
        // Which files some other file links to. A link to the same document does not count; EPUBCheck 5.4.0 counts it,
        // so it misses an unreachable non-linear chapter that has footnotes (observed 2026-11-06).
        const linked = new Set();
        model.manifest.items.forEach((item) => {
            if (!item.path || typeof entries[item.path] !== 'string' || !/xhtml|svg/.test(item.mediaType || '')) return;
            XmlAst.parse(entries[item.path]).elements.forEach((el) => {
                const href = el.ns === XHTML && (el.local === 'a' || el.local === 'area') ? XmlAst.getAttr(el, 'href') : el.ns === SVG && el.local === 'a' ? (XmlAst.getAttr(el, 'href') || XmlAst.getAttr(el, 'href', XLINK)) : null;
                if (href == null) return;
                const r = Book.resolveHref(item.path, href);
                if (r && !r.outside && !r.invalid && r.path !== item.path) linked.add(r.path);
            });
        });
        model.spine.itemrefs.forEach((ref) => {
            if (ref.linear || !ref.item || !ref.item.path || linked.has(ref.item.path)) return;
            out.push({ file: model.opfPath, start: ref.node.start, end: ref.node.openEnd || ref.node.end, line: lineIn(opfText, ref.node.start), code: 'nonlinear-unreachable', severity: 'error', category: 'accessibility',
                message: ref.item.path + ' is outside the reading order (linear="no") and nothing links to it, so readers cannot reach it. Link to it from a chapter or the contents, or put it in the reading order (EPUB 3.3 §5.7.2; EPUBCheck OPF-096).' });
        });
        const nav = Nav.read(entries, model).nav;
        if (nav && nav.toc) {
            const spine = model.spine.itemrefs.map((r) => r.item && r.item.path);
            let last = -1, lastLabel = '';
            const flat = Nav.entries(nav.toc).filter((e) => e.target && e.target.path);
            for (const e of flat) {
                const at = spine.indexOf(e.target.path);
                if (at === -1) continue;
                if (at < last) {
                    const node = e.labelNode || e.node;
                    out.push({ file: nav.path, start: node.start, end: node.openEnd || node.end, line: lineIn(entries[nav.path], node.start), code: 'toc-order', severity: 'warning', category: 'accessibility',
                        message: '"' + (e.label || e.target.path) + '" comes after "' + lastLabel + '" in the contents but before it in the reading order, so the contents jump back. Put the contents in reading order, for example with Generate contents (EPUBCheck NAV-011; WCAG 2 1.3.2).' });
                    break;
                }
                last = at;
                lastLabel = e.label || e.target.path;
            }
        }
        return out;
    }

    return { rows: rows };
}));

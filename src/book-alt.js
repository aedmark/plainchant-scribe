/*
 * BookAlt: every image's alt text in reading order, for the alt-text pass (P6-02, D-045). Pure, no DOM.
 *
 * WCAG 2 1.1.1: an image that carries meaning has a text alternative; a decorative one has alt="" so it is skipped.
 * HTML requires alt on img in most cases, and EPUBCheck reports a missing one. setAlt splices only the alt value.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./xml-ast.js'), require('./book.js'));
    else root.BookAlt = factory(root.XmlAst, root.Book);
}(typeof self !== 'undefined' ? self : this, function (XmlAst, Book) {
    'use strict';

    const XHTML = 'http://www.w3.org/1999/xhtml';
    const collapse = (s) => String(s || '').replace(/\s+/g, ' ').trim();

    // Images in the spine's chapters: { path, chapter, index, start, end, src, file, alt (null when missing), caption }.
    function list(entries, model) {
        const out = [];
        model.spine.itemrefs.forEach((r) => {
            const path = r.item && r.item.path;
            if (!path || r.item.mediaType !== 'application/xhtml+xml' || typeof entries[path] !== 'string') return;
            const ast = XmlAst.parse(entries[path]);
            const title = ast.elements.find((e) => e.local === 'title' && e.ns === XHTML);
            const byId = ast.byId;
            let index = 0;
            ast.elements.forEach((el) => {
                if (el.ns !== XHTML || el.local !== 'img') return;
                const src = XmlAst.getAttr(el, 'src') || '';
                const resolved = src ? Book.resolveHref(path, src) : null;
                let caption = '';
                for (let p = byId[el.parentId]; p; p = byId[p.parentId]) {
                    if (p.local === 'figure') { const fc = XmlAst.elementChildren(p).find((c) => c.local === 'figcaption'); caption = fc ? collapse(XmlAst.textContent(fc)) : ''; break; }
                }
                out.push({ path: path, chapter: title ? collapse(XmlAst.textContent(title)) : path, index: index++, start: el.start, end: el.openEnd, src: src, file: resolved && !resolved.outside && !resolved.invalid ? resolved.path : null, alt: XmlAst.getAttr(el, 'alt'), caption: caption });
            });
        });
        // Missing alt first, then decorative, then described; reading order within each.
        const rank = (i) => (i.alt == null ? 0 : i.alt === '' ? 1 : 2);
        return out.map((i, n) => Object.assign(i, { order: n })).sort((a, b) => rank(a) - rank(b) || a.order - b.order);
    }

    // Sets the alt of the image starting at start in text. decorative gives alt="".
    function setAlt(text, start, alt, decorative) {
        const ast = XmlAst.parse(text || '');
        const el = ast.elements.find((e) => e.start === start && e.local === 'img' && e.ns === XHTML);
        if (!el) { const e = new Error('The image has moved; reopen the list.'); e.code = 'moved'; throw e; }
        const value = decorative ? '' : collapse(alt);
        if (!decorative && !value) { const e = new Error('Describe the image, or mark it decorative.'); e.code = 'empty'; throw e; }
        return XmlAst.applyEdits(text, XmlAst.setAttr(ast, el, 'alt', value));
    }

    function counts(items) {
        return { total: items.length, missing: items.filter((i) => i.alt == null).length, decorative: items.filter((i) => i.alt === '').length };
    }

    return { list: list, setAlt: setAlt, counts: counts };
}));

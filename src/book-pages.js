/*
 * BookPages: print page numbers in a reflowable book (P6-02, D-045). Pure, no DOM.
 *
 * EPUB Accessibility 1.1 §3.4.1.3 (W3C Recommendation, 17 October 2024): a book with page navigation MUST have a page
 * list that links every page-break marker, and when the pages come from a print edition MUST name that source. A
 * marker is <span epub:type="pagebreak" role="doc-pagebreak" id aria-label/> (EPUB Accessibility Techniques 1.1
 * §5.1.1, W3C Group Note, 13 March 2025): the label is what is announced, so it is not text in the line. The source
 * is <meta property="pageBreakSource">: an ISBN as urn:isbn:…, a description of the edition, or "none" for page
 * numbers made for the e-book alone (§5.1.4).
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./xml-ast.js'), require('./book.js'), require('./opf-edit.js'), require('./nav.js'));
    else root.BookPages = factory(root.XmlAst, root.Book, root.OpfEdit, root.Nav);
}(typeof self !== 'undefined' ? self : this, function (XmlAst, Book, OpfEdit, Nav) {
    'use strict';

    const EPUB = 'http://www.idpf.org/2007/ops';
    const XHTML = 'http://www.w3.org/1999/xhtml';
    const SOURCE = 'pageBreakSource';
    const tokens = (v) => String(v || '').split(/\s+/).filter(Boolean);
    const collapse = (s) => String(s || '').replace(/\s+/g, ' ').trim();

    function fail(code, message) {
        const e = new Error(message);
        e.code = code;
        return e;
    }

    const isMarker = (el) => el.ns === XHTML && (tokens(XmlAst.getAttr(el, 'type', EPUB)).indexOf('pagebreak') !== -1 || tokens(XmlAst.getAttr(el, 'role')).indexOf('doc-pagebreak') !== -1);
    const labelOf = (el) => collapse(XmlAst.getAttr(el, 'aria-label')) || collapse(XmlAst.getAttr(el, 'title')) || collapse(XmlAst.textContent(el));

    // The XHTML documents of the spine, in reading order (non-linear ones too), as paths.
    function spinePaths(entries, model) {
        return model.spine.itemrefs.filter((r) => r.item && r.item.path && r.item.mediaType === 'application/xhtml+xml' && typeof entries[r.item.path] === 'string').map((r) => r.item.path);
    }

    // Every page-break marker in reading order: { path, id, label, start, end }.
    function list(entries, model) {
        const out = [];
        spinePaths(entries, model).forEach((path) => {
            const ast = XmlAst.parse(entries[path]);
            ast.elements.filter(isMarker).forEach((el) => out.push({ path: path, id: XmlAst.getAttr(el, 'id'), label: labelOf(el), start: el.start, end: el.openEnd }));
        });
        return out;
    }

    // The label to offer at a place: one more than the last numbered marker before it in reading order.
    function nextLabel(entries, model, path, offset) {
        const order = spinePaths(entries, model);
        const before = list(entries, model).filter((m) => order.indexOf(m.path) < order.indexOf(path) || (m.path === path && m.start < offset));
        const last = before.length ? before[before.length - 1].label : '';
        if (/^\d+$/.test(last)) return String(Number(last) + 1);
        const roman = /^[ivxlcdm]+$/i.test(last) ? fromRoman(last) : 0;
        if (roman) return toRoman(roman + 1, last === last.toUpperCase());
        return before.length ? '' : '1';
    }

    function fromRoman(s) {
        const v = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
        const t = s.toLowerCase();
        let n = 0;
        for (let i = 0; i < t.length; i++) n += v[t[i]] < (v[t[i + 1]] || 0) ? -v[t[i]] : v[t[i]];
        return toRoman(n, false) === t ? n : 0;
    }

    function toRoman(n, upper) {
        const table = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
        let out = '';
        table.forEach(([v, s]) => { while (n >= v) { out += s; n -= v; } });
        return upper ? out.toUpperCase() : out;
    }

    // Puts a marker at offset, which must be in the text of the chapter's body (not inside a tag). Returns { text, id }.
    function insertAt(text, offset, label) {
        const l = collapse(label);
        if (!l) throw fail('no-label', 'Enter the page number, as printed.');
        const ast = XmlAst.parse(text || '');
        if (!ast.wellFormed) throw fail('not-well-formed', 'The chapter is not well-formed; fix it in the code editor first.');
        const body = ast.elements.find((e) => e.local === 'body' && e.ns === XHTML);
        const inTag = ast.elements.some((e) => (e.start < offset && offset < e.openEnd) || (!e.selfClosing && e.closeStart < offset && offset < e.end));
        if (!body || inTag || offset <= body.openEnd || offset > body.closeStart) throw fail('bad-offset', 'A page break goes in the text of a chapter.');
        const ids = new Set(ast.elements.map((e) => XmlAst.getAttr(e, 'id')).filter(Boolean));
        const base = 'page-' + (l.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'n');
        let id = base;
        for (let n = 2; ids.has(id); n++) id = base + '-' + n;
        const q = epubPrefix(ast, body);
        const marker = '<span ' + q + 'type="pagebreak" role="doc-pagebreak" id="' + id + '" aria-label="' + XmlAst.escapeAttr(l, '"') + '"/>';
        return { text: XmlAst.applyEdits(text, [{ start: offset, end: offset, text: marker }]), id: id };
    }

    // The prefix bound to the EPUB namespace on the body (usually epub:), declaring it on the marker when absent.
    function epubPrefix(ast, el) {
        for (let e = el; e; e = ast.byId[e.parentId]) {
            const decl = (e.attrs || []).find((a) => /^xmlns:/.test(a.name) && a.value === EPUB);
            if (decl) return decl.name.slice(6) + ':';
        }
        return 'xmlns:epub="' + EPUB + '" epub:';
    }

    // The nav's page list, rebuilt from the markers in reading order. Returns { entries, count }.
    function buildPageList(entries, model) {
        const markers = list(entries, model);
        const missingId = markers.filter((m) => !m.id);
        if (missingId.length) throw fail('marker-id-missing', 'A page break in ' + missingId[0].path + ' has no id, so the page list cannot link to it. Give it one in the code editor.');
        const nav = Nav.read(entries, model).nav;
        if (!nav) throw fail('nav-unreadable', 'The navigation document cannot be read (see the Problems tab).');
        if (!markers.length) throw fail('no-markers', 'The book has no page breaks yet. Add them with Page break… in the Layout tab.');
        const pages = markers.map((m) => ({ label: m.label || m.id, href: Book.hrefFor(nav.path, m.path) + '#' + m.id }));
        const edits = Nav.setPageList(nav, pages);
        return { entries: Object.assign({}, entries, { [nav.path]: XmlAst.applyEdits(entries[nav.path], edits) }), count: pages.length };
    }

    // The pageBreakSource meta: value '' removes it. As BookMeta-style ops.
    function setSource(value) {
        const v = collapse(value);
        const isbn = v.replace(/[\s-]/g, '');
        const out = /^(97[89])?\d{9}[\dXx]$/.test(isbn) ? 'urn:isbn:' + isbn.toUpperCase() : v;
        return [(model) => (out ? OpfEdit.setMeta(model, SOURCE, out) : OpfEdit.removeMeta(model, SOURCE))];
    }

    function source(model) {
        const m = model.metadata.metas.find((x) => x.property === SOURCE && x.refines == null);
        return m ? m.value : '';
    }

    // Problems-tab rows (EPUB Accessibility 1.1 §3.4.1.3).
    function rows(entries, model) {
        const out = [];
        const lineIn = (path, start) => (entries[path] || '').slice(0, start).split('\n').length;
        const add = (path, start, end, code, message) => out.push({ file: path, start: start, end: end, line: lineIn(path, start), code: code, severity: 'warning', category: 'accessibility', message: message });
        const markers = list(entries, model);
        const nav = Nav.read(entries, model).nav;
        const pageList = nav && nav.pageList;
        const seen = {};
        markers.forEach((m) => {
            if (!m.label) add(m.path, m.start, m.end, 'page-label-missing', 'This page break has no aria-label, so a screen reader cannot say the page number (EPUB Accessibility Techniques 1.1 §5.1.1).');
            if (!m.id) add(m.path, m.start, m.end, 'page-id-missing', 'This page break has no id, so the page list cannot link to it.');
            if (m.label && seen[m.label]) add(m.path, m.start, m.end, 'page-label-repeated', 'Page ' + m.label + ' is marked twice; the second is in ' + m.path + '.');
            seen[m.label] = true;
        });
        const opfLine = (node) => ({ start: node ? node.start : 0, end: node ? (node.openEnd || node.end) : 0 });
        if (markers.length && !pageList) {
            const at = nav ? opfLine(nav.toc && nav.toc.node) : { start: 0, end: 0 };
            add(nav ? nav.path : model.opfPath, at.start, at.end, 'page-list-missing', 'The book has ' + markers.length + ' page ' + (markers.length === 1 ? 'break' : 'breaks') + ' but no page list, which EPUB Accessibility 1.1 §3.4.1.3.2 requires. Use Build page list in the Chapters tab.');
        }
        if (pageList) {
            const linked = new Set((Nav.entries(pageList) || []).filter((e) => e.target && e.target.path).map((e) => e.target.path + '#' + (e.target.fragment || '')));
            const unlinked = markers.filter((m) => m.id && !linked.has(m.path + '#' + m.id));
            if (unlinked.length) { const at = opfLine(pageList.node); add(nav.path, at.start, at.end, 'page-list-incomplete', 'The page list does not link ' + unlinked.length + ' page ' + (unlinked.length === 1 ? 'break' : 'breaks') + ', starting with page ' + (unlinked[0].label || unlinked[0].id) + ' in ' + unlinked[0].path + '. It must link them all (EPUB Accessibility 1.1 §3.4.1.3.2); Build page list redoes it.'); }
        }
        const legacy = model.metadata.metas.some((x) => x.property === 'source-of');
        if ((markers.length || pageList) && !source(model) && !legacy) {
            const md = model.ast.elements.find((el) => el.local === 'metadata');
            const at = opfLine(md);
            add(model.opfPath, at.start, at.end, 'page-source-missing', 'The book has page numbers but does not say where they come from. Give the print edition\'s ISBN, or "none" if they exist only in this e-book, in the Book tab (EPUB Accessibility 1.1 §3.4.1.3.1).');
        }
        return out;
    }

    return { SOURCE: SOURCE, list: list, nextLabel: nextLabel, insertAt: insertAt, buildPageList: buildPageList, setSource: setSource, source: source, rows: rows, toRoman: toRoman };
}));

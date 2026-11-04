/*
 * BookChapters: the chapters organiser's operations on a whole book (P3-02, D-026).
 *
 * Each operation takes the working copy's text files and returns { entries, path, removed } (the new files, the
 * chapter to show, and deleted paths) or throws an Error with a .code. The spine changes through OpfEdit, the
 * table of contents through Nav, and only top-level toc entries that point at a chapter follow it (D-026); every
 * other byte of content.opf and nav.xhtml is kept (D-002).
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./xml-ast.js'), require('./book.js'), require('./opf-edit.js'), require('./nav.js'));
    else root.BookChapters = factory(root.XmlAst, root.Book, root.OpfEdit, root.Nav);
})(typeof self !== 'undefined' ? self : this, function (XmlAst, Book, OpfEdit, Nav) {
    'use strict';

    const XHTML = 'http://www.w3.org/1999/xhtml';

    function fail(code, message) {
        const e = new Error(message);
        e.code = code;
        return e;
    }

    function readBook(entries) {
        const r = Book.read(entries);
        if (!r.model) throw fail('unreadable', 'content.opf cannot be read; fix it in the code editor first.');
        return r.model;
    }

    // Applies one OpfEdit or Nav op to fresh reads, as the other edit paths do.
    function withOpf(entries, op) {
        const model = readBook(entries);
        return Object.assign({}, entries, { [model.opfPath]: XmlAst.applyEdits(entries[model.opfPath], op(model)) });
    }
    function withNav(entries, op) {
        const model = readBook(entries);
        const nav = Nav.read(entries, model).nav;
        if (!nav || !nav.toc) return entries;
        const edits = op(nav, model);
        return edits && edits.length ? Object.assign({}, entries, { [nav.path]: XmlAst.applyEdits(entries[nav.path], edits) }) : entries;
    }

    // A chapter's visible title: its <title>, else its first heading, else its file name.
    function titleOf(text, path) {
        const ast = XmlAst.parse(text || '');
        const pick = (local) => { const el = ast.elements.find((e) => e.local === local && e.ns === XHTML); return el ? XmlAst.textContent(el).replace(/\s+/g, ' ').trim() : ''; };
        return pick('title') || ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].map(pick).find(Boolean) || path.split('/').pop();
    }

    // The spine's XHTML chapters: { path, id, title, linear }.
    function list(entries) {
        const model = readBook(entries);
        return model.spine.itemrefs.filter((r) => r.item && r.item.mediaType === 'application/xhtml+xml' && r.item.path)
            .map((r) => ({ path: r.item.path, id: r.item.id, title: titleOf(entries[r.item.path], r.item.path), linear: r.linear }));
    }

    function slug(title) {
        const s = String(title || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
        return s || 'chapter';
    }

    // Top-level toc entries that point at a chapter itself (no fragment).
    const tocEntriesFor = (nav, path) => (nav && nav.toc ? nav.toc.entries.filter((e) => e.target && e.target.path === path && !e.target.fragment) : []);

    function chapterMarkup(title, id, lang, stylesheets) {
        const t = XmlAst.escapeText(title), l = XmlAst.escapeAttr(lang || 'en');
        return [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<!DOCTYPE html>',
            '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="' + l + '" lang="' + l + '">',
            '<head>',
            '  <title>' + t + '</title>'
        ].concat(stylesheets.map((href) => '  <link rel="stylesheet" type="text/css" href="' + XmlAst.escapeAttr(href) + '"/>'), [
            '</head>',
            '<body epub:type="bodymatter">',
            '  <section epub:type="chapter" id="' + id + '" aria-labelledby="' + id + '-title">',
            '    <h1 id="' + id + '-title">' + t + '</h1>',
            '    <p></p>',
            '  </section>',
            '</body>',
            '</html>',
            ''
        ]).join('\n');
    }

    // Adds a chapter after `after` (a chapter path; default the last), with a toc entry at the matching place.
    function add(entries, title, after) {
        const name = String(title || '').trim();
        if (!name) throw fail('invalid-title', 'Enter a title for the chapter.');
        const model = readBook(entries);
        const chapters = list(entries);
        const ref = chapters.find((c) => c.path === after) || chapters[chapters.length - 1] || null;
        const dir = ref ? ref.path.slice(0, ref.path.lastIndexOf('/') + 1) : model.opfPath.slice(0, model.opfPath.lastIndexOf('/') + 1) + 'text/';
        const base = slug(name);
        let file = base, n = 2;
        const taken = (p) => Object.prototype.hasOwnProperty.call(entries, p) || model.manifest.items.some((i) => i.path === p);
        while (taken(dir + file + '.xhtml')) file = base + '-' + n++;
        const path = dir + file + '.xhtml';
        const ids = new Set(model.ast.elements.map((el) => XmlAst.getAttr(el, 'id')).filter((v) => v != null));
        let id = /^[a-z]/.test(file) ? file : 'c-' + file;
        for (let k = 2; ids.has(id); k++) id = (/^[a-z]/.test(file) ? file : 'c-' + file) + '-' + k;
        // The new chapter links the same stylesheets as the one before it (same folder, so the same hrefs).
        const refAst = ref ? XmlAst.parse(entries[ref.path]) : null;
        const sheets = refAst && refAst.wellFormed ? refAst.elements.filter((el) => el.local === 'link' && /\bstylesheet\b/i.test(XmlAst.getAttr(el, 'rel') || '')).map((el) => XmlAst.getAttr(el, 'href')).filter(Boolean) : [];
        let next = Object.assign({}, entries, { [path]: chapterMarkup(name, id, model.metadata.language, sheets) });
        const index = ref ? chapters.indexOf(ref) + 1 : chapters.length;
        const spineIndex = ref ? model.spine.itemrefs.findIndex((r) => r.item && r.item.path === ref.path) + 1 : model.spine.itemrefs.length;
        next = withOpf(next, (m) => OpfEdit.addItem(m, { id: id, path: path, mediaType: 'application/xhtml+xml' }));
        next = withOpf(next, (m) => OpfEdit.addItemref(m, id, { index: spineIndex }));
        next = withNav(next, (nav) => {
            const anchor = ref ? tocEntriesFor(nav, ref.path).slice(-1)[0] : null;
            const item = { label: name, path: path };
            if (anchor) return Nav.addEntry(nav, anchor, 'after', item);
            return nav.toc.list ? Nav.addEntry(nav, nav.toc, 'append', item) : [];
        });
        return { entries: next, path: path, removed: [], index: index };
    }

    // Sets a chapter's <title>, first heading, and the labels of the toc entries that point at it.
    function rename(entries, path, title) {
        const name = String(title || '').trim();
        if (!name) throw fail('invalid-title', 'Enter a title for the chapter.');
        const ast = XmlAst.parse(entries[path] || '');
        if (!ast.wellFormed) throw fail('not-well-formed', path + ' is not well-formed; fix it in the code editor first.');
        const titleEl = ast.elements.find((e) => e.local === 'title' && e.ns === XHTML);
        const body = ast.elements.find((e) => e.local === 'body' && e.ns === XHTML);
        const heading = body ? ast.elements.find((e) => e.ns === XHTML && /^h[1-6]$/.test(e.local) && e.start > body.start && e.end <= body.end) : null;
        let edits = titleEl ? XmlAst.setText(ast, titleEl, name) : [];
        if (heading) edits = edits.concat(XmlAst.setText(ast, heading, name));
        let next = Object.assign({}, entries, { [path]: XmlAst.applyEdits(entries[path], edits) });
        next = withNav(next, (nav) => tocEntriesFor(nav, path).reduce((acc, e) => acc.concat(Nav.setLabel(nav, e, name)), []));
        return { entries: next, path: path, removed: [] };
    }

    // Links from other chapters to path: [{ from, href }]. The nav document is left out: delete updates it.
    function incomingLinks(entries, path) {
        const out = [];
        const model = Book.read(entries).model;
        const navPath = model && model.nav ? model.nav.path : null;
        Object.keys(entries).filter((p) => p !== path && p !== navPath && /\.xhtml?$/i.test(p)).forEach((from) => {
            const ast = XmlAst.parse(entries[from]);
            if (!ast.wellFormed) return;
            ast.elements.forEach((el) => {
                const href = XmlAst.getAttr(el, 'href');
                if (href == null || el.local === 'link') return;
                const r = Book.resolveHref(from, href);
                if (r.path === path) out.push({ from: from, href: href });
            });
        });
        return out;
    }

    // Deletes a chapter: its file, manifest item, itemref, and the entries pointing at it in every nav (outermost only).
    // A landmarks, page-list, or other nav left with no entries goes too; an emptied toc stays for Problems to report.
    function remove(entries, path) {
        const model = readBook(entries);
        const item = model.manifest.items.find((i) => i.path === path);
        if (!item) throw fail('not-a-chapter', path + ' is not in the manifest.');
        let next = withOpf(entries, (m) => OpfEdit.removeItem(m, item.id));
        next = withNav(next, (nav) => nav.navs.reduce((acc, navObj) => {
            const hit = Nav.entries(navObj).filter((e) => e.target && e.target.path === path);
            if (!hit.length) return acc;
            if (navObj.kind !== 'toc' && hit.length === Nav.entries(navObj).length) return acc.concat(Nav.removeNav(nav, navObj));
            const outer = hit.filter((e) => { for (let p = e.parent; p; p = p.parent) if (hit.indexOf(p) !== -1) return false; return true; });
            return acc.concat(outer.reduce((list, e) => list.concat(Nav.removeEntry(nav, e)), []));
        }, []));
        delete next[path];
        const rest = list(next);
        return { entries: next, path: rest.length ? rest[0].path : null, removed: [path] };
    }

    // Moves a chapter to spine position toIndex (among the chapters listed), and its top-level toc entry with it.
    function move(entries, path, toIndex) {
        const chapters = list(entries);
        const from = chapters.findIndex((c) => c.path === path);
        if (from === -1) throw fail('not-a-chapter', path + ' is not in the spine.');
        const to = Math.max(0, Math.min(chapters.length - 1, toIndex));
        if (to === from) return { entries: entries, path: path, removed: [] };
        const model = readBook(entries);
        const order = chapters.map((c) => c.id);
        order.splice(to, 0, order.splice(from, 1)[0]);
        // Spine items that are not XHTML chapters keep their place; the chapters fill the other slots in the new order.
        const ids = model.spine.itemrefs.map((r) => r.idref);
        const chapterIds = new Set(order);
        let k = 0;
        const full = ids.map((id) => (chapterIds.has(id) ? order[k++] : id));
        let next = withOpf(entries, (m) => OpfEdit.setSpineOrder(m, full));
        next = withNav(next, (nav) => {
            const tree = Nav.toTree(nav.toc);
            const rank = new Map(order.map((id, i) => [chapters.find((c) => c.id === id).path, i]));
            const tops = nav.toc.entries;
            let last = -1;
            const keyed = tree.map((item, i) => {
                const p = tops[i].target && !tops[i].target.fragment ? tops[i].target.path : null;
                if (p != null && rank.has(p)) last = rank.get(p);
                return { item: item, key: last, i: i };
            });
            const sorted = keyed.slice().sort((a, b) => a.key - b.key || a.i - b.i);
            if (sorted.every((s, i) => s.i === i)) return [];
            return Nav.replaceList(nav, nav.toc, sorted.map((s) => s.item));
        });
        return { entries: next, path: path, removed: [] };
    }

    return { list: list, titleOf: titleOf, add: add, rename: rename, remove: remove, move: move, incomingLinks: incomingLinks, slug: slug };
});

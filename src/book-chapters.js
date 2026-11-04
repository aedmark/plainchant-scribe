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

    /* ---------- split and merge (P3-03, D-027) ---------- */

    const ID_REFS = ['aria-labelledby', 'aria-describedby', 'for', 'headers'];
    const indentOf = (text, offset) => { const m = /[ \t]*$/.exec(text.slice(text.lastIndexOf('\n', offset - 1) + 1, offset)); return m ? m[0] : ''; };

    function freePath(entries, model, dir, title) {
        const base = slug(title);
        let file = base, n = 2;
        const taken = (p) => Object.prototype.hasOwnProperty.call(entries, p) || model.manifest.items.some((i) => i.path === p);
        while (taken(dir + file + '.xhtml')) file = base + '-' + n++;
        return { path: dir + file + '.xhtml', file: file };
    }

    function freeItemId(model, file) {
        const ids = new Set(model.ast.elements.map((el) => XmlAst.getAttr(el, 'id')).filter((v) => v != null));
        const stem = /^[a-z]/.test(file) ? file : 'c-' + file;
        let id = stem;
        for (let k = 2; ids.has(id); k++) id = stem + '-' + k;
        return id;
    }

    // Rewrites every href in the book's XHTML files whose target moves. map(target) gets { path, fragment } as the
    // link resolved before the change (from `before(file)`, the file's old path) and returns the new target or null.
    function retarget(entries, before, map) {
        const next = Object.assign({}, entries);
        Object.keys(entries).filter((p) => /\.xhtml?$/i.test(p)).forEach((file) => {
            const ast = XmlAst.parse(entries[file]);
            if (!ast.wellFormed) return;
            let edits = [];
            ast.elements.forEach((el) => {
                if (el.local === 'link') return;
                el.attrs.forEach((a) => {
                    if (a.local !== 'href' || (a.ns && a.ns !== 'http://www.w3.org/1999/xlink')) return;
                    const r = Book.resolveHref(before(file), a.value);
                    if (r.remote || !r.path) return;
                    let fragment = r.fragment;
                    try { fragment = fragment == null ? null : decodeURIComponent(fragment); } catch (e) { /* as written */ }
                    const to = map({ path: r.path, fragment: fragment }, file);
                    if (!to) return;
                    const href = (to.path === file ? '' : Book.hrefFor(file, to.path)) + (to.fragment ? '#' + encodeURIComponent(to.fragment) : '');
                    if (href && href !== a.value) edits = edits.concat(XmlAst.setAttr(ast, el, a.name, href));
                });
            });
            if (edits.length) next[file] = XmlAst.applyEdits(entries[file], edits);
        });
        return next;
    }

    // Splits a chapter at the heading starting at offset `start`: the heading (or the wrapper it opens) and everything
    // after it in the body move to a new chapter right after, named from the heading, with matching wrappers.
    function split(entries, path, start) {
        const model = readBook(entries);
        const text = entries[path];
        const ast = XmlAst.parse(text || '');
        if (!ast.wellFormed) throw fail('not-well-formed', path + ' is not well-formed; fix it in the code editor first.');
        const heading = ast.elements.find((e) => e.start === start && e.ns === XHTML && /^h[1-6]$/.test(e.local));
        if (!heading) throw fail('not-a-heading', 'Select a heading in the chapter to split at.');
        const body = ast.elements.find((e) => e.local === 'body' && e.ns === XHTML);
        if (!body || heading.start < body.openEnd || heading.end > body.closeStart) throw fail('not-a-heading', 'The heading is not in the chapter\'s body.');
        // Climb while the element is the first thing in its parent, so a <section> it opens moves whole.
        let cut = heading;
        for (let up = ast.byId[cut.parentId]; up && up !== body && up.type === 'element'; up = ast.byId[cut.parentId]) {
            if (/\S/.test(text.slice(up.openEnd, cut.start).replace(/<!--[\s\S]*?-->/g, ''))) break;
            cut = up;
        }
        if (!/\S/.test(text.slice(body.openEnd, cut.start).replace(/<!--[\s\S]*?-->/g, ''))) throw fail('nothing-before', 'The heading is at the very start of the chapter, so there is nothing to split off.');
        const wrappers = [];
        for (let up = ast.byId[cut.parentId]; up && up !== body; up = ast.byId[up.parentId]) wrappers.unshift(up);
        const title = XmlAst.textContent(heading).replace(/\s+/g, ' ').trim() || 'Untitled';
        const dir = path.slice(0, path.lastIndexOf('/') + 1);
        const target = freePath(entries, model, dir, title);
        // Wrappers are copied without the attributes that name or point at ids, so no id is duplicated.
        const open = (el) => indentOf(text, el.start) + '<' + el.name + el.attrs.filter((a) => a.local !== 'id' && ID_REFS.indexOf(a.local) === -1).map((a) => ' ' + text.slice(a.start, a.end)).join('') + '>';
        const moved = text.slice(cut.start, body.closeStart);
        let fresh = text.slice(0, body.openEnd) + '\n' + wrappers.map((w) => open(w) + '\n').join('') + indentOf(text, cut.start) + moved + text.slice(body.closeStart);
        const freshAst = XmlAst.parse(fresh);
        const titleEl = freshAst.elements.find((e) => e.local === 'title' && e.ns === XHTML);
        if (titleEl) fresh = XmlAst.applyEdits(fresh, XmlAst.setText(freshAst, titleEl, title));
        const kept = text.slice(0, cut.start).replace(/[ \t]+$/, '') + wrappers.slice().reverse().map((w) => indentOf(text, w.start) + '</' + w.name + '>\n').join('') + text.slice(body.closeStart);
        const movedIds = new Set(ast.elements.filter((e) => e.start >= cut.start && e.end <= body.closeStart).map((e) => XmlAst.getAttr(e, 'id')).filter((v) => v != null));
        let next = Object.assign({}, entries, { [path]: kept, [target.path]: fresh });
        // Links resolve as they did before: the new file's links were written for the old file.
        next = retarget(next, (file) => (file === target.path ? path : file), (t) => {
            if (t.path !== path || !t.fragment) return null;
            return { path: movedIds.has(t.fragment) ? target.path : path, fragment: t.fragment };
        });
        const id = freeItemId(model, target.file);
        const spineIndex = model.spine.itemrefs.findIndex((r) => r.item && r.item.path === path) + 1;
        next = withOpf(next, (m) => OpfEdit.addItem(m, { id: id, path: target.path, mediaType: 'application/xhtml+xml' }));
        next = withOpf(next, (m) => OpfEdit.addItemref(m, id, { index: spineIndex }));
        next = withNav(next, (nav) => {
            if (nav.toc.entries.some((e) => e.target && e.target.path === target.path)) return [];
            const anchor = tocEntriesFor(nav, path).slice(-1)[0];
            const item = { label: title, path: target.path };
            return anchor ? Nav.addEntry(nav, anchor, 'after', item) : (nav.toc.list ? Nav.addEntry(nav, nav.toc, 'append', item) : []);
        });
        return { entries: next, path: target.path, removed: [] };
    }

    // Merges the next chapter in the spine into this one: its body is appended, clashing ids are renamed, links that
    // pointed at it point into this chapter, and it is deleted. This chapter's <head> is kept.
    function merge(entries, path) {
        const chapters = list(entries);
        const at = chapters.findIndex((c) => c.path === path);
        if (at === -1) throw fail('not-a-chapter', path + ' is not in the spine.');
        const other = chapters[at + 1];
        if (!other) throw fail('no-next', 'This is the last chapter, so there is nothing to merge into it.');
        const a = XmlAst.parse(entries[path] || ''), b = XmlAst.parse(entries[other.path] || '');
        if (!a.wellFormed || !b.wellFormed) throw fail('not-well-formed', 'Both chapters must be well-formed; fix them in the code editor first.');
        const bodyA = a.elements.find((e) => e.local === 'body' && e.ns === XHTML), bodyB = b.elements.find((e) => e.local === 'body' && e.ns === XHTML);
        if (!bodyA || !bodyB || bodyA.selfClosing || bodyB.selfClosing) throw fail('not-well-formed', 'Both chapters need a <body>.');
        const idsA = new Set(a.elements.map((e) => XmlAst.getAttr(e, 'id')).filter((v) => v != null));
        const rename = new Map();
        const inB = b.elements.filter((e) => e.start >= bodyB.openEnd && e.end <= bodyB.closeStart);
        inB.forEach((e) => {
            const id = XmlAst.getAttr(e, 'id');
            if (id == null || !idsA.has(id)) return;
            let n = 2, fresh = id + '-' + n;
            while (idsA.has(fresh) || rename.has(fresh)) fresh = id + '-' + (++n);
            rename.set(id, fresh);
        });
        let edits = [];
        inB.forEach((e) => e.attrs.forEach((attr) => {
            if (attr.local === 'id' && rename.has(attr.value)) edits = edits.concat(XmlAst.setAttr(b, e, attr.name, rename.get(attr.value)));
            else if (ID_REFS.indexOf(attr.local) !== -1 && attr.value.split(/\s+/).some((v) => rename.has(v))) edits = edits.concat(XmlAst.setAttr(b, e, attr.name, attr.value.split(/\s+/).map((v) => rename.get(v) || v).join(' ')));
            // A fragment-only link in the next chapter meant its own element, which may now have a new id.
            else if (attr.local === 'href' && attr.value.charAt(0) === '#' && rename.has(decodeURIComponent(attr.value.slice(1)))) edits = edits.concat(XmlAst.setAttr(b, e, attr.name, '#' + rename.get(decodeURIComponent(attr.value.slice(1)))));
        }));
        const textB = XmlAst.applyEdits(entries[other.path], edits);
        const bodyB2 = XmlAst.parse(textB).elements.find((e) => e.local === 'body' && e.ns === XHTML);
        const firstId = (() => { const el = XmlAst.parse(textB).elements.find((e) => e.start >= bodyB2.openEnd && XmlAst.getAttr(e, 'id') != null); return el ? XmlAst.getAttr(el, 'id') : null; })();
        const textA = entries[path];
        const merged = textA.slice(0, bodyA.closeStart) + textB.slice(bodyB2.openEnd, bodyB2.closeStart).replace(/^[ \t]*\r?\n/, '') + textA.slice(bodyA.closeStart);
        let next = Object.assign({}, entries, { [path]: merged });
        // Links into the removed chapter (including the moved part's own) now point into this one.
        next = retarget(next, (file) => file, (t) => {
            if (t.path === other.path) return { path: path, fragment: t.fragment ? (rename.get(t.fragment) || t.fragment) : firstId };
            return null;
        });
        // In the merged chapter, links to itself become fragment-only, and those that pointed at the next chapter's
        // renamed ids follow them. Other files keep their links as written.
        next = retarget(next, (file) => file, (t, file) => (file === path && t.path === path && t.fragment ? { path: path, fragment: t.fragment } : null));
        const model = readBook(next);
        const item = model.manifest.items.find((i) => i.path === other.path);
        if (item) next = withOpf(next, (m) => OpfEdit.removeItem(m, item.id));
        delete next[other.path];
        const sheetsOf = (ast) => ast.elements.filter((el) => el.local === 'link' && /\bstylesheet\b/i.test(XmlAst.getAttr(el, 'rel') || '')).map((el) => XmlAst.getAttr(el, 'href'));
        const lost = sheetsOf(b).filter((h) => sheetsOf(a).indexOf(h) === -1);
        return { entries: next, path: path, removed: [other.path], renamedIds: Array.from(rename.entries()), lostStylesheets: lost };
    }

    return { list: list, titleOf: titleOf, add: add, rename: rename, remove: remove, move: move, incomingLinks: incomingLinks, slug: slug, split: split, merge: merge };
});

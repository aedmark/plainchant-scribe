/*
 * BookNotes: footnotes and endnotes with linked, numbered references (P4-04, D-034).
 *
 * A reference is <a epub:type="noteref" class="noteref"> (EPUB 3 Structural Semantics: noteref, footnote, endnote,
 * endnotes). Footnotes are <aside epub:type="footnote" class="footnote"> at the end of their chapter; endnotes are
 * <li epub:type="endnote" class="endnote"> in a notes document's <section epub:type="endnotes">. Each note's first link
 * goes back to its reference. add() and remove() renumber in reading order (per chapter for footnotes, across the book
 * for endnotes), keeping ids, hrefs, and back links in step. Footnotes are ref-N and note-N; endnotes are endref-N and
 * endnote-N, so a chapter holding both has no duplicate id. All edits are XmlAst splices (D-002).
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./xml-ast.js'), require('./book.js'), require('./opf-edit.js'), require('./nav.js'));
    else root.BookNotes = factory(root.XmlAst, root.Book, root.OpfEdit, root.Nav);
})(typeof self !== 'undefined' ? self : this, function (XmlAst, Book, OpfEdit, Nav) {
    'use strict';

    const XHTML = 'http://www.w3.org/1999/xhtml';
    const EPUB = 'http://www.idpf.org/2007/ops';
    const INLINE = { a: 1, abbr: 1, b: 1, cite: 1, code: 1, em: 1, i: 1, kbd: 1, mark: 1, q: 1, s: 1, small: 1, span: 1, strong: 1, sub: 1, sup: 1, u: 1 };

    function fail(code, message) {
        const e = new Error(message);
        e.code = code;
        return e;
    }

    const types = (el) => String(XmlAst.getAttr(el, 'type', EPUB) || '').split(/\s+/);
    const isNoteref = (el) => el.local === 'a' && types(el).indexOf('noteref') !== -1;
    const isNote = (el) => ['footnote', 'endnote', 'note', 'rearnote'].some((t) => types(el).indexOf(t) !== -1);

    function readBook(entries) {
        const r = Book.read(entries);
        if (!r.model) throw fail('unreadable', 'content.opf cannot be read; fix it in the code editor first.');
        return r.model;
    }

    // The spine's XHTML documents in order.
    const spineDocs = (entries, model) => model.spine.itemrefs.map((r) => r.item).filter((it) => it && it.mediaType === 'application/xhtml+xml' && typeof entries[it.path] === 'string').map((it) => it.path);

    // The document holding the endnotes section, if any.
    function notesDoc(entries, model) {
        return spineDocs(entries, model).find((p) => {
            const ast = XmlAst.parse(entries[p]);
            return ast.wellFormed && ast.elements.some((e) => types(e).indexOf('endnotes') !== -1);
        }) || null;
    }

    function blockAt(ast, start) {
        let el = ast.elements.find((e) => e.start === start);
        while (el && INLINE[el.local]) el = ast.byId[el.parentId];
        if (!el || el.type !== 'element' || el.selfClosing || ['html', 'head', 'body', 'aside', 'section', 'article', 'ol', 'ul', 'table'].indexOf(el.local) !== -1) {
            throw fail('no-block', 'Select a paragraph (or other text block) on the Stage to add a note to it.');
        }
        return el;
    }

    // Where footnotes go: inside a chapter's single top-level section or article, else at the end of <body>.
    function footnoteContainer(ast) {
        const body = ast.elements.find((e) => e.local === 'body' && e.ns === XHTML);
        const kids = XmlAst.elementChildren(body);
        const wrap = kids.length === 1 && (kids[0].local === 'section' || kids[0].local === 'article') ? kids[0] : null;
        return wrap || body;
    }

    function notesMarkup(title, lang) {
        const l = XmlAst.escapeAttr(lang || 'en');
        return ['<?xml version="1.0" encoding="UTF-8"?>', '<!DOCTYPE html>',
            '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="' + l + '" lang="' + l + '">',
            '<head>', '  <title>' + XmlAst.escapeText(title) + '</title>', '</head>',
            '<body epub:type="backmatter">',
            '  <section epub:type="endnotes" role="doc-endnotes" id="notes">',
            '    <h1>' + XmlAst.escapeText(title) + '</h1>',
            '    <ol>', '    </ol>',
            '  </section>', '</body>', '</html>', ''].join('\n');
    }

    // Copies the stylesheet links of a chapter into a new document in the same folder.
    function withSheets(markup, chapterText) {
        const ast = XmlAst.parse(chapterText);
        const links = ast.wellFormed ? ast.elements.filter((el) => el.local === 'link' && /\bstylesheet\b/i.test(XmlAst.getAttr(el, 'rel') || '')).map((el) => chapterText.slice(el.start, el.end)) : [];
        return links.length ? markup.replace('</head>', links.map((l) => '  ' + l + '\n').join('') + '</head>') : markup;
    }

    function ensureNotesDoc(entries, near) {
        let model = readBook(entries);
        const found = notesDoc(entries, model);
        if (found) return { entries: entries, path: found };
        const dir = near.slice(0, near.lastIndexOf('/') + 1);
        let path = dir + 'notes.xhtml';
        for (let n = 2; Object.prototype.hasOwnProperty.call(entries, path) || model.manifest.items.some((i) => i.path === path); n++) path = dir + 'notes-' + n + '.xhtml';
        let next = Object.assign({}, entries, { [path]: withSheets(notesMarkup('Notes', model.metadata.language), entries[near]) });
        const ids = new Set(model.ast.elements.map((el) => XmlAst.getAttr(el, 'id')).filter((v) => v != null));
        let id = 'notes';
        for (let n = 2; ids.has(id); n++) id = 'notes-' + n;
        next = Object.assign({}, next, { [model.opfPath]: XmlAst.applyEdits(next[model.opfPath], OpfEdit.addItem(model, { id: id, path: path, mediaType: 'application/xhtml+xml' })) });
        model = readBook(next);
        next = Object.assign({}, next, { [model.opfPath]: XmlAst.applyEdits(next[model.opfPath], OpfEdit.addItemref(model, id)) });
        model = readBook(next);
        const nav = Nav.read(next, model).nav;
        if (nav && nav.toc && nav.toc.list) next = Object.assign({}, next, { [nav.path]: XmlAst.applyEdits(next[nav.path], Nav.addEntry(nav, nav.toc, 'append', { label: 'Notes', path: path })) });
        return { entries: next, path: path };
    }

    // Adds a note to the block at `start` in chapter `path`, its reference at the end of the block.
    // mode: 'footnotes' | 'endnotes'.
    function add(entries, path, start, text, mode) {
        const ast = XmlAst.parse(entries[path] || '');
        if (!ast.wellFormed) throw fail('not-well-formed', path + ' is not well-formed; fix it in the code editor first.');
        return insertAt(entries, path, blockAt(ast, start).closeStart, text, mode);
    }

    let sequence = 0;

    // Adds a note whose reference goes at text offset `offset` of chapter `path`, which must be inside an element in
    // <body> (between tags, not inside one). options.renumber === false leaves numbering for one renumber() later,
    // as Markdown import does after adding many notes (P5-03).
    function insertAt(entries, path, offset, text, mode, options) {
        const body = String(text || '').trim();
        if (!body) throw fail('no-text', 'Enter the note\'s text.');
        const ast = XmlAst.parse(entries[path] || '');
        if (!ast.wellFormed) throw fail('not-well-formed', path + ' is not well-formed; fix it in the code editor first.');
        const bodyEl = ast.elements.find((e) => e.local === 'body' && e.ns === XHTML);
        const inText = bodyEl && ast.elements.some((e) => e.type === 'element' && !e.selfClosing && e.openEnd <= offset && offset <= e.closeStart && e.start >= bodyEl.start && e.end <= bodyEl.end)
            && !ast.elements.some((e) => e.start < offset && offset < e.openEnd) && !ast.elements.some((e) => !e.selfClosing && e.closeStart < offset && offset < e.end);
        if (!inText) throw fail('bad-offset', 'A note reference must go in the text of a chapter.');
        const block = { closeStart: offset };
        // A temporary number, unique within this session; renumbering gives the real one.
        const tmp = 'n' + Date.now().toString(36) + (sequence++).toString(36);
        let next = entries;
        if (mode === 'endnotes') {
            const doc = ensureNotesDoc(entries, path);
            next = doc.entries;
            const ref = '<a epub:type="noteref" class="noteref" href="' + Book.hrefFor(path, doc.path) + '#endnote-' + tmp + '" id="endref-' + tmp + '">0</a>';
            next = Object.assign({}, next, { [path]: XmlAst.applyEdits(next[path], [{ start: block.closeStart, end: block.closeStart, text: ref }]) });
            const nast = XmlAst.parse(next[doc.path]);
            const section = nast.elements.find((e) => types(e).indexOf('endnotes') !== -1);
            const ol = XmlAst.elementChildren(section).find((e) => e.local === 'ol');
            const li = '<li epub:type="endnote" class="endnote" id="endnote-' + tmp + '"><p><a href="' + Book.hrefFor(doc.path, path) + '#endref-' + tmp + '">0.</a> ' + XmlAst.escapeText(body) + '</p></li>';
            const edits = ol ? XmlAst.insert(nast, ol, 'append', li) : XmlAst.insert(nast, section, 'append', '<ol>\n  ' + li + '\n</ol>');
            next = Object.assign({}, next, { [doc.path]: XmlAst.applyEdits(next[doc.path], edits) });
        } else {
            const ref = '<a epub:type="noteref" class="noteref" href="#note-' + tmp + '" id="ref-' + tmp + '">0</a>';
            const aside = '<aside epub:type="footnote" class="footnote" id="note-' + tmp + '"><p><a href="#ref-' + tmp + '">0.</a> ' + XmlAst.escapeText(body) + '</p></aside>';
            const edits = [{ start: block.closeStart, end: block.closeStart, text: ref }].concat(XmlAst.insert(ast, footnoteContainer(ast), 'append', aside));
            next = Object.assign({}, next, { [path]: XmlAst.applyEdits(next[path], edits) });
        }
        return { entries: options && options.renumber === false ? next : renumber(next, mode), path: path };
    }

    // The references of one document in order, each with its target note: [{ ref, notePath, noteId }].
    function refsIn(entries, path) {
        const ast = XmlAst.parse(entries[path] || '');
        if (!ast.wellFormed) return [];
        return ast.elements.filter(isNoteref).map((a) => {
            const r = Book.resolveHref(path, XmlAst.getAttr(a, 'href') || '');
            return r.path && r.fragment ? { refId: XmlAst.getAttr(a, 'id'), refPath: path, notePath: r.path, noteId: decodeURIComponent(r.fragment) } : null;
        }).filter(Boolean);
    }

    // Renumbers every note of the given mode: references, note ids, back links, and the order of the notes.
    function renumber(entries, mode) {
        const model = readBook(entries);
        const docs = spineDocs(entries, model);
        const groups = [];
        // Endnotes are the references into the notes document; a chapter's own footnotes keep their numbering.
        const endDoc = notesDoc(entries, model);
        if (mode === 'endnotes') groups.push(endDoc ? docs.reduce((all, p) => all.concat(refsIn(entries, p).filter((r) => r.notePath === endDoc && r.notePath !== p)), []) : []);
        else docs.forEach((p) => groups.push(refsIn(entries, p).filter((r) => r.notePath === p)));
        const refPrefix = mode === 'endnotes' ? 'endref-' : 'ref-', notePrefix = mode === 'endnotes' ? 'endnote-' : 'note-';
        let next = Object.assign({}, entries);
        groups.forEach((refs) => {
            // A note referred to twice keeps its first number.
            const seen = new Map();
            refs.forEach((r) => { const key = r.notePath + '#' + r.noteId; if (!seen.has(key)) seen.set(key, seen.size + 1); r.n = seen.get(key); });
            if (!refs.length) return;
            const notePaths = Array.from(new Set(refs.map((r) => r.notePath)));
            const refPaths = Array.from(new Set(refs.map((r) => r.refPath)));
            const noteNumber = (path, id) => seen.get(path + '#' + id);
            // References: id, href, and number.
            refPaths.forEach((p) => {
                const ast = XmlAst.parse(next[p]);
                let edits = [];
                const mine = refs.filter((r) => r.refPath === p);
                let k = 0;
                ast.elements.filter(isNoteref).forEach((a) => {
                    const r = Book.resolveHref(p, XmlAst.getAttr(a, 'href') || '');
                    const ref = mine[k];
                    if (!ref || !r.path || r.path !== ref.notePath || decodeURIComponent(r.fragment || '') !== ref.noteId) return;
                    k++;
                    edits = edits.concat(XmlAst.setAttr(ast, a, 'href', (r.path === p ? '' : Book.hrefFor(p, r.path)) + '#' + notePrefix + ref.n), XmlAst.setAttr(ast, a, 'id', refPrefix + ref.n));
                    if (/^\s*\d*\s*$/.test(XmlAst.textContent(a))) edits = edits.concat(XmlAst.setText(ast, a, String(ref.n)));
                });
                next[p] = XmlAst.applyEdits(next[p], edits);
            });
            // Notes: ids and back links, then put them in number order in the slots they already occupy.
            notePaths.forEach((p) => {
                const ast = XmlAst.parse(next[p]);
                const notes = ast.elements.filter((e) => isNote(e) && XmlAst.getAttr(e, 'id') != null && noteNumber(p, XmlAst.getAttr(e, 'id')) != null);
                const firstRef = (n) => refs.find((r) => r.n === n);
                const texts = notes.map((note) => {
                    const n = noteNumber(p, XmlAst.getAttr(note, 'id'));
                    const ref = firstRef(n);
                    // The note is parsed on its own, with the prefixes in scope where it sits (epub: on <html>).
                    const scope = {};
                    for (const k in note.nsScope) scope[k] = note.nsScope[k];
                    const local = XmlAst.parse(next[p].slice(note.start, note.end), { fragment: true, namespaces: scope });
                    const root = local.elements[0];
                    let edits = XmlAst.setAttr(local, root, 'id', notePrefix + n);
                    const back = local.elements.find((e) => e.local === 'a' && XmlAst.getAttr(e, 'href') && /#/.test(XmlAst.getAttr(e, 'href')));
                    if (back) {
                        edits = edits.concat(XmlAst.setAttr(local, back, 'href', (ref.refPath === p ? '' : Book.hrefFor(p, ref.refPath)) + '#' + refPrefix + n));
                        if (/^\s*\d*\.?\s*$/.test(XmlAst.textContent(back))) edits = edits.concat(XmlAst.setText(local, back, n + '.'));
                    }
                    return { n: n, text: XmlAst.applyEdits(local.text, edits) };
                });
                const ordered = texts.slice().sort((a, b) => a.n - b.n);
                next[p] = XmlAst.applyEdits(next[p], notes.map((note, i) => ({ start: note.start, end: note.end, text: ordered[i].text })));
            });
        });
        return next;
    }

    // Removes the note reference at `start` in `path` and its note, then renumbers.
    function remove(entries, path, start, mode) {
        const ast = XmlAst.parse(entries[path] || '');
        if (!ast.wellFormed) throw fail('not-well-formed', path + ' is not well-formed; fix it in the code editor first.');
        let a = ast.elements.find((e) => e.start === start);
        while (a && !isNoteref(a)) a = ast.byId[a.parentId];
        if (!a || a.type !== 'element') throw fail('no-noteref', 'Select a note reference (the small number) on the Stage to remove its note.');
        const r = Book.resolveHref(path, XmlAst.getAttr(a, 'href') || '');
        let next = Object.assign({}, entries, { [path]: XmlAst.applyEdits(entries[path], [{ start: a.start, end: a.end, text: '' }]) });
        if (r.path && r.fragment && typeof next[r.path] === 'string') {
            const id = decodeURIComponent(r.fragment);
            const stillUsed = Object.keys(next).filter((p) => /\.xhtml?$/i.test(p)).some((p) => refsIn(next, p).some((x) => x.notePath === r.path && x.noteId === id));
            if (!stillUsed) {
                const nast = XmlAst.parse(next[r.path]);
                const note = nast.elements.find((e) => XmlAst.getAttr(e, 'id') === id && isNote(e));
                if (note) next[r.path] = XmlAst.applyEdits(next[r.path], XmlAst.remove(nast, note));
            }
        }
        // The removed note may be of either kind, so both numberings are brought up to date.
        return { entries: renumber(renumber(next, 'footnotes'), 'endnotes'), path: path };
    }

    return { add: add, insertAt: insertAt, remove: remove, renumber: renumber, notesDoc: (entries) => notesDoc(entries, readBook(entries)) };
});

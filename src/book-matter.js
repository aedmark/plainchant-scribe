/*
 * BookMatter: front and back matter pages, built in or saved by the author for reuse across books (P3-07, D-046).
 * Pure, no DOM.
 *
 * A page is a body fragment. Elements marked data-pc-field="title|creators|publisher|isbn|year|rights" are filled
 * from the book's metadata when the page is added, and are the author's text from then on; rows() warns when a
 * marked element no longer matches the metadata. The epub:type terms are EPUB Structural Semantics Vocabulary 1.1
 * (titlepage, copyright-page, dedication, epigraph, acknowledgments), with the DPUB-ARIA 1.1 role where there is one
 * (EPUB Accessibility Techniques 1.1 §4.3.1); titlepage and copyright-page have none. Body epub:type is frontmatter
 * or backmatter.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./xml-ast.js'), require('./book.js'), require('./opf-edit.js'), require('./nav.js'), require('./book-meta.js'));
    else root.BookMatter = factory(root.XmlAst, root.Book, root.OpfEdit, root.Nav, root.BookMeta);
}(typeof self !== 'undefined' ? self : this, function (XmlAst, Book, OpfEdit, Nav, BookMeta) {
    'use strict';

    const XHTML = 'http://www.w3.org/1999/xhtml';
    const EPUB = 'http://www.idpf.org/2007/ops';
    const FIELDS = ['title', 'creators', 'publisher', 'isbn', 'year', 'rights'];
    const FIELD_LABELS = { title: 'title', creators: 'author', publisher: 'publisher', isbn: 'ISBN', year: 'year', rights: 'rights statement' };
    // Limits for a saved page, so the library stays small in the Studio's storage.
    const MAX_PAGE = 64 * 1024;
    const MAX_PAGES = 50;
    // Elements that load or run something; a saved page holds text markup only, so it carries nothing into another book.
    const REFUSED = ['img', 'picture', 'source', 'svg', 'math', 'audio', 'video', 'track', 'iframe', 'object', 'embed', 'script', 'style', 'link', 'form', 'input', 'button', 'select', 'textarea', 'canvas'];

    const esc = (s) => XmlAst.escapeText(s);
    const field = (tag, name, cls) => '<' + tag + (cls ? ' class="' + cls + '"' : '') + ' data-pc-field="' + name + '">{' + name + '}</' + tag + '>';

    // The built-in pages, in the order they appear in a book. `type` is the section's epub:type (also how an existing
    // page of the kind is found), `id` the section id (how a kind without a type is found).
    const KINDS = [
        { key: 'titlepage', place: 'front', label: 'Title page', type: 'titlepage', id: 'titlepage', heading: true,
            body: (v) => ['    <h1 id="titlepage-title" data-pc-field="title">{title}</h1>', v.creators ? '    ' + field('p', 'creators', 'author') : '', v.publisher ? '    ' + field('p', 'publisher', 'publisher') : ''] },
        { key: 'copyright', place: 'front', label: 'Copyright', type: 'copyright-page', id: 'copyright',
            body: (v) => [
                '    <p>' + field('span', 'title') + '</p>',
                '    <p>Copyright © ' + field('span', 'year') + (v.creators ? ' ' + field('span', 'creators') : '') + '</p>',
                v.rights ? '    ' + field('p', 'rights') : '',
                v.publisher ? '    <p>Published by ' + field('span', 'publisher') + '</p>' : '',
                v.isbn ? '    <p>ISBN ' + field('span', 'isbn') + '</p>' : ''] },
        { key: 'dedication', place: 'front', label: 'Dedication', type: 'dedication', role: 'doc-dedication', id: 'dedication', body: () => ['    <p></p>'] },
        { key: 'epigraph', place: 'front', label: 'Epigraph', type: 'epigraph', role: 'doc-epigraph', id: 'epigraph', body: () => ['    <blockquote>', '      <p></p>', '    </blockquote>', '    <p class="epigraph-source"></p>'] },
        { key: 'acknowledgements', place: 'back', label: 'Acknowledgements', type: 'acknowledgments', role: 'doc-acknowledgments', id: 'acknowledgements', heading: true, body: () => ['    <p></p>'] },
        { key: 'about-author', place: 'back', label: 'About the Author', id: 'about-the-author', heading: true, body: () => ['    <p></p>'] },
        { key: 'also-by', place: 'back', label: 'Also by', id: 'also-by', heading: true, headingText: 'Also by ' + field('span', 'creators'),
            body: () => ['    <ul>', '      <li></li>', '    </ul>'] }
    ];
    const byKey = {};
    KINDS.forEach((k, i) => { byKey[k.key] = Object.assign({ rank: i }, k); });

    function fail(code, message) { const e = new Error(message); e.code = code; return e; }
    const tokens = (v) => String(v || '').split(/\s+/).filter(Boolean);

    function joinNames(names) {
        if (names.length < 3) return names.join(' and ');
        return names.slice(0, -1).join(', ') + ', and ' + names[names.length - 1];
    }

    // The values the fields take in this book. year is dc:date's year, else `now`'s.
    function values(model, now) {
        const f = BookMeta.fields(model);
        const authors = f.creators.filter((c) => !c.role || c.role === 'aut');
        const year = /^\d{4}/.test(f.date) ? f.date.slice(0, 4) : '';
        return { title: f.title, creators: joinNames((authors.length ? authors : f.creators).map((c) => c.name).filter(Boolean)), publisher: f.publisher,
            isbn: f.isbn, year: year, rights: f.rights, nowYear: String((now || new Date()).getFullYear()) };
    }

    // The first <section> in a document's body, and the body's epub:type tokens.
    function shape(text) {
        const ast = XmlAst.parse(text || '');
        const body = ast.elements.find((e) => e.local === 'body' && e.ns === XHTML);
        if (!body) return { ast: ast, body: null, section: null, types: [] };
        const section = XmlAst.elementChildren(body).find((e) => e.ns === XHTML) || null;
        const types = tokens(XmlAst.getAttr(body, 'type', EPUB)).concat(section ? tokens(XmlAst.getAttr(section, 'type', EPUB)) : []);
        return { ast: ast, body: body, section: section, types: types };
    }

    // The built-in kind a document is, or null: by its section's epub:type, else by its section id.
    function kindOf(text) {
        const s = shape(text);
        if (!s.section) return null;
        const id = XmlAst.getAttr(s.section, 'id');
        const k = KINDS.find((x) => (x.type && s.types.indexOf(x.type) !== -1) || (!x.type && id === x.id));
        return k ? k.key : null;
    }

    const spineDocs = (entries, model) => model.spine.itemrefs.filter((r) => r.item && r.item.path && r.item.mediaType === 'application/xhtml+xml' && typeof entries[r.item.path] === 'string');

    // The built-in kinds already in the book: { key: path }.
    function present(entries, model) {
        const out = {};
        spineDocs(entries, model).forEach((r) => { const k = kindOf(entries[r.item.path]); if (k && !out[k]) out[k] = r.item.path; });
        return out;
    }

    // Fills each data-pc-field element with its value. Values that are empty in this book are reported in `missing`.
    function fill(text, v) {
        const missing = [];
        let ast = XmlAst.parse(text);
        const marked = ast.elements.filter((e) => e.ns === XHTML && FIELDS.indexOf(XmlAst.getAttr(e, 'data-pc-field')) !== -1);
        const edits = [];
        marked.forEach((el) => {
            const name = XmlAst.getAttr(el, 'data-pc-field');
            const value = name === 'year' ? (v.year || v.nowYear) : v[name];
            if (!value && missing.indexOf(name) === -1) missing.push(name);
            edits.push.apply(edits, XmlAst.setText(ast, el, value || ''));
        });
        return { text: XmlAst.applyEdits(text, edits), missing: missing };
    }

    function pageMarkup(title, place, inner, lang, sheets) {
        const l = XmlAst.escapeAttr(lang || 'en');
        return ['<?xml version="1.0" encoding="UTF-8"?>', '<!DOCTYPE html>',
            '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="' + l + '" lang="' + l + '">',
            '<head>', '  <title>' + esc(title) + '</title>']
            .concat(sheets.map((h) => '  <link rel="stylesheet" type="text/css" href="' + XmlAst.escapeAttr(h) + '"/>'),
                ['</head>', '<body epub:type="' + (place === 'back' ? 'backmatter' : 'frontmatter') + '">', inner.replace(/^\n+|\s+$/g, ''), '</body>', '</html>', ''])
            .join('\n');
    }

    function builtInInner(kind, v) {
        const attrs = (kind.type ? ' epub:type="' + kind.type + '"' : '') + (kind.role ? ' role="' + kind.role + '"' : '') + ' id="' + kind.id + '"' +
            (kind.heading ? ' aria-labelledby="' + kind.id + '-title"' : ' aria-label="' + esc(kind.label) + '"');
        const lines = kind.body(v).filter(Boolean);
        if (kind.heading && kind.key !== 'titlepage') lines.unshift('    <h1 id="' + kind.id + '-title">' + (kind.headingText || esc(kind.label)) + '</h1>');
        return '  <section' + attrs + '>\n' + lines.join('\n') + '\n  </section>';
    }

    // Where a page goes in the spine. Front matter: after the cover and the front pages ranked at or before it, before
    // anything else. Back matter: at the end, before back pages ranked after it.
    function spineIndex(entries, model, place, rank) {
        const refs = model.spine.itemrefs;
        const rankOf = (r) => {
            const text = r.item && r.item.path && typeof entries[r.item.path] === 'string' ? entries[r.item.path] : '';
            const k = kindOf(text);
            if (k) return byKey[k].place === place ? byKey[k].rank : null;
            const types = shape(text).types;
            if (place === 'front') return types.indexOf('cover') !== -1 ? -1 : types.indexOf('frontmatter') !== -1 ? 100 : null;
            return null;
        };
        if (place === 'front') {
            let i = 0;
            while (i < refs.length) { const rk = rankOf(refs[i]); if (rk == null || rk > rank) break; i++; }
            return i;
        }
        let i = refs.length;
        while (i > 0) { const rk = rankOf(refs[i - 1]); if (rk == null || rk <= rank) break; i--; }
        return i;
    }

    // Adds a page. source is { kind: key } for a built-in, or a saved page { name, place, kind, body }. Returns
    // { entries, path, missing } (fields left empty because the book has no value for them).
    function add(entries, source, now) {
        const r = Book.read(entries);
        if (!r.model) throw fail('unreadable', 'content.opf cannot be read; fix it in the code editor first.');
        const model = r.model;
        const kind = source.kind ? byKey[source.kind] : null;
        if (source.kind && !kind) throw fail('unknown-kind', 'Scribe has no page of that kind.');
        if (kind && present(entries, model)[kind.key]) throw fail('exists', 'The book already has a ' + kind.label.toLowerCase() + ' page, ' + present(entries, model)[kind.key] + '.');
        const v = values(model, now);
        const place = kind ? kind.place : (source.place === 'back' ? 'back' : 'front');
        const label = source.body != null ? String(source.name || 'Page') : kind.key === 'titlepage' && v.title ? v.title : kind.key === 'also-by' && v.creators ? 'Also by ' + v.creators : kind.label;
        const inner = source.body != null ? String(source.body) : builtInInner(kind, v);
        // A reference chapter for the folder and stylesheets: the first spine document that is not the nav or cover.
        const navPath = model.nav ? model.nav.path : null;
        const ref = spineDocs(entries, model).map((x) => x.item.path).find((p) => p !== navPath && shape(entries[p]).types.indexOf('cover') === -1);
        const dir = ref ? ref.slice(0, ref.lastIndexOf('/') + 1) : model.opfPath.slice(0, model.opfPath.lastIndexOf('/') + 1) + 'text/';
        const refAst = ref ? XmlAst.parse(entries[ref]) : null;
        const sheets = refAst && refAst.wellFormed ? refAst.elements.filter((el) => el.local === 'link' && /\bstylesheet\b/i.test(XmlAst.getAttr(el, 'rel') || '')).map((el) => XmlAst.getAttr(el, 'href')).filter(Boolean) : [];
        const stem = kind ? kind.id : (String(source.name || 'page').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'page');
        let file = stem, n = 2;
        const taken = (p) => Object.prototype.hasOwnProperty.call(entries, p) || model.manifest.items.some((i) => i.path === p);
        while (taken(dir + file + '.xhtml')) file = stem + '-' + n++;
        const path = dir + file + '.xhtml';
        const ids = new Set(model.ast.elements.map((el) => XmlAst.getAttr(el, 'id')).filter((x) => x != null));
        const idStem = /^[a-z]/.test(file) ? file : 'p-' + file;
        let id = idStem;
        for (let k = 2; ids.has(id); k++) id = idStem + '-' + k;
        const filled = fill(pageMarkup(label, place, inner, model.metadata.language, sheets), v);
        if (!XmlAst.parse(filled.text).wellFormed) throw fail('not-well-formed', 'The saved page is not well-formed XHTML; save it again from a chapter that is.');
        const index = spineIndex(entries, model, place, kind ? kind.rank : (place === 'front' ? 99 : KINDS.length));
        let next = Object.assign({}, entries, { [path]: filled.text });
        const opf = (op) => { const m = Book.read(next).model; next = Object.assign({}, next, { [m.opfPath]: XmlAst.applyEdits(next[m.opfPath], op(m)) }); };
        opf((m) => OpfEdit.addItem(m, { id: id, path: path, mediaType: 'application/xhtml+xml' }));
        opf((m) => OpfEdit.addItemref(m, id, { index: index }));
        // Back matter joins the contents, after the entry of the page before it; front matter is reached in reading order.
        if (place === 'back') {
            const m = Book.read(next).model;
            const nav = Nav.read(next, m).nav;
            if (nav && nav.toc && nav.toc.list) {
                const before = m.spine.itemrefs.slice(0, index).map((x) => x.item && x.item.path).reverse();
                const anchor = before.map((p) => nav.toc.entries.filter((e) => e.target && e.target.path === p && !e.target.fragment).slice(-1)[0]).find(Boolean);
                const edits = anchor ? Nav.addEntry(nav, anchor, 'after', { label: label, path: path }) : Nav.addEntry(nav, nav.toc, 'append', { label: label, path: path });
                next = Object.assign({}, next, { [nav.path]: XmlAst.applyEdits(next[nav.path], edits) });
            }
        }
        return { entries: next, path: path, missing: filled.missing };
    }

    // A chapter as a page to save in the library: { name, place, kind, body }, or throws with the reason it cannot be.
    function save(text, name) {
        const label = String(name || '').trim();
        if (!label) throw fail('invalid-name', 'Give the page a name.');
        const s = shape(text);
        if (!s.ast.wellFormed || !s.body) throw fail('not-well-formed', 'The page is not well-formed XHTML; fix it in the code editor first.');
        const inside = s.ast.elements.filter((e) => e !== s.body && e.start > s.body.start && e.end <= s.body.end);
        const bad = inside.find((e) => REFUSED.indexOf(e.local) !== -1);
        if (bad) throw fail('has-resources', 'The page has <' + bad.local + '>. A saved page can hold text only, because it travels to books that do not have the same files.');
        const link = inside.find((e) => { const h = XmlAst.getAttr(e, 'href'); return h != null && !/^(#|https?:|mailto:)/i.test(h); });
        if (link) throw fail('has-links', 'The page links to ' + XmlAst.getAttr(link, 'href') + ', a file in this book. Saved pages can link to the web or within the page only.');
        const handler = inside.find((e) => (e.attrs || []).some((a) => /^on/i.test(a.local || a.name || '')));
        if (handler) throw fail('has-script', 'The page has an event handler attribute; remove it first.');
        const body = s.ast.text.slice(s.body.openEnd, s.body.closeStart);
        if (body.length > MAX_PAGE) throw fail('too-large', 'The page is larger than 64 KB; a saved page should be a short one.');
        const kind = kindOf(text);
        const place = kind ? byKey[kind].place : (s.types.indexOf('backmatter') !== -1 ? 'back' : 'front');
        return { name: label.slice(0, 80), place: place, kind: kind, body: body };
    }

    // The library as kept in storage: a list of saved pages, checked again on load since storage can be edited.
    function readLibrary(json) {
        let list;
        try { list = JSON.parse(json || '[]'); } catch (e) { return []; }
        if (!Array.isArray(list)) return [];
        return list.filter((p) => p && typeof p.name === 'string' && typeof p.body === 'string' && p.body.length <= MAX_PAGE && (p.place === 'front' || p.place === 'back'))
            .slice(0, MAX_PAGES).map((p) => ({ name: p.name.slice(0, 80), place: p.place, kind: byKey[p.kind] ? p.kind : null, body: p.body, saved: typeof p.saved === 'string' ? p.saved : '' }));
    }

    // Adds or replaces (by name) a page in the library list; throws when the library is full.
    function putLibrary(list, page, savedAt) {
        const rest = list.filter((p) => p.name !== page.name);
        if (rest.length >= MAX_PAGES) throw fail('library-full', 'Your library holds ' + MAX_PAGES + ' pages; remove one first.');
        return rest.concat(Object.assign({}, page, { saved: savedAt || '' }));
    }

    // Problems rows: marked fields that no longer match the book's metadata.
    function rows(entries, model) {
        const out = [];
        const v = values(model);
        spineDocs(entries, model).forEach((r) => {
            const path = r.item.path;
            const text = entries[path];
            if (text.indexOf('data-pc-field') === -1) return;
            const ast = XmlAst.parse(text);
            ast.elements.forEach((el) => {
                const name = XmlAst.getAttr(el, 'data-pc-field');
                if (FIELDS.indexOf(name) === -1 || !v[name]) return;
                const shown = XmlAst.textContent(el).replace(/\s+/g, ' ').trim();
                if (shown === v[name]) return;
                out.push({ file: path, start: el.start, end: el.openEnd, line: text.slice(0, el.start).split('\n').length, code: 'matter-stale', severity: 'warning', category: 'package',
                    message: 'This page gives the ' + FIELD_LABELS[name] + ' as "' + shown + '", but the Book tab has "' + v[name] + '". Update the text, or remove data-pc-field="' + name + '" to stop this check.' });
            });
        });
        return out;
    }

    return { KINDS: KINDS, FIELDS: FIELDS, MAX_PAGES: MAX_PAGES, MAX_PAGE: MAX_PAGE, values: values, kindOf: kindOf, present: present, fill: fill, add: add, save: save, readLibrary: readLibrary, putLibrary: putLibrary, rows: rows };
}));

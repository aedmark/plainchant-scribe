/*
 * DocxImport: a read .docx (Docx.read) turned into chapters of a book, or into a new book (P7-03, D-048). Import only
 * (D-002): the XHTML is written once and is the source from then on.
 *
 * Each Heading 1 starts a chapter, titled with its text; anything before the first one is a chapter titled from
 * the file name. Title and Subtitle paragraphs name a new book and are not copied into the text. Images go into the
 * book's images folder and the manifest, footnotes and endnotes become Scribe notes of the same kind (BookNotes,
 * D-034), and figures and tables use BookBlocks' markup (D-035).
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./xml-ast.js'), require('./book.js'), require('./book-template.js'), require('./book-chapters.js'), require('./book-notes.js'), require('./book-blocks.js'), require('./nav.js'), require('./book-lang.js'), require('./docx.js'));
    else root.DocxImport = factory(root.XmlAst, root.Book, root.BookTemplate, root.BookChapters, root.BookNotes, root.BookBlocks, root.Nav, root.BookLang, root.Docx);
}(typeof self !== 'undefined' ? self : this, function (XmlAst, Book, BookTemplate, BookChapters, BookNotes, BookBlocks, Nav, BookLang, Docx) {
    'use strict';

    const titleFromName = (name) => {
        const stem = String(name || 'Imported document').split('/').pop().replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim() || 'Imported document';
        return stem.charAt(0).toUpperCase() + stem.slice(1);
    };

    // The blocks as chapters: [{ title, blocks }], with the Title paragraph's text.
    function chapters(doc, name) {
        const out = [];
        let current = null, title = '';
        doc.blocks.forEach((b) => {
            if (b.type === 'title') { if (!title) title = b.text; return; }
            if (b.type === 'subtitle') return;
            if (b.type === 'heading' && b.level === 1) { current = { title: b.text || titleFromName(name), blocks: [] }; out.push(current); return; }
            if (!current) { current = { title: titleFromName(name), blocks: [] }; out.push(current); }
            current.blocks.push(b);
        });
        return { chapters: out, title: title };
    }

    // Consecutive list items as nested lists: a deeper item opens a list inside the open item.
    function lists(items, pad) {
        const out = [], stack = [];
        const top = () => stack[stack.length - 1];
        const listPad = () => pad + '    '.repeat(stack.length - 1);
        const closeList = () => {
            if (top().liOpen) out.push(listPad() + '  </li>');
            out.push(listPad() + '</' + (top().ordered ? 'ol' : 'ul') + '>');
            stack.pop();
        };
        items.forEach((it) => {
            while (stack.length && top().level > it.level) closeList();
            if (stack.length && top().level === it.level && top().ordered !== it.ordered) closeList();
            if (!stack.length || top().level < it.level) {
                stack.push({ level: it.level, ordered: it.ordered, liOpen: false });
                out.push(listPad() + '<' + (it.ordered ? 'ol' : 'ul') + '>');
            } else if (top().liOpen) out.push(listPad() + '  </li>');
            out.push(listPad() + '  <li>' + it.html);
            top().liOpen = true;
        });
        while (stack.length) closeList();
        return out;
    }

    function render(blocks, pad) {
        const out = [];
        for (let i = 0; i < blocks.length; i++) {
            const b = blocks[i];
            if (b.type === 'heading') out.push(pad + '<h' + b.level + '>' + b.html + '</h' + b.level + '>');
            else if (b.type === 'para') out.push(pad + '<p>' + b.html + '</p>');
            else if (b.type === 'break') out.push(pad + '<hr/>');
            else if (b.type === 'figure') out.push(...BookBlocks.figure(Docx.IMG_OPEN + b.image + Docx.IMG_CLOSE, b.alt, b.caption).split('\n').map((l) => pad + l));
            else if (b.type === 'quote') {
                out.push(pad + '<blockquote>');
                for (; i < blocks.length && blocks[i].type === 'quote'; i++) out.push(pad + '  <p>' + blocks[i].html + '</p>');
                i--;
                out.push(pad + '</blockquote>');
            } else if (b.type === 'item') {
                const run = [];
                for (; i < blocks.length && blocks[i].type === 'item'; i++) run.push(blocks[i]);
                i--;
                const base = Math.min.apply(null, run.map((x) => x.level));
                out.push(...lists(run.map((x) => Object.assign({}, x, { level: x.level - base })), pad));
            } else if (b.type === 'table' && b.rows.length) {
                out.push(pad + '<table class="table">');
                b.rows.forEach((row) => {
                    out.push(pad + '  <tr>');
                    row.forEach((c) => { const tag = c.header ? 'th' : 'td'; out.push(pad + '    <' + tag + (c.colspan > 1 ? ' colspan="' + c.colspan + '"' : '') + '>' + c.html + '</' + tag + '>'); });
                    out.push(pad + '  </tr>');
                });
                out.push(pad + '</table>');
            }
        }
        return out;
    }

    // Imports a read .docx as chapters after chapter `after`. options: { name, assets }. Returns { entries, added,
    // binaries: { path: Uint8Array }, skipped }, where binaries are the new image files for the book.
    function importInto(entries, doc, after, options) {
        const o = options || {};
        const assets = o.assets || [];
        const model = Book.read(entries, { assets: assets }).model;
        if (!model) throw Object.assign(new Error('content.opf cannot be read; fix it in the code editor first.'), { code: 'unreadable' });
        const dir = model.opfPath.slice(0, model.opfPath.lastIndexOf('/') + 1) + 'images/';
        const taken = new Set(Object.keys(entries).concat(assets).map((p) => p.toLowerCase()));
        const placed = {};
        const placeImage = (key) => {
            if (placed[key]) return placed[key];
            const img = doc.images[key];
            const stem = img.name.replace(/\.[^.]*$/, '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'image';
            let path = dir + stem + '.' + img.ext;
            for (let n = 2; taken.has(path.toLowerCase()); n++) path = dir + stem + '-' + n + '.' + img.ext;
            taken.add(path.toLowerCase());
            placed[key] = path;
            return path;
        };
        const parsed = chapters(doc, o.name);
        let next = entries, prev = after;
        const added = [], pending = [];
        parsed.chapters.forEach((ch) => {
            const made = BookChapters.add(next, ch.title, prev);
            next = made.entries;
            prev = made.path;
            added.push(made.path);
            // XmlAst.insert indents every line to the heading's level.
            let markup = render(ch.blocks, '').join('\n');
            markup = markup.split(Docx.IMG_OPEN).map((part, k) => {
                if (!k) return part;
                const end = part.indexOf(Docx.IMG_CLOSE);
                return XmlAst.escapeAttr(Book.hrefFor(made.path, placeImage(part.slice(0, end)))) + part.slice(end + 1);
            }).join('');
            if (markup) {
                const ast = XmlAst.parse(next[made.path]);
                const h1 = ast.elements.find((e) => e.local === 'h1');
                const empty = ast.elements.find((e) => e.local === 'p' && e.start > h1.end);
                next = Object.assign({}, next, { [made.path]: XmlAst.applyEdits(next[made.path], XmlAst.insert(ast, h1, 'after', markup).concat(XmlAst.remove(ast, empty))) });
            }
            if (markup.indexOf(Docx.NOTE_OPEN) !== -1) pending.push(made.path);
        });
        const binaries = {};
        Object.keys(placed).forEach((key) => { binaries[placed[key]] = doc.images[key].bytes; });
        const allAssets = assets.concat(Object.keys(binaries));
        Object.keys(binaries).forEach((p) => { next = BookBlocks.listImage(next, p, allAssets); });
        // Note references: each marker is removed and a Scribe note of the same kind attached at its place.
        const modes = new Set();
        pending.forEach((path) => {
            for (;;) {
                const t = next[path];
                const at = t.indexOf(Docx.NOTE_OPEN);
                if (at === -1) break;
                const end = t.indexOf(Docx.NOTE_CLOSE, at);
                const ref = t.slice(at + 1, end).split(':');
                next = Object.assign({}, next, { [path]: t.slice(0, at) + t.slice(end + 1) });
                const mode = ref[0] === 'endnote' ? 'endnotes' : 'footnotes';
                const text = doc.notes[ref[0]][ref[1]];
                if (!text) continue;
                modes.add(mode);
                next = BookNotes.insertAt(next, path, at, text, mode, { renumber: false }).entries;
            }
        });
        modes.forEach((mode) => { next = BookNotes.renumber(next, mode); });
        return { entries: next, added: added, binaries: binaries, skipped: doc.skipped };
    }

    // A new book from a read .docx: its title (document properties, else the Title paragraph, else the file name),
    // author, and language, with the chapters in place of the template's empty one.
    function newBook(doc, options) {
        const o = options || {};
        const title = doc.title || chapters(doc, o.name).title || titleFromName(o.name);
        const language = BookLang.wellFormed(doc.language || '') ? doc.language : 'en';
        const t = BookTemplate.create({ title: title, creator: doc.creator || '', language: language, uuid: o.uuid, now: o.now });
        const first = 'OEBPS/text/chapter-1.xhtml';
        const r = importInto(t.files, doc, first, { name: o.name });
        if (!r.added.length) return { entries: t.files, binaries: {}, title: title, added: [first], skipped: r.skipped };
        let next = BookChapters.remove(r.entries, first).entries;
        const model = Book.read(next, { assets: Object.keys(r.binaries) }).model;
        const nav = Nav.read(next, model).nav;
        next = Object.assign({}, next, { [nav.path]: XmlAst.applyEdits(next[nav.path], Nav.setLandmark(nav, 'bodymatter', { path: r.added[0] }, 'Start of content')) });
        return { entries: next, binaries: r.binaries, title: title, added: r.added, skipped: r.skipped };
    }

    return { importInto: importInto, newBook: newBook, chapters: chapters, render: render };
}));

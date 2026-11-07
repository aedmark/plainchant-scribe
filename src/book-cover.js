/*
 * BookCover: the book's cover image, its cover page, and a typographic cover's layout (P3-05, D-029).
 *
 * set(entries, imagePath) marks an image as the cover (EPUB 3.3 D.6.1, properties="cover-image") and keeps a cover
 * page, cover.xhtml, first in the spine with a "cover" landmark. remove(entries) undoes both and keeps the image file.
 * layout(...) places a generated cover's title and author for a canvas, given a text-measuring function, so it can be
 * tested without one. Edits go through OpfEdit and Nav, so the rest of each file is kept (D-002).
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./xml-ast.js'), require('./book.js'), require('./opf-edit.js'), require('./nav.js'), require('./book-chapters.js'));
    else root.BookCover = factory(root.XmlAst, root.Book, root.OpfEdit, root.Nav, root.BookChapters);
})(typeof self !== 'undefined' ? self : this, function (XmlAst, Book, OpfEdit, Nav, BookChapters) {
    'use strict';

    const XHTML = 'http://www.w3.org/1999/xhtml';
    const EPUB = 'http://www.idpf.org/2007/ops';
    const IMAGE_TYPES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' };
    const SIZE = { width: 1600, height: 2560 };
    const PALETTES = {
        paper: { label: 'Paper and ink', background: '#f4efe4', ink: '#2b2118', accent: '#8a3b12' },
        dark: { label: 'Dark', background: '#1c1a17', ink: '#efe6d2', accent: '#c9a45c' },
        blue: { label: 'Deep blue', background: '#1f3a5f', ink: '#f5f1e8', accent: '#d9b26f' }
    };

    function fail(code, message) {
        const e = new Error(message);
        e.code = code;
        return e;
    }

    const mediaTypeFor = (path) => IMAGE_TYPES[String(path).split('.').pop().toLowerCase()] || null;

    function readBook(entries, assets) {
        const r = Book.read(entries, { assets: assets });
        if (!r.model) throw fail('unreadable', 'content.opf cannot be read; fix it in the code editor first.');
        return r.model;
    }

    function withOpf(entries, op, assets) {
        const model = readBook(entries, assets);
        return Object.assign({}, entries, { [model.opfPath]: XmlAst.applyEdits(entries[model.opfPath], op(model)) });
    }

    function withNav(entries, op) {
        const model = readBook(entries);
        const nav = Nav.read(entries, model).nav;
        if (!nav) return entries;
        const edits = op(nav);
        return edits && edits.length ? Object.assign({}, entries, { [nav.path]: XmlAst.applyEdits(entries[nav.path], edits) }) : entries;
    }

    // The cover page: a spine XHTML document whose body or first element is typed "cover".
    function coverPage(entries, model) {
        const ref = model.spine.itemrefs.find((r) => {
            if (!r.item || r.item.mediaType !== 'application/xhtml+xml' || typeof entries[r.item.path] !== 'string') return false;
            const ast = XmlAst.parse(entries[r.item.path]);
            const body = ast.elements.find((e) => e.local === 'body' && e.ns === XHTML);
            if (!body) return false;
            const first = XmlAst.elementChildren(body)[0];
            const typed = (el) => el && /(^|\s)cover(\s|$)/.test(XmlAst.getAttr(el, 'type', EPUB) || '');
            return typed(body) || typed(first);
        });
        return ref ? ref.item.path : null;
    }

    function current(entries, assets) {
        const model = readBook(entries, assets);
        return { path: model.cover ? model.cover.path : null, mediaType: model.cover ? model.cover.mediaType : null, page: coverPage(entries, model) };
    }

    function pageMarkup(imageHref, alt, lang) {
        const l = XmlAst.escapeAttr(lang || 'en');
        return [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<!DOCTYPE html>',
            '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="' + l + '" lang="' + l + '">',
            '<head>',
            '  <title>Cover</title>',
            '  <style>body { margin: 0; padding: 0; text-align: center; } img { max-width: 100%; max-height: 100vh; }</style>',
            '</head>',
            '<body epub:type="cover">',
            '  <section epub:type="cover" id="cover">',
            '    <img src="' + XmlAst.escapeAttr(imageHref) + '" alt="' + XmlAst.escapeAttr(alt) + '"/>',
            '  </section>',
            '</body>',
            '</html>',
            ''
        ].join('\n');
    }

    function freeId(model, base) {
        const ids = new Set(model.ast.elements.map((el) => XmlAst.getAttr(el, 'id')).filter((v) => v != null));
        let id = base;
        for (let n = 2; ids.has(id); n++) id = base + '-' + n;
        return id;
    }

    // Marks imagePath as the cover image and makes or updates the cover page. assets: binary paths in the book.
    function set(entries, imagePath, assets) {
        const type = mediaTypeFor(imagePath);
        if (!type) throw fail('not-an-image', imagePath + ' is not an image a cover can use (JPEG, PNG, GIF, WebP, or SVG).');
        const exists = Object.prototype.hasOwnProperty.call(entries, imagePath) || (assets || []).indexOf(imagePath) !== -1;
        if (!exists) throw fail('missing', imagePath + ' is not in the book.');
        let model = readBook(entries, assets);
        let next = entries;
        let item = model.manifest.items.find((i) => i.path === imagePath);
        if (!item) {
            const id = freeId(model, 'cover-image');
            next = withOpf(next, (m) => OpfEdit.addItem(m, { id: id, path: imagePath, mediaType: type }), assets);
        }
        // EPUB 3.3 D.6.1: cover-image on exactly one item.
        model = readBook(next, assets);
        model.manifest.items.filter((i) => i.path !== imagePath && i.properties.indexOf('cover-image') !== -1).forEach((i) => {
            next = withOpf(next, (m) => OpfEdit.setItemProperties(m, i.id, m.manifest.byId[i.id].properties.filter((p) => p !== 'cover-image')), assets);
        });
        item = readBook(next, assets).manifest.items.find((i) => i.path === imagePath);
        if (item.properties.indexOf('cover-image') === -1) next = withOpf(next, (m) => OpfEdit.setItemProperties(m, item.id, item.properties.concat('cover-image')), assets);
        // The EPUB 2 <meta name="cover">, which Kobo's EPUB guide and some older readers use, names the cover too
        // (EPUB 3.3 §5.9.3 keeps OPF 2 meta for compatibility; P6-03 found Kobo shows it). Added when missing.
        model = readBook(next, assets);
        if (model.legacy.cover && model.legacy.cover.content !== item.id) next = withOpf(next, (m) => XmlAst.setAttr(m.ast, m.legacy.cover.node, 'content', item.id), assets);
        if (!model.legacy.cover) {
            next = withOpf(next, (m) => {
                const metadata = m.ast.elements.find((e) => e.local === 'metadata' && e.parentId === m.ast.documentElement.id);
                return XmlAst.insert(m.ast, metadata, 'append', '<meta name="cover" content="' + XmlAst.escapeAttr(item.id) + '"/>');
            }, assets);
        }
        model = readBook(next, assets);
        const title = model.metadata.title || 'this book';
        const page = coverPage(next, model);
        if (page) {
            const ast = XmlAst.parse(next[page]);
            const img = ast.elements.find((e) => e.local === 'img' && e.ns === XHTML);
            if (img) next = Object.assign({}, next, { [page]: XmlAst.applyEdits(next[page], XmlAst.setAttr(ast, img, 'src', Book.hrefFor(page, imagePath))) });
            return { entries: next, page: page };
        }
        const chapters = model.spine.itemrefs.filter((r) => r.item && r.item.mediaType === 'application/xhtml+xml');
        const dir = chapters.length ? chapters[0].item.path.slice(0, chapters[0].item.path.lastIndexOf('/') + 1) : model.opfPath.slice(0, model.opfPath.lastIndexOf('/') + 1);
        let pagePath = dir + 'cover.xhtml';
        for (let n = 2; Object.prototype.hasOwnProperty.call(next, pagePath) || model.manifest.items.some((i) => i.path === pagePath); n++) pagePath = dir + 'cover-' + n + '.xhtml';
        next = Object.assign({}, next, { [pagePath]: pageMarkup(Book.hrefFor(pagePath, imagePath), 'Cover of ' + title, model.metadata.language) });
        const pageId = freeId(model, 'cover');
        next = withOpf(next, (m) => OpfEdit.addItem(m, { id: pageId, path: pagePath, mediaType: 'application/xhtml+xml' }), assets);
        next = withOpf(next, (m) => OpfEdit.addItemref(m, pageId, { index: 0 }), assets);
        next = withNav(next, (nav) => Nav.setLandmark(nav, 'cover', { path: pagePath }, 'Cover'));
        return { entries: next, page: pagePath };
    }

    // Unmarks the cover image and deletes the cover page (with its spine entry and landmark). The image stays.
    function remove(entries, assets) {
        let model = readBook(entries, assets);
        let next = entries;
        model.manifest.items.filter((i) => i.properties.indexOf('cover-image') !== -1).forEach((i) => {
            next = withOpf(next, (m) => OpfEdit.setItemProperties(m, i.id, m.manifest.byId[i.id].properties.filter((p) => p !== 'cover-image')), assets);
        });
        model = readBook(next, assets);
        if (model.legacy.cover) next = withOpf(next, (m) => XmlAst.remove(m.ast, m.legacy.cover.node), assets);
        const page = coverPage(next, readBook(next, assets));
        const removed = [];
        if (page) {
            next = BookChapters.remove(next, page).entries;
            removed.push(page);
        }
        return { entries: next, removed: removed };
    }

    // Splits text into lines no wider than maxWidth by measure(text). A word wider than the line stands alone.
    function wrap(text, maxWidth, measure) {
        const words = String(text || '').trim().split(/\s+/).filter(Boolean);
        const lines = [];
        let line = '';
        words.forEach((w) => {
            const tryLine = line ? line + ' ' + w : w;
            if (!line || measure(tryLine) <= maxWidth) line = tryLine;
            else { lines.push(line); line = w; }
        });
        if (line) lines.push(line);
        return lines;
    }

    // Drawing steps for a typographic cover: the title as large as fits in at most four lines, a rule, and the
    // author near the foot. measure(text, size, weight) returns a width in px.
    function layout(title, author, paletteName, measure) {
        const pal = PALETTES[paletteName] || PALETTES.paper;
        const margin = 160, width = SIZE.width - 2 * margin;
        let size = 190, lines;
        for (; size >= 96; size -= 8) {
            lines = wrap(title || 'Untitled', width, (t) => measure(t, size, 600));
            if (lines.length <= 4 && lines.every((l) => measure(l, size, 600) <= width)) break;
        }
        size = Math.max(size, 96);
        const lead = Math.round(size * 1.18);
        const top = Math.round(SIZE.height * 0.36 - (lines.length - 1) * lead / 2);
        const steps = [{ op: 'fill', color: pal.background }];
        lines.forEach((l, i) => steps.push({ op: 'text', text: l, x: SIZE.width / 2, y: top + i * lead, size: size, weight: 600, color: pal.ink }));
        const ruleY = top + (lines.length - 1) * lead + Math.round(size * 0.7);
        steps.push({ op: 'rule', x1: SIZE.width / 2 - 180, x2: SIZE.width / 2 + 180, y: ruleY, width: 6, color: pal.accent });
        if (author) {
            let asize = 96;
            while (asize > 56 && measure(author, asize, 400) > width) asize -= 4;
            steps.push({ op: 'text', text: author, x: SIZE.width / 2, y: SIZE.height - 360, size: asize, weight: 400, color: pal.ink });
        }
        return { width: SIZE.width, height: SIZE.height, steps: steps };
    }

    return { SIZE: SIZE, PALETTES: PALETTES, mediaTypeFor: mediaTypeFor, current: current, set: set, remove: remove, wrap: wrap, layout: layout };
});

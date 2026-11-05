/*
 * BookBlocks: figures, tables, poems, and block quotes inserted into a chapter (P4-05, D-035).
 *
 * Each kind is written as plain XHTML with a class the layout block's reflow-safe rules style (BookStyle `blocks`):
 * <figure class="figure"> with <img/> and an optional <figcaption>; <table class="table"> with a caption, a header
 * row of <th scope="col">, and empty body cells; <div class="poem"> of <div class="stanza"> of <p class="line">; and
 * <blockquote>, inside <figure class="quote"> with a <figcaption> when there is an attribution (HTML Living Standard
 * 4.4.4: attribution goes outside the blockquote). insert() splices the markup after the block selected on the Stage,
 * or at the end of a selected section or body (D-002); a figure's image gets a manifest item if it has none.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./xml-ast.js'), require('./book.js'), require('./opf-edit.js'));
    else root.BookBlocks = factory(root.XmlAst, root.Book, root.OpfEdit);
})(typeof self !== 'undefined' ? self : this, function (XmlAst, Book, OpfEdit) {
    'use strict';

    // EPUB 3.3 core media types for images.
    const IMAGE_TYPES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' };
    const INLINE = { a: 1, abbr: 1, b: 1, cite: 1, code: 1, em: 1, i: 1, kbd: 1, mark: 1, q: 1, s: 1, small: 1, span: 1, strong: 1, sub: 1, sup: 1, u: 1, img: 1, br: 1 };
    const CONTAINERS = { body: 1, section: 1, article: 1, main: 1 };
    const LIMITS = { rows: 50, cols: 10 };

    function fail(code, message) {
        const e = new Error(message);
        e.code = code;
        return e;
    }

    const esc = (s) => XmlAst.escapeText(String(s == null ? '' : s));
    const attr = (s) => XmlAst.escapeAttr(String(s == null ? '' : s));
    const mediaTypeFor = (path) => IMAGE_TYPES[String(path).split('.').pop().toLowerCase()] || null;
    // Paragraphs of text: a blank line starts a new one, single line breaks become spaces.
    const paragraphs = (text) => String(text || '').replace(/\r\n?/g, '\n').split(/\n[ \t]*\n/).map((p) => p.trim().replace(/\s*\n\s*/g, ' ')).filter(Boolean);

    function figure(src, alt, caption) {
        const cap = String(caption || '').trim();
        return '<figure class="figure">\n  <img src="' + attr(src) + '" alt="' + attr(String(alt || '').trim()) + '"/>' + (cap ? '\n  <figcaption>' + esc(cap) + '</figcaption>' : '') + '\n</figure>';
    }

    function table(rows, cols, caption, header) {
        const r = Math.round(Number(rows)), c = Math.round(Number(cols));
        if (!(r >= 1 && r <= LIMITS.rows) || !(c >= 1 && c <= LIMITS.cols)) throw fail('bad-size', 'A table has 1 to ' + LIMITS.rows + ' rows and 1 to ' + LIMITS.cols + ' columns.');
        const cap = String(caption || '').trim();
        const out = ['<table class="table">'];
        if (cap) out.push('  <caption>' + esc(cap) + '</caption>');
        if (header) {
            out.push('  <thead>', '    <tr>');
            for (let k = 1; k <= c; k++) out.push('      <th scope="col">Column ' + k + '</th>');
            out.push('    </tr>', '  </thead>');
        }
        out.push('  <tbody>');
        for (let i = 0; i < r; i++) out.push('    <tr>' + '<td></td>'.repeat(c) + '</tr>');
        out.push('  </tbody>', '</table>');
        return out.join('\n');
    }

    // A poem: a blank line starts a stanza; a line that begins with spaces or a tab is indented.
    function poem(text) {
        const stanzas = String(text || '').replace(/\r\n?/g, '\n').split(/\n[ \t]*\n/).map((s) => s.split('\n').filter((l) => l.trim())).filter((s) => s.length);
        if (!stanzas.length) throw fail('no-text', 'Enter the poem’s lines.');
        const out = ['<div class="poem">'];
        stanzas.forEach((lines) => {
            out.push('  <div class="stanza">');
            lines.forEach((l) => out.push('    <p class="line' + (/^(\t| {2,})/.test(l) ? ' indent' : '') + '">' + esc(l.trim()) + '</p>'));
            out.push('  </div>');
        });
        out.push('</div>');
        return out.join('\n');
    }

    function quote(text, attribution) {
        const ps = paragraphs(text);
        if (!ps.length) throw fail('no-text', 'Enter the quotation.');
        const who = String(attribution || '').trim();
        const inner = ps.map((p) => '<p>' + esc(p) + '</p>');
        if (!who) return ['<blockquote>'].concat(inner.map((p) => '  ' + p), ['</blockquote>']).join('\n');
        return ['<figure class="quote">', '  <blockquote>'].concat(inner.map((p) => '    ' + p), ['  </blockquote>', '  <figcaption>— ' + esc(who) + '</figcaption>', '</figure>']).join('\n');
    }

    // Where a block goes: after the selected element's block, or at the end of a selected section or body.
    function placement(ast, start) {
        let el = ast.elements.find((e) => e.start === start);
        while (el && INLINE[el.local]) el = ast.byId[el.parentId];
        if (!el || el.type !== 'element' || el.local === 'html' || el.local === 'head' || el === ast.documentElement || ast.elements.some((h) => h.local === 'head' && h.start <= el.start && el.end <= h.end)) {
            throw fail('no-block', 'Select a paragraph on the Stage to put the block after it.');
        }
        if (el.prefix) throw fail('prefixed', 'This chapter writes its XHTML with a prefix; insert the block in the code editor.');
        return CONTAINERS[el.local] ? { ref: el, where: 'append' } : { ref: el, where: 'after' };
    }

    function freeId(model, base) {
        const ids = new Set(model.ast.elements.map((el) => XmlAst.getAttr(el, 'id')).filter((v) => v != null));
        let id = base;
        for (let n = 2; ids.has(id); n++) id = base + '-' + n;
        return id;
    }

    // The entries with `image` listed in the manifest (a new item when it has none). assets: the book's binary paths.
    function listImage(entries, image, assets) {
        const type = mediaTypeFor(image);
        if (!type) throw fail('not-an-image', 'Choose a JPEG, PNG, GIF, WebP, or SVG image.');
        const r = Book.read(entries, { assets: assets });
        if (!r.model) throw fail('unreadable', 'content.opf cannot be read; fix it in the code editor first.');
        if (r.model.manifest.items.some((i) => i.path === image)) return entries;
        const id = freeId(r.model, image.split('/').pop().replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_.-]/g, '-').replace(/^(?![A-Za-z_])/, 'img-'));
        return Object.assign({}, entries, { [r.model.opfPath]: XmlAst.applyEdits(entries[r.model.opfPath], OpfEdit.addItem(r.model, { id: id, path: image, mediaType: type })) });
    }

    // Inserts a block into chapter `path` at the element at `start`. kind: 'figure' | 'table' | 'poem' | 'quote';
    // opts: { image, alt, decorative, caption } | { rows, cols, header, caption } | { text } | { text, attribution }.
    // assets: the book's binary paths. Returns { entries }.
    function insert(entries, path, start, kind, opts, assets) {
        const o = opts || {};
        const ast = XmlAst.parse(entries[path] || '');
        if (!ast.wellFormed) throw fail('not-well-formed', path + ' is not well-formed; fix it in the code editor first.');
        const at = placement(ast, start);
        let next = entries, markup;
        if (kind === 'figure') {
            const image = String(o.image || '');
            const type = mediaTypeFor(image);
            if (!type) throw fail('not-an-image', 'Choose a JPEG, PNG, GIF, WebP, or SVG image.');
            if (!Object.prototype.hasOwnProperty.call(entries, image) && (assets || []).indexOf(image) === -1) throw fail('missing', image + ' is not in the book.');
            // WCAG 2 1.1.1: an image needs a text alternative unless it is decorative (then alt is empty).
            if (!o.decorative && !String(o.alt || '').trim()) throw fail('no-alt', 'Describe the image for readers who cannot see it, or mark it decorative.');
            markup = figure(Book.hrefFor(path, image), o.decorative ? '' : o.alt, o.caption);
            next = listImage(next, image, assets);
        } else if (kind === 'table') markup = table(o.rows, o.cols, o.caption, o.header !== false);
        else if (kind === 'poem') markup = poem(o.text);
        else if (kind === 'quote') markup = quote(o.text, o.attribution);
        else throw fail('bad-kind', 'Unknown block: ' + kind);
        return { entries: Object.assign({}, next, { [path]: XmlAst.applyEdits(entries[path], XmlAst.insert(ast, at.ref, at.where, markup)) }) };
    }

    return { IMAGE_TYPES: IMAGE_TYPES, LIMITS: LIMITS, mediaTypeFor: mediaTypeFor, listImage: listImage, figure: figure, table: table, poem: poem, quote: quote, insert: insert };
});

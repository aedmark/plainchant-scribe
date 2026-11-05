/*
 * BookFonts: embedded fonts as book files, manifest items, and @font-face rules in the layout block (P4-03, D-033).
 *
 * add(entries, assets, font) lists a font file (already in the working copy's assets at font.path) in the manifest
 * with its core media type (EPUB 3.3 §3.2: font/ttf, font/otf, font/woff, font/woff2) and writes its @font-face rule
 * into BookStyle's block. remove() takes both away and clears a body or heading choice left without a face. The file
 * itself is added or deleted by the caller, so the change can be one undo step.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./xml-ast.js'), require('./book.js'), require('./opf-edit.js'), require('./book-style.js'), require('./font-info.js'));
    else root.BookFonts = factory(root.XmlAst, root.Book, root.OpfEdit, root.BookStyle, root.FontInfo);
})(typeof self !== 'undefined' ? self : this, function (XmlAst, Book, OpfEdit, BookStyle, FontInfo) {
    'use strict';

    function fail(code, message) {
        const e = new Error(message);
        e.code = code;
        return e;
    }

    function readBook(entries, assets) {
        const r = Book.read(entries, { assets: assets });
        if (!r.model) throw fail('unreadable', 'content.opf cannot be read; fix it in the code editor first.');
        return r.model;
    }

    // The folder for fonts beside the package document (OEBPS/fonts in the template).
    function folder(entries) {
        const model = Book.read(entries).model;
        return model ? model.opfPath.slice(0, model.opfPath.lastIndexOf('/') + 1) + 'fonts' : 'fonts';
    }

    // The fonts the layout block declares, with their book paths: [{ family, weight, style, src, path }].
    function list(entries) {
        const sheet = BookStyle.stylesheet(entries);
        const s = sheet ? BookStyle.read(entries[sheet]) : null;
        return s ? s.fonts.map((f) => Object.assign({}, f, { path: Book.resolveHref(sheet, f.src).path })) : [];
    }

    function settingsOf(entries, sheet) {
        return BookStyle.read(entries[sheet]) || BookStyle.normalise(BookStyle.PRESETS.plain.settings);
    }

    function language(entries) {
        const model = Book.read(entries).model;
        return model ? model.metadata.language : 'en';
    }

    // font: { path, family, weight, style }.
    function add(entries, assets, font) {
        const type = FontInfo.mediaTypeFor(font.path);
        if (!type) throw fail('not-a-font', font.path + ' is not a TTF, OTF, WOFF, or WOFF2 font.');
        if (!String(font.family || '').trim()) throw fail('no-family', 'Enter the font family name.');
        const sheet = BookStyle.stylesheet(entries);
        if (!sheet) throw fail('no-stylesheet', 'This book has no stylesheet to declare the font in.');
        let model = readBook(entries, assets);
        let next = entries;
        if (!model.manifest.items.some((i) => i.path === font.path)) {
            const base = 'font-' + font.path.split('/').pop().replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
            const ids = new Set(model.ast.elements.map((el) => XmlAst.getAttr(el, 'id')).filter((v) => v != null));
            let id = base;
            for (let n = 2; ids.has(id); n++) id = base + '-' + n;
            next = Object.assign({}, next, { [model.opfPath]: XmlAst.applyEdits(next[model.opfPath], OpfEdit.addItem(model, { id: id, path: font.path, mediaType: type })) });
        }
        const s = settingsOf(next, sheet);
        const src = Book.hrefFor(sheet, font.path);
        s.fonts = s.fonts.filter((f) => f.src !== src).concat({ family: font.family, weight: font.weight, style: font.style, src: src });
        next = Object.assign({}, next, { [sheet]: BookStyle.apply(next[sheet], s, language(next)) });
        return { entries: next, path: font.path };
    }

    function remove(entries, assets, path) {
        const sheet = BookStyle.stylesheet(entries);
        let next = entries;
        const model = readBook(entries, assets);
        const item = model.manifest.items.find((i) => i.path === path);
        if (item) next = Object.assign({}, next, { [model.opfPath]: XmlAst.applyEdits(next[model.opfPath], OpfEdit.removeItem(model, item.id)) });
        if (sheet) {
            const s = settingsOf(next, sheet);
            s.fonts = s.fonts.filter((f) => Book.resolveHref(sheet, f.src).path !== path);
            const families = new Set(s.fonts.map((f) => f.family));
            if (s.bodyFont && !families.has(s.bodyFont)) s.bodyFont = '';
            if (s.headingFont && !families.has(s.headingFont)) s.headingFont = '';
            next = Object.assign({}, next, { [sheet]: BookStyle.apply(next[sheet], s, language(next)) });
        }
        return { entries: next, removed: [path] };
    }

    return { folder: folder, list: list, add: add, remove: remove };
});

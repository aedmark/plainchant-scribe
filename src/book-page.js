/*
 * BookPage: what send to reader shares (P5-07, D-043, D-009). Pure, no DOM.
 *
 * share(entries, assets, options) picks the files to serve, which are exactly the ones Export packs (BookExport.plan),
 * so the reader sees no file the .epub would not hold, and builds the page the shared link opens: the title, authors,
 * cover, a download link for the .epub, and the chapters in reading order, each opening in the browser with the
 * book's own stylesheets. The page sits at the link's root, so its links are the book's paths, percent-encoded by
 * segment. Paths under RESERVED are the server's own and are never a book's file there.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./book.js'), require('./book-chapters.js'), require('./book-export.js'));
    else root.BookPage = factory(root.Book, root.BookChapters, root.BookExport);
}(typeof self !== 'undefined' ? self : this, function (Book, BookChapters, BookExport) {
    'use strict';

    const RESERVED = '__pc_book/';
    const PAGE = RESERVED + 'index.html';

    const escape = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const href = (path) => path.split('/').map(encodeURIComponent).join('/');

    function size(bytes) {
        if (!(bytes >= 0)) return '';
        if (bytes < 1024) return bytes + ' bytes';
        if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function names(list) {
        const v = list.map((c) => c.value).filter(Boolean);
        return v.length <= 2 ? v.join(' and ') : v.slice(0, -1).join(', ') + ', and ' + v[v.length - 1];
    }

    const STYLE = [
        ':root{color-scheme:light dark;--ink:#2b2419;--paper:#f7f1e3;--rule:#d8ccb0;--accent:#7a2e1f}',
        '@media (prefers-color-scheme:dark){:root{--ink:#eadfc8;--paper:#1f1b16;--rule:#4a4032;--accent:#e08a6d}}',
        'body{margin:0;background:var(--paper);color:var(--ink);font:1.1rem/1.5 Georgia,"EB Garamond",serif}',
        'main{max-width:34rem;margin:0 auto;padding:1.5rem 1.25rem 3rem}',
        'h1{font-size:1.8rem;line-height:1.2;margin:0 0 .25rem}.by{margin:0 0 1.25rem;font-style:italic}',
        'img{display:block;max-width:100%;max-height:50vh;margin:0 0 1.25rem;border:1px solid var(--rule)}',
        '.get{display:inline-block;padding:.7rem 1.2rem;border-radius:.4rem;background:var(--accent);color:var(--paper);font-weight:bold;text-decoration:none}',
        '.note{font-size:.95rem;margin:.6rem 0 1.5rem}h2{font-size:1.2rem;border-top:1px solid var(--rule);padding-top:1rem}',
        'ol{padding-left:1.5rem}li{margin:.35rem 0}a{color:var(--accent)}.extra{font-size:.9rem;opacity:.8}'
    ].join('');

    // options: { bytes } (the .epub's size), { name } (its file name; from the title when absent).
    function share(entries, assets, options) {
        const o = options || {};
        const binaries = assets || [];
        const plan = BookExport.plan(entries, binaries);
        const model = Book.read(entries, { assets: binaries }).model;
        const md = model.metadata;
        const title = md.title || 'Untitled book';
        const name = o.name || BookExport.fileName(md.title);
        const download = RESERVED + name;
        const served = plan.order.filter((p) => p !== 'mimetype' && p.indexOf(RESERVED) !== 0);
        const inBook = new Set(served);
        const chapters = BookChapters.list(entries).filter((c) => inBook.has(c.path));
        const cover = model.cover && model.cover.path && inBook.has(model.cover.path) && /^image\//.test(model.cover.mediaType || '') ? model.cover.path : null;
        const lang = md.language || 'en';
        const by = names(md.creators);
        const html = [
            '<!DOCTYPE html>',
            '<html lang="' + escape(lang) + '">',
            '<head>',
            '<meta charset="utf-8">',
            '<meta name="viewport" content="width=device-width, initial-scale=1">',
            '<title>' + escape(title) + '</title>',
            '<style>' + STYLE + '</style>',
            '</head>',
            '<body>',
            '<main>',
            '<h1>' + escape(title) + '</h1>',
            by ? '<p class="by">by ' + escape(by) + '</p>' : '',
            cover ? '<img src="' + escape(href(cover)) + '" alt="The cover of ' + escape(title) + '">' : '',
            '<p><a class="get" href="' + escape(href(download)) + '" download="' + escape(name) + '" type="application/epub+zip">Download the .epub' + (o.bytes >= 0 ? ' (' + size(o.bytes) + ')' : '') + '</a></p>',
            '<p class="note">On a phone or tablet it opens in your reading app or saves to Downloads. A Kindle cannot open an .epub from its browser: use Send to Kindle, or convert the book with Calibre.</p>',
            chapters.length ? '<h2>Read in the browser</h2>' : '',
            chapters.length ? '<ol>' + chapters.map((c) => '<li><a href="' + escape(href(c.path)) + '">' + escape(c.title) + '</a>' + (c.linear === false ? ' <span class="extra">(outside the reading order)</span>' : '') + '</li>').join('') + '</ol>' : '',
            '<p class="extra">Shared from Plainchant Scribe on this network. It updates as the book is edited.</p>',
            '</main>',
            '</body>',
            '</html>',
            ''
        ].filter((line) => line !== '').join('\n');
        return { page: PAGE, html: html, files: served, download: download, name: name, chapters: chapters.length };
    }

    return { RESERVED: RESERVED, PAGE: PAGE, share: share, size: size };
}));

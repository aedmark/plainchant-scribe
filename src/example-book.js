/*
 * ExampleBook: the book behind "Load Example Book" (P2-01, D-018), a short guide to Scribe in three chapters.
 *
 * It is made the way a user's book is: the new-book template, then OpfEdit and Nav edits, so it also exercises
 * them. The text is written for Scribe. A test keeps it passing Scribe's own checks and EPUBCheck.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./xml-ast.js'), require('./book-template.js'), require('./book.js'), require('./opf-edit.js'), require('./nav.js'));
    else root.ExampleBook = factory(root.XmlAst, root.BookTemplate, root.Book, root.OpfEdit, root.Nav);
})(typeof self !== 'undefined' ? self : this, function (XmlAst, BookTemplate, Book, OpfEdit, Nav) {
    'use strict';

    const TITLE = 'A Short Guide to Plainchant Scribe';
    const CHAPTERS = [
        {
            id: 'chapter-1', title: 'A Book Is a Folder of Files',
            body: [
                '<p>An EPUB book is a zip of ordinary files, and Scribe keeps them as they are. What you see in the Explorer is the whole book.</p>',
                '<ul>',
                '  <li><code>mimetype</code> says, in one line, that this is an EPUB.</li>',
                '  <li><code>META-INF/container.xml</code> points at the package document.</li>',
                '  <li><code>OEBPS/content.opf</code>, the package document, lists every file (the manifest) and the reading order (the spine), with the title, language, and identifier.</li>',
                '  <li><code>OEBPS/nav.xhtml</code> is the table of contents a reader shows in its menu.</li>',
                '  <li>The chapters are XHTML files in <code>OEBPS/text/</code>, styled by <code>OEBPS/css/book.css</code>.</li>',
                '</ul>',
                '<p>Edit any of them in the code editor. Scribe changes only what you change, so a hand-made file stays hand-made.</p>'
            ]
        },
        {
            id: 'chapter-2', title: 'Chapters and Contents',
            body: [
                '<p>The spine in <code>content.opf</code> decides the order of the book. This chapter is second because its <code>itemref</code> is second.</p>',
                '<p>The contents in <code>nav.xhtml</code> are a separate list of links. Keep the two in the same order, or readers will jump about.</p>',
                '<blockquote>',
                '  <p>A reading system lays the text out for its own screen. Leave the page size to the reader and style the words.</p>',
                '</blockquote>',
                '<p>Open a chapter in the editor and the Reading Stage shows it, parsed the way a reader parses it: a missing end tag stops the chapter, as it would on a device.</p>'
            ]
        },
        {
            id: 'chapter-3', title: 'A Page of Typical Elements',
            body: [
                '<p>Most books need only a few elements: paragraphs, <em>emphasis</em> and <strong>strong importance</strong>, lists, quotations, and the occasional note.<a epub:type="noteref" href="#note-1" id="ref-1">1</a></p>',
                '<h2 id="lists">Lists</h2>',
                '<ol>',
                '  <li>Write the chapter.</li>',
                '  <li>Check the Problems tab.</li>',
                '  <li>Read it on the Stage.</li>',
                '</ol>',
                '<h2 id="notes">Notes</h2>',
                '<p>A note is an <code>aside</code> marked as a footnote, linked from the text. Many readers show it in a pop-up.</p>',
                '<aside epub:type="footnote" id="note-1" class="note">',
                '  <p><a href="#ref-1">1.</a> Like this one.</p>',
                '</aside>'
            ]
        }
    ];
    const EXTRA_CSS = [
        '',
        'code {',
        '  font-family: monospace;',
        '}',
        '',
        'blockquote {',
        '  margin: 1em 2em;',
        '  font-style: italic;',
        '}',
        '',
        'aside.note {',
        '  font-size: 0.9em;',
        '  margin-top: 2em;',
        '}'
    ];

    function chapterText(template, ch) {
        const ind = '    ';
        const body = ch.body.map((line) => ind + line).join('\n');
        return template.replace('<title>Chapter 1</title>', '<title>' + XmlAst.escapeText(ch.title) + '</title>')
            .replace(/<section epub:type="chapter" id="chapter-1" aria-labelledby="chapter-1-title">[\s\S]*<\/section>/,
                '<section epub:type="chapter" id="' + ch.id + '" aria-labelledby="' + ch.id + '-title">\n' + ind + '<h1 id="' + ch.id + '-title">' + XmlAst.escapeText(ch.title) + '</h1>\n' + body + '\n  </section>');
    }

    // Applies one OpfEdit or Nav op to a fresh read, as the app does.
    function applyOpf(files, op) {
        const model = Book.read(files).model;
        files[model.opfPath] = XmlAst.applyEdits(files[model.opfPath], op(model));
    }
    function applyNav(files, op) {
        const model = Book.read(files).model;
        const nav = Nav.read(files, model).nav;
        files[nav.path] = XmlAst.applyEdits(files[nav.path], op(nav, model));
    }

    // options: { uuid, now, crypto } as for BookTemplate.create.
    function create(options) {
        const book = BookTemplate.create(Object.assign({ title: TITLE, creator: 'Plainchant Scribe', language: 'en' }, options || {}));
        const files = book.files;
        const dir = book.paths.chapter.slice(0, book.paths.chapter.lastIndexOf('/') + 1);
        const template = files[book.paths.chapter];
        CHAPTERS.forEach((ch, i) => {
            const path = dir + ch.id + '.xhtml';
            files[path] = chapterText(template, ch);
            if (i > 0) {
                applyOpf(files, (m) => OpfEdit.addItem(m, { id: ch.id, path: path, mediaType: 'application/xhtml+xml' }));
                applyOpf(files, (m) => OpfEdit.addItemref(m, ch.id));
                applyNav(files, (n) => Nav.addEntry(n, n.toc, 'append', { label: ch.title, path: path }));
            } else applyNav(files, (n) => Nav.setLabel(n, n.toc.entries[0], ch.title));
        });
        files[book.paths.css] = files[book.paths.css] + EXTRA_CSS.join('\n') + '\n';
        return { files: files, dirs: book.dirs, paths: book.paths, identifier: book.identifier, modified: book.modified };
    }

    return { TITLE: TITLE, create: create };
});

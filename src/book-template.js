/*
 * BookTemplate: the files of a new, empty EPUB 3.3 book (P1-02, D-012).
 *
 * create() returns plain text files keyed by container path, plus the empty folders the Studio shows. Nothing is
 * zipped here; Export (P5-01) puts `mimetype` first and stored. Rules cite EPUB 3.3 (W3C Recommendation).
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./xml-ast.js'));
    else root.BookTemplate = factory(root.XmlAst);
})(typeof self !== 'undefined' ? self : this, function (XmlAst) {
    'use strict';

    const DEFAULTS = { title: 'Untitled Book', language: 'en' };
    const OPF_PATH = 'OEBPS/content.opf';
    const PATHS = {
        mimetype: 'mimetype',
        container: 'META-INF/container.xml',
        opf: OPF_PATH,
        nav: 'OEBPS/nav.xhtml',
        chapter: 'OEBPS/text/chapter-1.xhtml',
        css: 'OEBPS/css/book.css'
    };
    const DIRS = ['OEBPS/images', 'OEBPS/fonts'];
    // BCP 47 well-formedness in its simple form (language, then subtags); EPUB 3.3 §5.5.3.1.3 requires a well-formed tag.
    const LANG_RE = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/;

    function uuidV4(cryptoImpl) {
        const c = cryptoImpl || (typeof globalThis !== 'undefined' ? globalThis.crypto : null);
        if (c && typeof c.randomUUID === 'function') return c.randomUUID();
        if (!c || typeof c.getRandomValues !== 'function') throw new Error('No secure random source for a book identifier.');
        const b = c.getRandomValues(new Uint8Array(16));
        b[6] = (b[6] & 0x0F) | 0x40;
        b[8] = (b[8] & 0x3F) | 0x80;
        const h = Array.from(b, (x) => (x + 0x100).toString(16).slice(1)).join('');
        return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
    }

    // EPUB 3.3 §5.5.5: exactly one dcterms:modified, YYYY-MM-DDThh:mm:ssZ in UTC.
    function modifiedStamp(date) {
        const d = date instanceof Date ? date : new Date(date == null ? Date.now() : date);
        if (isNaN(d.getTime())) throw new Error('Invalid modification date.');
        return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
    }

    const lines = (arr) => arr.join('\n') + '\n';

    function xhtmlHead(language, title, cssHref) {
        const lang = XmlAst.escapeAttr(language);
        return [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<!DOCTYPE html>',
            '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="' + lang + '" lang="' + lang + '">',
            '<head>',
            '  <title>' + XmlAst.escapeText(title) + '</title>',
            '  <link rel="stylesheet" type="text/css" href="' + cssHref + '"/>',
            '</head>'
        ];
    }

    function create(options) {
        const o = options || {};
        const title = String(o.title == null ? '' : o.title).trim() || DEFAULTS.title;
        const language = String(o.language == null ? '' : o.language).trim() || DEFAULTS.language;
        if (!LANG_RE.test(language)) throw new Error('"' + language + '" is not a well-formed language tag (EPUB 3.3 §5.5.3.1.3).');
        const creator = String(o.creator == null ? '' : o.creator).trim();
        const uuid = o.uuid || uuidV4(o.crypto);
        const identifier = 'urn:uuid:' + uuid;
        const modified = modifiedStamp(o.now);
        const lang = XmlAst.escapeAttr(language);

        const files = {};
        // EPUB 3.3 §4.3.3: exactly application/epub+zip, US-ASCII, no padding, white space, or byte order mark.
        files[PATHS.mimetype] = 'application/epub+zip';
        // EPUB 3.3 §4.2.6.3.1: container.xml names the package document.
        files[PATHS.container] = lines([
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">',
            '  <rootfiles>',
            '    <rootfile full-path="' + OPF_PATH + '" media-type="application/oebps-package+xml"/>',
            '  </rootfiles>',
            '</container>'
        ]);
        // EPUB 3.3 §5.4 to §5.7: version 3.0, unique-identifier, dc:identifier, dc:title, dc:language, dcterms:modified.
        files[PATHS.opf] = lines([
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id" xml:lang="' + lang + '">',
            '  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">',
            '    <dc:identifier id="pub-id">' + XmlAst.escapeText(identifier) + '</dc:identifier>',
            '    <dc:title id="title">' + XmlAst.escapeText(title) + '</dc:title>'
        ].concat(creator ? ['    <dc:creator id="creator">' + XmlAst.escapeText(creator) + '</dc:creator>'] : [], [
            '    <dc:language>' + XmlAst.escapeText(language) + '</dc:language>',
            '    <meta property="dcterms:modified">' + modified + '</meta>',
            '  </metadata>',
            '  <manifest>',
            '    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
            '    <item id="css" href="css/book.css" media-type="text/css"/>',
            '    <item id="chapter-1" href="text/chapter-1.xhtml" media-type="application/xhtml+xml"/>',
            '  </manifest>',
            '  <spine>',
            '    <itemref idref="chapter-1"/>',
            '  </spine>',
            '</package>'
        ]));
        // EPUB 3.3 §7.2 and §7.4: exactly one toc nav. Landmarks point only into the spine: EPUBCheck 5.4.0 rejects a
        // landmark to the nav itself while the nav is not a spine item (RSC-011).
        files[PATHS.nav] = lines(xhtmlHead(language, 'Contents', 'css/book.css').concat([
            '<body>',
            '  <nav epub:type="toc" id="toc">',
            '    <h1>Contents</h1>',
            '    <ol>',
            '      <li><a href="text/chapter-1.xhtml">Chapter 1</a></li>',
            '    </ol>',
            '  </nav>',
            '  <nav epub:type="landmarks" id="landmarks" hidden="">',
            '    <ol>',
            '      <li><a epub:type="bodymatter" href="text/chapter-1.xhtml">Start of content</a></li>',
            '    </ol>',
            '  </nav>',
            '</body>',
            '</html>'
        ]));
        files[PATHS.chapter] = lines(xhtmlHead(language, 'Chapter 1', '../css/book.css').concat([
            '<body epub:type="bodymatter">',
            '  <section epub:type="chapter" id="chapter-1" aria-labelledby="chapter-1-title">',
            '    <h1 id="chapter-1-title">Chapter 1</h1>',
            '    <p>Begin writing here.</p>',
            '  </section>',
            '</body>',
            '</html>'
        ]));
        files[PATHS.css] = lines([
            '/* The book\'s own styles. Readers apply their own fonts, colours, and margins on top of these. */',
            '',
            'html, body {',
            '  margin: 0;',
            '  padding: 0;',
            '}',
            '',
            'h1 {',
            '  margin: 2em 0 1em;',
            '}',
            '',
            'p {',
            '  margin: 0;',
            '  text-indent: 1.5em;',
            '}',
            '',
            'h1 + p {',
            '  text-indent: 0;',
            '}'
        ]);
        return { files: files, dirs: DIRS.slice(), paths: Object.assign({}, PATHS), identifier: identifier, modified: modified };
    }

    return { DEFAULTS: DEFAULTS, PATHS: PATHS, create: create, uuidV4: uuidV4, modifiedStamp: modifiedStamp };
});

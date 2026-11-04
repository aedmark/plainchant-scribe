const T_NS = {
    opf: 'http://www.idpf.org/2007/opf',
    dc: 'http://purl.org/dc/elements/1.1/',
    xhtml: 'http://www.w3.org/1999/xhtml',
    epub: 'http://www.idpf.org/2007/ops',
    container: 'urn:oasis:names:tc:opendocument:xmlns:container'
};
const FIXED = { uuid: '0f3c2a1e-6b7d-4e2a-9c1b-8a5d4f3e2b10', now: Date.UTC(2026, 10, 3, 9, 5, 7, 432) };

// Resolves a relative href against the folder of the file that holds it (container paths, no scheme).
function resolveIn(fromPath, href) {
    const parts = fromPath.split('/').slice(0, -1);
    href.split('#')[0].split('/').forEach((seg) => {
        if (seg === '..') parts.pop();
        else if (seg && seg !== '.') parts.push(seg);
    });
    return parts.join('/');
}

test('book-template: a new book has the container, package, nav, one chapter, and a stylesheet, mimetype first', () => {
    const book = BookTemplate.create(FIXED);
    assert.deepEqual(Object.keys(book.files), ['mimetype', 'META-INF/container.xml', 'OEBPS/content.opf', 'OEBPS/nav.xhtml', 'OEBPS/text/chapter-1.xhtml', 'OEBPS/css/book.css']);
    assert.equal(book.files.mimetype, 'application/epub+zip', 'exact bytes, no newline (EPUB 3.3 §4.3.3)');
    assert.deepEqual(book.dirs, ['OEBPS/images', 'OEBPS/fonts']);
    Object.keys(book.files).filter((p) => /\.(xml|opf|xhtml)$/.test(p)).forEach((p) => {
        const ast = XmlAst.parse(book.files[p]);
        assert.deepEqual(ast.errors, [], p + ' is well-formed');
        assert.equal(ast.xmlDecl && ast.xmlDecl.encoding, 'UTF-8', p + ' declares UTF-8');
    });
    assert.deepEqual(BookTemplate.create(FIXED), book, 'the same options give the same book');
});

test('book-template: the package document carries the required metadata (EPUB 3.3 §5.4, §5.5)', () => {
    const book = BookTemplate.create(FIXED);
    const opf = XmlAst.parse(book.files['OEBPS/content.opf']);
    const pkg = opf.documentElement;
    assert.equal(pkg.ns, T_NS.opf);
    assert.equal(XmlAst.getAttr(pkg, 'version'), '3.0');
    const uid = XmlAst.findAll(opf, 'identifier', T_NS.dc).find((el) => XmlAst.getAttr(el, 'id') === XmlAst.getAttr(pkg, 'unique-identifier'));
    assert.ok(uid, 'unique-identifier points at a dc:identifier');
    assert.equal(XmlAst.textContent(uid), 'urn:uuid:' + FIXED.uuid);
    assert.equal(book.identifier, 'urn:uuid:' + FIXED.uuid);
    assert.equal(XmlAst.textContent(XmlAst.find(opf, 'title', T_NS.dc)), 'Untitled Book');
    assert.equal(XmlAst.textContent(XmlAst.find(opf, 'language', T_NS.dc)), 'en');
    assert.equal(XmlAst.find(opf, 'creator', T_NS.dc), null, 'no placeholder author');
    const modified = XmlAst.findAll(opf, 'meta', T_NS.opf).filter((m) => XmlAst.getAttr(m, 'property') === 'dcterms:modified');
    assert.equal(modified.length, 1, 'exactly one dcterms:modified (§5.5.5)');
    assert.equal(XmlAst.textContent(modified[0]), '2026-11-03T09:05:07Z');
    assert.deepEqual(XmlAst.elementChildren(pkg).map((el) => el.local), ['metadata', 'manifest', 'spine'], 'metadata, manifest, spine in that order');
});

test('book-template: every manifest item exists, every book file is in the manifest, and the spine holds the chapter', () => {
    const book = BookTemplate.create(FIXED);
    const opfPath = 'OEBPS/content.opf';
    const opf = XmlAst.parse(book.files[opfPath]);
    const items = XmlAst.findAll(opf, 'item', T_NS.opf);
    const byId = {};
    items.forEach((it) => { byId[XmlAst.getAttr(it, 'id')] = it; });
    const listed = items.map((it) => resolveIn(opfPath, XmlAst.getAttr(it, 'href')));
    listed.forEach((p) => assert.ok(p in book.files, p + ' exists'));
    const content = Object.keys(book.files).filter((p) => p !== 'mimetype' && p.indexOf('META-INF/') !== 0 && p !== opfPath);
    assert.deepEqual(listed.slice().sort(), content.sort(), 'mimetype, META-INF, and the OPF are not listed (§4.2.2)');
    assert.equal(items.filter((it) => (XmlAst.getAttr(it, 'properties') || '').split(/\s+/).indexOf('nav') !== -1).length, 1, 'one nav item');
    const spine = XmlAst.findAll(opf, 'itemref', T_NS.opf).map((r) => XmlAst.getAttr(r, 'idref'));
    assert.deepEqual(spine, ['chapter-1']);
    assert.equal(XmlAst.getAttr(byId['chapter-1'], 'media-type'), 'application/xhtml+xml');
    const container = XmlAst.parse(book.files['META-INF/container.xml']);
    const rootfile = XmlAst.find(container, 'rootfile', T_NS.container);
    assert.equal(XmlAst.getAttr(rootfile, 'full-path'), opfPath);
    assert.equal(XmlAst.getAttr(rootfile, 'media-type'), 'application/oebps-package+xml');
});

test('book-template: the nav has one toc whose links reach the spine, and every XHTML file has the book language', () => {
    const book = BookTemplate.create(Object.assign({ language: 'fr-CA' }, FIXED));
    const navPath = 'OEBPS/nav.xhtml';
    const nav = XmlAst.parse(book.files[navPath]);
    const navs = XmlAst.findAll(nav, 'nav', T_NS.xhtml);
    assert.equal(navs.filter((n) => XmlAst.getAttr(n, 'type', T_NS.epub) === 'toc').length, 1, 'exactly one toc nav (§7.2)');
    XmlAst.findAll(nav, 'a', T_NS.xhtml).forEach((a) => {
        assert.equal(resolveIn(navPath, XmlAst.getAttr(a, 'href')), 'OEBPS/text/chapter-1.xhtml', 'nav links point into the spine');
    });
    ['OEBPS/nav.xhtml', 'OEBPS/text/chapter-1.xhtml'].forEach((p) => {
        const html = XmlAst.parse(book.files[p]).documentElement;
        assert.equal(html.ns, T_NS.xhtml);
        assert.equal(XmlAst.getAttr(html, 'lang', XmlAst.NS_XML), 'fr-CA', p + ' xml:lang');
        assert.equal(XmlAst.getAttr(html, 'lang'), 'fr-CA', p + ' lang');
        const link = XmlAst.find(XmlAst.parse(book.files[p]), 'link', T_NS.xhtml);
        assert.equal(resolveIn(p, XmlAst.getAttr(link, 'href')), 'OEBPS/css/book.css', p + ' links the stylesheet');
    });
    const opf = XmlAst.parse(book.files['OEBPS/content.opf']);
    assert.equal(XmlAst.textContent(XmlAst.find(opf, 'language', T_NS.dc)), 'fr-CA');
});

test('book-template: title and creator are escaped, trimmed, and defaulted; a bad language is refused', () => {
    const book = BookTemplate.create(Object.assign({ title: '  Ink & <Ash> "One"  ', creator: ' A. Writer ' }, FIXED));
    const opf = XmlAst.parse(book.files['OEBPS/content.opf']);
    assert.ok(opf.wellFormed);
    assert.equal(XmlAst.textContent(XmlAst.find(opf, 'title', T_NS.dc)), 'Ink & <Ash> "One"');
    assert.equal(XmlAst.textContent(XmlAst.find(opf, 'creator', T_NS.dc)), 'A. Writer');
    assert.equal(XmlAst.textContent(XmlAst.find(XmlAst.parse(BookTemplate.create({ title: '   ', uuid: FIXED.uuid }).files['OEBPS/content.opf']), 'title', T_NS.dc)), 'Untitled Book');
    ['en_US', '', 'x', 'en-', '"><x'].filter((l) => l !== '').forEach((l) => assert.throws(() => BookTemplate.create({ language: l }), l));
    assert.throws(() => BookTemplate.create({ now: 'not a date' }));
});

test('book-template: identifiers are random version 4 UUIDs, from randomUUID or getRandomValues', () => {
    const a = BookTemplate.create().identifier, b = BookTemplate.create().identifier;
    const v4 = /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    assert.ok(v4.test(a), a);
    assert.ok(a !== b, 'two books get two identifiers');
    const fallback = BookTemplate.uuidV4({ getRandomValues: (arr) => arr.fill(0xFF) });
    assert.equal(fallback, 'ffffffff-ffff-4fff-bfff-ffffffffffff', 'version and variant bits are set');
    assert.throws(() => BookTemplate.uuidV4({}), 'no secure random source is an error, never Math.random');
    assert.ok(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(BookTemplate.create().modified));
});

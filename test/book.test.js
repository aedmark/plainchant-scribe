const bkFs = require('fs');
const bkPath = require('path');

const bkFixture = (name) => bkFs.readFileSync(bkPath.join(__dirname, 'fixtures', 'xml', name), 'utf8');
const OPF = 'OEBPS/content.opf';
const freshBook = (opts) => BookTemplate.create(Object.assign({ uuid: '0f3c2a1e-6b7d-4e2a-9c1b-8a5d4f3e2b10', now: Date.UTC(2026, 10, 3) }, opts)).files;

// Applies [from, to] text replacements to the template's OPF, failing loudly if a pattern is absent.
function withOpf(pairs, extra) {
    const files = Object.assign(freshBook(), extra || {});
    pairs.forEach(([from, to]) => {
        assert.ok(files[OPF].indexOf(from) !== -1, 'the template OPF contains ' + JSON.stringify(from));
        files[OPF] = files[OPF].replace(from, to);
    });
    return files;
}
const problemCodes = (files, options) => Book.read(files, options).problems.map((p) => p.severity + ' ' + p.code);

test('book: reads the new-book template with no problems', () => {
    const r = Book.read(freshBook({ creator: 'Ada Penrose', title: 'Ink & Ash' }));
    assert.deepEqual(r.problems, []);
    const m = r.model;
    assert.equal(m.opfPath, OPF);
    assert.equal(m.package.version, '3.0');
    assert.equal(m.metadata.title, 'Ink & Ash');
    assert.equal(m.metadata.language, 'en');
    assert.equal(m.metadata.uniqueIdentifier.value, 'urn:uuid:0f3c2a1e-6b7d-4e2a-9c1b-8a5d4f3e2b10');
    assert.equal(m.metadata.modified, '2026-11-03T00:00:00Z');
    assert.deepEqual(m.metadata.creators.map((c) => c.value), ['Ada Penrose']);
    assert.equal(m.nav.path, 'OEBPS/nav.xhtml');
    assert.deepEqual(m.manifest.items.map((i) => [i.id, i.path, i.exists]), [['nav', 'OEBPS/nav.xhtml', true], ['css', 'OEBPS/css/book.css', true], ['chapter-1', 'OEBPS/text/chapter-1.xhtml', true]]);
    assert.deepEqual(m.spine.itemrefs.map((r) => [r.item.path, r.linear]), [['OEBPS/text/chapter-1.xhtml', true]]);
    assert.equal(m.cover, null);
});

test('book: reads a hand-edited OPF: refinements attach to their subject, prefixed attributes, comments', () => {
    const files = {
        'META-INF/container.xml': bkFixture('container.xml'),
        'OEBPS/content.opf': bkFixture('content.opf'),
        'OEBPS/nav.xhtml': bkFixture('nav.xhtml'),
        'OEBPS/text/chapter-1.xhtml': bkFixture('chapter.xhtml'),
        'OEBPS/text/chapter-2.xhtml': bkFixture('chapter.xhtml'),
        'OEBPS/css/book.css': ''
    };
    const r = Book.read(files);
    assert.deepEqual(r.problems, []);
    const md = r.model.metadata;
    assert.equal(md.title, 'The Quiet Ledger & Other Stories');
    assert.equal(md.uniqueIdentifier.id, 'pub-id');
    assert.equal(Book.refinement(md.creators[0], 'file-as'), 'Penrose, Ada');
    assert.equal(XmlAst.getAttr(md.creators[0].node, 'role', Book.NS.opf), 'aut', 'the node is there for EPUB 2 attributes');
    assert.equal(md.metas.length, 2, 'every meta, in document order');
    assert.equal(r.model.package.prefix, 'rendition: http://www.idpf.org/vocab/rendition/#');
    assert.equal(r.model.package.lang, 'en');
});

test('book: the container and the package document must be found and well-formed, or there is no model', () => {
    const files = freshBook();
    const cases = [
        [Object.assign({}, files, { 'META-INF/container.xml': undefined }), 'container-missing'],
        [Object.assign({}, files, { 'META-INF/container.xml': '<container><rootfiles>' }), 'xml-unclosed-element'],
        [Object.assign({}, files, { 'META-INF/container.xml': files['META-INF/container.xml'].replace('application/oebps-package+xml', 'text/xml') }), 'rootfile-missing'],
        [Object.assign({}, files, { 'META-INF/container.xml': files['META-INF/container.xml'].replace('OEBPS/content.opf', 'OEBPS/book.opf') }), 'package-missing'],
        [Object.assign({}, files, { [OPF]: files[OPF].replace('</spine>', '') }), 'xml-unclosed-element'],
        [Object.assign({}, files, { [OPF]: '<?xml version="1.0"?><package version="3.0"/>' }), 'package-root']
    ];
    cases.forEach(([f, code]) => {
        Object.keys(f).forEach((k) => { if (f[k] === undefined) delete f[k]; });
        const r = Book.read(f);
        assert.equal(r.model, null, code + ' gives no model');
        assert.ok(r.problems.some((p) => p.code === code && p.severity === 'error'), code + ' in ' + JSON.stringify(r.problems.map((p) => p.code)));
    });
    const bad = Book.read(Object.assign({}, files, { [OPF]: files[OPF].replace('<spine>', '<spine>\n    &nbsp;') })).problems[0];
    assert.deepEqual([bad.code, bad.path, bad.line], ['xml-undeclared-entity', OPF, files[OPF].split('\n').findIndex((l) => l.indexOf('<spine>') !== -1) + 1]);
    assert.includes(bad.message, '&#160;');
});

test('book: package rules are reported as errors with their spec section (EPUB 3.3 §5.4 to §5.7)', () => {
    const cases = [
        [[['version="3.0"', 'version="2.0"']], ['error package-version']],
        [[['    <dc:title id="title">Untitled Book</dc:title>\n', '']], ['error missing-title']],
        [[['    <dc:language>en</dc:language>\n', '']], ['error missing-language']],
        [[['<dc:title id="title">Untitled Book</dc:title>', '<dc:title id="title">  </dc:title>']], ['error empty-value']],
        [[['<dc:language>en</dc:language>', '<dc:language>en_US</dc:language>']], ['error language-tag']],
        [[['unique-identifier="pub-id"', 'unique-identifier="other"']], ['error unique-identifier-dangling']],
        [[[' unique-identifier="pub-id"', '']], ['error unique-identifier-missing']],
        [[[/ *<meta property="dcterms:modified">[^<]*<\/meta>\n/.exec(freshBook()[OPF])[0], '']], ['error modified-missing']],
        [[['2026-11-03T00:00:00Z', '2026-11-03']], ['error modified-format']],
        [[['</metadata>', '  <meta property="dcterms:modified">2026-11-04T00:00:00Z</meta>\n  </metadata>']], ['error modified-repeated']],
        [[['</metadata>', '  <meta id="title" property="dcterms:publisher">X</meta>\n  </metadata>']], ['error duplicate-id']],
        [[['href="text/chapter-1.xhtml"', 'href="text/chapter-9.xhtml"']], ['error item-file-missing']],
        [[['href="css/book.css"', 'href="../../book.css"']], ['error item-href-invalid']],
        [[['</manifest>', '  <item id="css2" href="css/book.css" media-type="text/css"/>\n  </manifest>']], ['error duplicate-href']],
        [[['</manifest>', '  <item id="mt" href="../mimetype" media-type="text/plain"/>\n  </manifest>']], ['error manifest-lists-container-file']],
        [[['</manifest>', '  <item id="opf" href="content.opf" media-type="application/oebps-package+xml"/>\n  </manifest>']], ['error manifest-lists-package']],
        [[[' media-type="text/css"', '']], ['error item-media-type-missing']],
        [[['media-type="text/css"', 'media-type="text/css" fallback="nothing"']], ['error fallback-missing']],
        [[[' properties="nav"', '']], ['error nav-missing']],
        [[['media-type="text/css"', 'media-type="text/css" properties="nav"']], ['error nav-multiple']],
        [[['media-type="text/css"', 'media-type="text/css" properties="cover-image"']], ['error cover-not-image']],
        [[['<itemref idref="chapter-1"/>', '<itemref idref="chapter-2"/>']], ['error itemref-unknown']],
        [[['<itemref idref="chapter-1"/>', '<itemref idref="chapter-1"/><itemref idref="chapter-1"/>']], ['error itemref-repeated']],
        [[['<itemref idref="chapter-1"/>', '<itemref idref="chapter-1" linear="maybe"/>']], ['error itemref-linear']],
        [[['<itemref idref="chapter-1"/>', '<itemref idref="chapter-1"/><itemref idref="css"/>']], ['error spine-not-content']],
        [[['    <itemref idref="chapter-1"/>\n', '']], ['error spine-empty']],
        [[['</metadata>', '  <meta refines="#nobody" property="role">aut</meta>\n  </metadata>']], ['error refines-target-missing']],
        [[['</metadata>', '  <meta id="a" refines="#b" property="x">1</meta>\n    <meta id="b" refines="#a" property="y">2</meta>\n  </metadata>']], ['error refines-cycle', 'error refines-cycle']],
        [[['<dc:title id="title">Untitled Book</dc:title>', '<dc:title id="title">One</dc:title>\n    <dc:title>Two</dc:title>']], ['warning multiple-titles']]
    ];
    cases.forEach(([pairs, expected]) => assert.deepEqual(problemCodes(withOpf(pairs)), expected, JSON.stringify(pairs[0][1]).slice(0, 80)));
    const order = freshBook();
    const opfText = order[OPF];
    const spineBlock = opfText.slice(opfText.indexOf('  <spine>'), opfText.indexOf('</spine>') + 9);
    order[OPF] = opfText.replace(spineBlock, '').replace('  <manifest>', spineBlock + '\n  <manifest>');
    assert.deepEqual(problemCodes(order), ['error package-order']);
    const msg = Book.read(withOpf([['version="3.0"', 'version="2.0"']])).problems[0].message;
    assert.includes(msg, 'EPUB 3.3 §5.4');
});

test('book: covers, binary assets, remote resources, and fallback chains', () => {
    const image = '  <item id="cover" href="images/cover.jpg" media-type="image/jpeg" properties="cover-image"/>\n';
    const files = withOpf([['  </manifest>', image + '  </manifest>']]);
    assert.deepEqual(problemCodes(files), ['error item-file-missing'], 'an asset that is not in the book');
    const r = Book.read(files, { assets: ['OEBPS/images/cover.jpg'] });
    assert.deepEqual(r.problems, []);
    assert.equal(r.model.cover.path, 'OEBPS/images/cover.jpg');
    assert.equal(r.model.coverSource, 'cover-image');
    const two = withOpf([['  </manifest>', image + image.replace('id="cover"', 'id="c2"').replace('cover.jpg', 'c2.jpg') + '  </manifest>']]);
    assert.deepEqual(problemCodes(two, { assets: ['OEBPS/images/cover.jpg', 'OEBPS/images/c2.jpg'] }), ['error cover-multiple']);
    const remote = withOpf([['  </manifest>', '  <item id="font" href="https://example.invalid/f.woff2" media-type="font/woff2"/>\n  </manifest>']]);
    const rr = Book.read(remote);
    assert.deepEqual(rr.problems, []);
    assert.equal(rr.model.manifest.byId.font.remote, true);
    const chain = withOpf([
        ['  </manifest>', '  <item id="pdf" href="a.pdf" media-type="application/pdf" fallback="chapter-1"/>\n  </manifest>'],
        ['<itemref idref="chapter-1"/>', '<itemref idref="pdf"/>']
    ], { 'OEBPS/a.pdf': '' });
    assert.deepEqual(problemCodes(chain), [], 'a foreign spine item with a content fallback is allowed');
    const loop = withOpf([
        ['  </manifest>', '  <item id="p1" href="a.pdf" media-type="application/pdf" fallback="p2"/>\n    <item id="p2" href="b.pdf" media-type="application/pdf" fallback="p1"/>\n  </manifest>'],
        ['<itemref idref="chapter-1"/>', '<itemref idref="p1"/>']
    ], { 'OEBPS/a.pdf': '', 'OEBPS/b.pdf': '' });
    assert.deepEqual(problemCodes(loop), ['error spine-not-content'], 'a fallback loop ends');
});

test('book: EPUB 2 leftovers are read and noted, never errors (EPUB 3.3 §5.9)', () => {
    const files = withOpf([
        ['</metadata>', '  <meta name="cover" content="img"/>\n  </metadata>'],
        ['  </manifest>', '  <item id="img" href="images/c.png" media-type="image/png"/>\n    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>\n  </manifest>'],
        ['<spine>', '<spine toc="ncx">'],
        ['</package>', '  <guide>\n    <reference type="cover" title="Cover" href="text/chapter-1.xhtml"/>\n  </guide>\n</package>']
    ], { 'OEBPS/toc.ncx': '<ncx/>' });
    const r = Book.read(files, { assets: ['OEBPS/images/c.png'] });
    assert.deepEqual(r.problems.map((p) => p.severity + ' ' + p.code), ['info legacy-cover', 'info legacy-ncx', 'info legacy-guide']);
    assert.equal(r.model.cover.id, 'img');
    assert.equal(r.model.coverSource, 'legacy-meta');
    assert.equal(r.model.legacy.ncx.path, 'OEBPS/toc.ncx');
    assert.deepEqual(r.model.legacy.guide.map((g) => g.type), ['cover']);
    assert.equal(r.model.metadata.metas.length, 1, 'an OPF 2 meta is not an EPUB 3 meta');
});

test('book: model entries carry their XmlAst nodes, so an edit can splice exactly them (D-002)', () => {
    const files = freshBook();
    const m = Book.read(files).model;
    const title = m.metadata.titles[0];
    const out = XmlAst.applyEdits(m.ast.text, XmlAst.setText(m.ast, title.node, 'A New Title'));
    assert.equal(out, files[OPF].replace('>Untitled Book<', '>A New Title<'));
    const again = Book.read(Object.assign({}, files, { [OPF]: out }));
    assert.equal(again.model.metadata.title, 'A New Title');
    assert.equal(Object.keys(m).indexOf('ast'), -1, 'the parse is not an enumerable field');
});

test('book: resolveHref follows EPUB container paths', () => {
    const r = (base, href) => Book.resolveHref(base, href);
    assert.deepEqual(r('OEBPS/content.opf', 'text/ch%201.xhtml#p2'), { path: 'OEBPS/text/ch 1.xhtml', fragment: 'p2' });
    assert.deepEqual(r('OEBPS/text/a.xhtml', '../css/b.css?x=1'), { path: 'OEBPS/css/b.css', fragment: null });
    assert.deepEqual(r('OEBPS/content.opf', '#title'), { path: 'OEBPS/content.opf', fragment: 'title' });
    assert.equal(r('OEBPS/content.opf', '../../x').outside, true);
    assert.equal(r('OEBPS/content.opf', 'a%E0%A4%A.xhtml').invalid, true);
    assert.equal(r('OEBPS/content.opf', 'https://example.invalid/x').remote, true);
    assert.equal(r('OEBPS/content.opf', 'mailto:a@example.invalid').remote, true);
});

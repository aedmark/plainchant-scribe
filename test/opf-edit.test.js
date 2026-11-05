const oeFs = require('fs');
const oePath = require('path');

const OE_OPF = 'OEBPS/content.opf';
const oeFixture = (name) => oeFs.readFileSync(oePath.join(__dirname, 'fixtures', 'xml', name), 'utf8');
const oeTemplate = (opts) => BookTemplate.create(Object.assign({ uuid: '0f3c2a1e-6b7d-4e2a-9c1b-8a5d4f3e2b10', now: Date.UTC(2026, 10, 3) }, opts)).files;

// The hand-edited fixture OPF in a book whose files all exist.
function oeFixtureBook() {
    return {
        'mimetype': 'application/epub+zip',
        'META-INF/container.xml': oeFixture('container.xml'),
        'OEBPS/content.opf': oeFixture('content.opf'),
        'OEBPS/nav.xhtml': oeFixture('nav.xhtml'),
        'OEBPS/css/book.css': '',
        'OEBPS/text/chapter-1.xhtml': oeFixture('chapter.xhtml'),
        'OEBPS/text/chapter-2.xhtml': oeFixture('chapter.xhtml')
    };
}

// Runs one operation on a fresh read and returns the new files, the new read, and the edits.
function oeRun(files, op) {
    const model = Book.read(files).model;
    assert.ok(model, 'the book reads');
    const edits = op(model);
    const next = Object.assign({}, files);
    next[OE_OPF] = XmlAst.applyEdits(files[OE_OPF], edits);
    return { files: next, opf: next[OE_OPF], read: Book.read(next), edits: edits };
}
const oeErrors = (read) => read.problems.filter((p) => p.severity === 'error').map((p) => p.code);

// Asserts the op turns the OPF into exactly `before` with each [from, to] replaced once, and leaves it well-formed.
function oeExpect(files, op, pairs) {
    const r = oeRun(files, op);
    let want = files[OE_OPF];
    pairs.forEach(([from, to]) => {
        assert.ok(want.indexOf(from) !== -1, 'the OPF contains ' + JSON.stringify(from));
        want = want.replace(from, to);
    });
    assert.equal(r.opf, want);
    assert.ok(XmlAst.parse(r.opf).wellFormed, 'still well-formed');
    return r;
}
const oeThrows = (fn, code) => {
    try { fn(); } catch (e) { assert.equal(e.code, code, e.message); return; }
    assert.ok(false, 'expected an error with code ' + code);
};

test('opf-edit: metadata values, new DC elements beside their kind, and the named shortcuts (P1-04)', () => {
    const files = oeFixtureBook();
    oeExpect(files, (m) => OpfEdit.setTitle(m, 'Ink & <Ash>'), [['The Quiet Ledger &amp; Other Stories', 'Ink &amp; &lt;Ash&gt;']]);
    oeExpect(files, (m) => OpfEdit.setLanguage(m, 'fr'), [['<dc:language>en</dc:language>', '<dc:language>fr</dc:language>']]);
    // A second creator goes after the first creator's refinement, with the file's indentation.
    const r = oeExpect(files, (m) => OpfEdit.addDc(m, 'creator', 'B. Writer', { id: 'author-2' }), [
        ['    <meta refines="#author" property="file-as">Penrose, Ada</meta>\n', '    <meta refines="#author" property="file-as">Penrose, Ada</meta>\n    <dc:creator id="author-2">B. Writer</dc:creator>\n']
    ]);
    assert.deepEqual(r.read.model.metadata.creators.map((c) => c.value), ['Ada Penrose', 'B. Writer']);
    // A kind not yet present goes after the last DC element.
    oeExpect(files, (m) => OpfEdit.addDc(m, 'publisher', 'Small Press', { lang: 'en' }), [
        ['<dc:language>en</dc:language>\n', '<dc:language>en</dc:language>\n    <dc:publisher xml:lang="en">Small Press</dc:publisher>\n']
    ]);
    // A missing title is added, not set.
    const noTitle = oeRun(files, (m) => OpfEdit.removeMetadata(m, m.metadata.titles[0]));
    assert.deepEqual(oeErrors(noTitle.read), ['missing-title'], 'a rule gap is allowed and reported by Book.read');
    const back = oeRun(noTitle.files, (m) => OpfEdit.setTitle(m, 'Again'));
    assert.equal(back.read.model.metadata.title, 'Again');
    assert.deepEqual(oeErrors(back.read), []);
    oeThrows(() => OpfEdit.addDc(Book.read(files).model, 'author', 'X'), 'invalid-name');
    oeThrows(() => OpfEdit.addDc(Book.read(files).model, 'creator', 'X', { id: 'title' }), 'duplicate-id');
    oeThrows(() => OpfEdit.addDc(Book.read(files).model, 'creator', 'X', { id: 'a:b' }), 'invalid-id');
});

test('opf-edit: new elements use the prefixes in scope, or declare their own namespace', () => {
    const files = oeTemplate();
    files[OE_OPF] = files[OE_OPF].replace('<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">', '<metadata xmlns:d="http://purl.org/dc/elements/1.1/">').replace(/dc:/g, 'd:').replace(/<\/d:/g, '</d:');
    const r = oeRun(files, (m) => OpfEdit.addDc(m, 'subject', 'Fiction'));
    assert.ok(r.opf.indexOf('<d:subject>Fiction</d:subject>') !== -1, 'reuses the bound prefix');
    const bare = oeTemplate();
    bare[OE_OPF] = bare[OE_OPF].replace(' xmlns:dc="http://purl.org/dc/elements/1.1/"', '').replace('<dc:identifier id="pub-id">', '<dc:identifier xmlns:dc="http://purl.org/dc/elements/1.1/" id="pub-id">')
        .replace('<dc:title id="title">', '<dc:title xmlns:dc="http://purl.org/dc/elements/1.1/" id="title">').replace('<dc:language>', '<dc:language xmlns:dc="http://purl.org/dc/elements/1.1/">');
    const r2 = oeRun(bare, (m) => OpfEdit.addDc(m, 'subject', 'Fiction'));
    assert.ok(r2.opf.indexOf('<dc:subject xmlns:dc="http://purl.org/dc/elements/1.1/">Fiction</dc:subject>') !== -1, 'declares dc on the new element');
    assert.deepEqual(r2.read.model.metadata.dc.map((e) => e.name), ['identifier', 'title', 'language', 'subject']);
    const prefixed = { 'META-INF/container.xml': oeTemplate()['META-INF/container.xml'] };
    prefixed[OE_OPF] = oeTemplate()[OE_OPF].replace(/<(\/?)(package|metadata|meta|manifest|item|spine|itemref)\b/g, '<$1opf:$2').replace('<opf:package xmlns=', '<opf:package xmlns:opf=');
    Object.assign(prefixed, { 'OEBPS/nav.xhtml': '', 'OEBPS/css/book.css': '', 'OEBPS/text/chapter-1.xhtml': '' });
    const r3 = oeRun(prefixed, (m) => OpfEdit.setMeta(m, 'dcterms:source', 'x'));
    assert.ok(r3.opf.indexOf('<opf:meta property="dcterms:source">x</opf:meta>') !== -1, r3.opf);
});

test('opf-edit: metas, refinements, removal with refinements, and touchModified', () => {
    const files = oeFixtureBook();
    oeExpect(files, (m) => OpfEdit.touchModified(m, Date.UTC(2027, 0, 2, 3, 4, 5, 600)), [['2026-11-03T12:00:00Z', '2027-01-02T03:04:05Z']]);
    oeExpect(files, (m) => OpfEdit.setMeta(m, 'rendition:layout', 'reflowable'), [
        ['2026-11-03T12:00:00Z</meta>\n', '2026-11-03T12:00:00Z</meta>\n    <meta property="rendition:layout">reflowable</meta>\n']
    ]);
    // An existing refinement is set; a new one goes after the subject's block.
    oeExpect(files, (m) => OpfEdit.setRefinement(m, m.metadata.creators[0], 'file-as', 'P., Ada'), [['Penrose, Ada<', 'P., Ada<']]);
    oeExpect(files, (m) => OpfEdit.setRefinement(m, m.metadata.creators[0], 'role', 'aut', { scheme: 'marc:relators' }), [
        ['Penrose, Ada</meta>\n', 'Penrose, Ada</meta>\n    <meta refines="#author" property="role" scheme="marc:relators">aut</meta>\n']
    ]);
    // A subject with no id gets one that is not taken.
    const r = oeExpect(files, (m) => OpfEdit.setRefinement(m, m.metadata.languages[0], 'alternate-script', 'x'), [
        ['<dc:language>en</dc:language>\n', '<dc:language id="language">en</dc:language>\n    <meta refines="#language" property="alternate-script">x</meta>\n']
    ]);
    assert.equal(Book.refinement(r.read.model.metadata.languages[0], 'alternate-script'), 'x');
    const taken = oeTemplate();
    taken[OE_OPF] = taken[OE_OPF].replace('<dc:language>', '<dc:language>').replace('id="title"', 'id="language"');
    const r2 = oeRun(taken, (m) => OpfEdit.setRefinement(m, m.metadata.languages[0], 'alternate-script', 'x'));
    assert.ok(r2.opf.indexOf('<dc:language id="language-2">') !== -1);
    // Removing the creator takes its refinement too.
    oeExpect(files, (m) => OpfEdit.removeMetadata(m, m.metadata.creators[0]), [
        ['    <dc:creator id="author" opf:role="aut">Ada Penrose</dc:creator>\n', ''], ['    <meta refines="#author" property="file-as">Penrose, Ada</meta>\n', '']
    ]);
    const gone = oeRun(files, (m) => OpfEdit.removeMeta(m, 'dcterms:modified'));
    assert.deepEqual(oeErrors(gone.read), ['modified-missing']);
    assert.deepEqual(oeRun(files, (m) => OpfEdit.removeMeta(m, 'nothing:here')).edits, []);
    oeThrows(() => OpfEdit.setMeta(Book.read(files).model, 'two words', 'x'), 'invalid-name');
    oeThrows(() => OpfEdit.touchModified(Book.read(files).model, 'not a date'), 'invalid-date');
    oeThrows(() => OpfEdit.setValue(Book.read(files).model, Book.read(files).model.metadata.titles[0], 'x'), 'unknown-entry');
});

test('opf-edit: add, re-point, retype, and mark manifest items', () => {
    const files = oeFixtureBook();
    const r = oeExpect(files, (m) => OpfEdit.addItem(m, { id: 'cover', path: 'OEBPS/images/my cover.jpg', mediaType: 'image/jpeg', properties: ['cover-image'] }), [
        ['text/chapter-2.xhtml" media-type="application/xhtml+xml"/>\n', 'text/chapter-2.xhtml" media-type="application/xhtml+xml"/>\n    <item id="cover" href="images/my%20cover.jpg" media-type="image/jpeg" properties="cover-image"/>\n']
    ]);
    assert.deepEqual(oeErrors(r.read), ['item-file-missing'], 'a file not yet added is a rule gap');
    assert.equal(r.read.model.cover.path, 'OEBPS/images/my cover.jpg');
    const up = oeRun(files, (m) => OpfEdit.addItem(m, { id: 'font', path: 'fonts/a.otf', mediaType: 'font/otf' }));
    assert.ok(up.opf.indexOf('href="../fonts/a.otf"') !== -1, 'relative to the OPF folder');
    assert.equal(up.read.model.manifest.byId.font.path, 'fonts/a.otf');
    assert.equal(OpfEdit.hrefFor('content.opf', 'a/b#c.xhtml'), 'a/b%23c.xhtml');
    oeExpect(files, (m) => OpfEdit.setItemPath(m, 'ch2', 'OEBPS/text/two.xhtml'), [['href="text/chapter-2.xhtml"', 'href="text/two.xhtml"']]);
    oeExpect(files, (m) => OpfEdit.setItemMediaType(m, 'css', 'text/css; charset=utf-8'), [['media-type="text/css"', 'media-type="text/css; charset=utf-8"']]);
    oeExpect(files, (m) => OpfEdit.setItemProperties(m, 'ch1', 'scripted svg'), [['href="text/chapter-1.xhtml" media-type="application/xhtml+xml"', 'href="text/chapter-1.xhtml" media-type="application/xhtml+xml" properties="scripted svg"']]);
    oeExpect(files, (m) => OpfEdit.setItemProperties(m, 'nav', []), [[' properties="nav"', '']]);
    const model = Book.read(files).model;
    const add = (it) => () => OpfEdit.addItem(model, Object.assign({ id: 'x', path: 'OEBPS/x.png', mediaType: 'image/png' }, it));
    [[{ id: 'ch1' }, 'duplicate-id'], [{ id: '1x' }, 'invalid-id'], [{ path: 'OEBPS/text/chapter-1.xhtml' }, 'duplicate-href'], [{ path: '../x.png' }, 'invalid-path'],
        [{ path: '/x.png' }, 'invalid-path'], [{ path: 'OEBPS/content.opf' }, 'reserved-path'], [{ path: 'META-INF/x.xml' }, 'reserved-path'], [{ path: 'mimetype' }, 'reserved-path'],
        [{ mediaType: 'png' }, 'invalid-media-type'], [{ fallback: 'nope' }, 'unknown-idref']].forEach(([it, code]) => oeThrows(add(it), code));
    oeThrows(() => OpfEdit.setItemPath(model, 'ch1', 'OEBPS/text/chapter-2.xhtml'), 'duplicate-href');
    assert.ok(OpfEdit.setItemPath(model, 'ch1', 'OEBPS/text/chapter-1.xhtml').length === 1, 'an item may keep its own path');
    oeThrows(() => OpfEdit.setItemProperties(model, 'nope', ''), 'unknown-item');
});

test('opf-edit: removing an item takes its itemrefs, refinements, NCX toc, and EPUB 2 cover meta; the nav and used fallbacks are refused', () => {
    const files = oeFixtureBook();
    oeExpect(files, (m) => OpfEdit.removeItem(m, 'ch2'), [
        ['    <item id="ch2" href="text/chapter-2.xhtml" media-type="application/xhtml+xml"/>\n', ''], ['    <itemref idref="ch2"/>\n', '']
    ]);
    const legacy = oeTemplate();
    legacy[OE_OPF] = legacy[OE_OPF]
        .replace('  </metadata>', '    <meta name="cover" content="img"/>\n    <meta refines="#img" property="alt-script">x</meta>\n  </metadata>')
        .replace('  </manifest>', '    <item id="img" href="c.jpg" media-type="image/jpeg"/>\n    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>\n  </manifest>')
        .replace('<spine>', '<spine toc="ncx">');
    Object.assign(legacy, { 'OEBPS/c.jpg': '', 'OEBPS/toc.ncx': '' });
    const r = oeRun(legacy, (m) => OpfEdit.removeItem(m, 'img'));
    assert.ok(r.opf.indexOf('img') === -1, 'cover meta and refinement gone');
    assert.deepEqual(oeErrors(r.read), []);
    const r2 = oeRun(legacy, (m) => OpfEdit.removeItem(m, 'ncx'));
    assert.ok(r2.opf.indexOf('<spine>') !== -1 && r2.opf.indexOf('ncx') === -1, 'toc attribute removed');
    const model = Book.read(files).model;
    oeThrows(() => OpfEdit.removeItem(model, 'nav'), 'item-is-nav');
    oeThrows(() => OpfEdit.removeItem(model, 'nope'), 'unknown-item');
    const fb = oeTemplate();
    fb[OE_OPF] = fb[OE_OPF].replace('  </manifest>', '    <item id="pic" href="p.svg" media-type="image/svg+xml"/>\n    <item id="raw" href="p.xml" media-type="application/xml" fallback="pic"/>\n  </manifest>');
    try { OpfEdit.removeItem(Book.read(fb).model, 'pic'); assert.ok(false, 'expected item-in-use'); } catch (e) { assert.equal(e.code, 'item-in-use'); assert.deepEqual(e.users, ['raw']); }
});

test('opf-edit: renaming an item updates every reference to its id in the package document', () => {
    const files = oeTemplate();
    files[OE_OPF] = files[OE_OPF]
        .replace('  </metadata>', '    <meta name="cover" content="chapter-1"/>\n    <meta refines="#chapter-1" property="media:duration">0:01:00</meta>\n  </metadata>')
        .replace('  </manifest>', '    <item id="alt" href="alt.xml" media-type="application/xml" fallback="chapter-1"/>\n  </manifest>')
        .replace('<spine>', '<spine toc="chapter-1">');
    files['OEBPS/alt.xml'] = '';
    const r = oeRun(files, (m) => OpfEdit.renameItem(m, 'chapter-1', 'opening'));
    assert.equal(r.opf.indexOf('chapter-1"'), -1, r.opf);
    assert.equal(r.opf.indexOf('#chapter-1'), -1);
    assert.equal(r.opf, files[OE_OPF].replace(/"chapter-1"/g, '"opening"').replace('"#chapter-1"', '"#opening"'), 'only the id references changed; the href keeps its name');
    const m = r.read.model;
    assert.equal(m.spine.itemrefs[0].item.id, 'opening');
    assert.equal(m.manifest.byId.alt.fallback, 'opening');
    assert.equal(Book.refinement(m.manifest.byId.opening, 'media:duration'), '0:01:00');
    const model = Book.read(files).model;
    assert.deepEqual(OpfEdit.renameItem(model, 'css', 'css'), []);
    oeThrows(() => OpfEdit.renameItem(model, 'css', 'nav'), 'duplicate-id');
    oeThrows(() => OpfEdit.renameItem(model, 'css', 'pub-id'), 'duplicate-id');
    oeThrows(() => OpfEdit.renameItem(model, 'css', 'has space'), 'invalid-id');
});

test('opf-edit: spine itemrefs are added, removed, made non-linear, and reordered with their comments', () => {
    const files = oeFixtureBook();
    files[OE_OPF] = files[OE_OPF].replace('    <itemref idref="ch2"/>', '    <!-- part two -->\n    <itemref idref="ch2" linear="yes"/>');
    files[OE_OPF] = files[OE_OPF].replace('  </manifest>', '    <item id="ch3" href="text/chapter-3.xhtml" media-type="application/xhtml+xml"/>\n  </manifest>');
    files['OEBPS/text/chapter-3.xhtml'] = '';
    oeExpect(files, (m) => OpfEdit.addItemref(m, 'ch3'), [['linear="yes"/>\n', 'linear="yes"/>\n    <itemref idref="ch3"/>\n']]);
    oeExpect(files, (m) => OpfEdit.addItemref(m, 'ch3', { index: 0, linear: false }), [['    <itemref idref="ch1"/>', '    <itemref idref="ch3" linear="no"/>\n    <itemref idref="ch1"/>']]);
    oeExpect(files, (m) => OpfEdit.removeItemref(m, 'ch1'), [['    <itemref idref="ch1"/>\n', '']]);
    oeExpect(files, (m) => OpfEdit.setItemrefLinear(m, 'ch1', false), [['<itemref idref="ch1"/>', '<itemref idref="ch1" linear="no"/>']]);
    assert.deepEqual(oeRun(files, (m) => OpfEdit.setItemrefLinear(m, 'ch1', true)).edits, []);
    // The comment travels with ch2; the spine's own spacing stays.
    const moved = oeExpect(files, (m) => OpfEdit.moveItemref(m, 'ch2', 0), [
        ['<spine>\n    <itemref idref="ch1"/>\n    <!-- part two -->\n    <itemref idref="ch2" linear="yes"/>\n  </spine>', '<spine>\n    <!-- part two -->\n    <itemref idref="ch2" linear="yes"/>\n    <itemref idref="ch1"/>\n  </spine>']
    ]);
    assert.deepEqual(moved.read.model.spine.itemrefs.map((r) => r.idref), ['ch2', 'ch1']);
    assert.equal(oeRun(moved.files, (m) => OpfEdit.setSpineOrder(m, ['ch1', 'ch2'])).opf, files[OE_OPF], 'moving back restores the file exactly');
    assert.deepEqual(oeRun(files, (m) => OpfEdit.setSpineOrder(m, ['ch1', 'ch2'])).edits, []);
    const model = Book.read(files).model;
    oeThrows(() => OpfEdit.addItemref(model, 'ch1'), 'itemref-repeated');
    oeThrows(() => OpfEdit.addItemref(model, 'nope'), 'unknown-idref');
    oeThrows(() => OpfEdit.addItemref(model, 'ch3', { index: 5 }), 'invalid-index');
    oeThrows(() => OpfEdit.removeItemref(model, 'ch3'), 'not-in-spine');
    oeThrows(() => OpfEdit.moveItemref(model, 'ch1', 2), 'invalid-index');
    oeThrows(() => OpfEdit.setSpineOrder(model, ['ch1']), 'spine-order-mismatch');
    oeThrows(() => OpfEdit.setSpineOrder(model, ['ch1', 'ch3']), 'spine-order-mismatch');
    // An empty, self-closing spine takes its first itemref on its own line.
    const empty = oeTemplate();
    empty[OE_OPF] = empty[OE_OPF].replace(/<spine>[\s\S]*<\/spine>/, '<spine/>');
    const r = oeRun(empty, (m) => OpfEdit.addItemref(m, 'chapter-1'));
    assert.ok(r.opf.indexOf('  <spine>\n    <itemref idref="chapter-1"/>\n  </spine>') !== -1, r.opf);
    assert.deepEqual(oeErrors(r.read), []);
});

test('opf-edit: CRLF files keep their line ends, and a sequence of edits leaves the template clean', () => {
    const crlf = oeTemplate();
    crlf[OE_OPF] = crlf[OE_OPF].replace(/\n/g, '\r\n');
    const r = oeRun(crlf, (m) => OpfEdit.addDc(m, 'subject', 'Fiction'));
    assert.ok(r.opf.indexOf('</dc:language>\r\n    <dc:subject>Fiction</dc:subject>\r\n') !== -1);
    assert.ok(!/[^\r]\n/.test(r.opf), 'no bare LF');
    let files = oeTemplate();
    files['OEBPS/text/chapter-2.xhtml'] = files['OEBPS/text/chapter-1.xhtml'];
    [
        (m) => OpfEdit.addItem(m, { id: 'chapter-2', path: 'OEBPS/text/chapter-2.xhtml', mediaType: 'application/xhtml+xml' }),
        (m) => OpfEdit.addItemref(m, 'chapter-2', { index: 0 }),
        (m) => OpfEdit.moveItemref(m, 'chapter-1', 0),
        (m) => OpfEdit.addDc(m, 'creator', 'Ada Penrose', { id: 'creator' }),
        (m) => OpfEdit.setRefinement(m, m.metadata.creators[0], 'file-as', 'Penrose, Ada'),
        (m) => OpfEdit.renameItem(m, 'chapter-2', 'ch-2'),
        (m) => OpfEdit.touchModified(m, Date.UTC(2026, 11, 1))
    ].forEach((op) => {
        const step = oeRun(files, op);
        assert.deepEqual(step.read.problems, []);
        files = step.files;
    });
    const m = Book.read(files).model;
    assert.deepEqual(m.spine.itemrefs.map((x) => x.idref), ['chapter-1', 'ch-2']);
    assert.equal(m.metadata.modified, '2026-12-01T00:00:00Z');
});

test('opf-edit: EPUB 2 name/content metas are set and removed, and metadata entries move as written (P3-06)', () => {
    const files = oeFixtureBook();
    let r = oeRun(files, (m) => OpfEdit.setLegacyMeta(m, 'calibre:series', 'Ledger & Co'));
    assert.ok(r.opf.indexOf('<meta name="calibre:series" content="Ledger &amp; Co"/>') !== -1);
    r = oeRun(r.files, (m) => OpfEdit.setLegacyMeta(m, 'calibre:series', 'Ledger'));
    assert.equal((r.opf.match(/calibre:series/g) || []).length, 1);
    r = oeRun(r.files, (m) => OpfEdit.removeLegacyMeta(m, 'calibre:series'));
    assert.equal(r.opf, files['OEBPS/content.opf']);
    // The creator moves after the language; its file-as refinement stays put and still refines it.
    const moved = oeRun(files, (m) => OpfEdit.moveMetadata(m, m.metadata.creators[0], m.metadata.languages[0], 1));
    assert.ok(moved.opf.indexOf('<dc:language>en</dc:language>\n    <dc:creator id="author" opf:role="aut">Ada Penrose</dc:creator>') !== -1, moved.opf);
    assert.equal(Book.refinement(moved.read.model.metadata.creators[0], 'file-as'), 'Penrose, Ada');
    const ins = oeRun(files, (m) => OpfEdit.insertMeta(m, 'belongs-to-collection', 'A', { id: 'c1' }));
    const again = oeRun(ins.files, (m) => OpfEdit.insertMeta(m, 'belongs-to-collection', 'B', { id: 'c2' }));
    assert.equal((again.opf.match(/belongs-to-collection/g) || []).length, 2, 'insertMeta adds even when the property exists');
});

test('opf-edit: an entry moved down lands after the other entry\'s refinements, not between them', () => {
    const files = oeFixtureBook();
    const two = oeRun(files, (m) => OpfEdit.addDc(m, 'creator', 'B. Writer', { id: 'b' }));
    const refined = oeRun(two.files, (m) => OpfEdit.setRefinement(m, m.metadata.creators[1], 'role', 'edt'));
    const r = oeRun(refined.files, (m) => OpfEdit.moveMetadata(m, m.metadata.creators[0], m.metadata.creators[1], 1));
    assert.ok(r.opf.indexOf('<dc:creator id="b">B. Writer</dc:creator>\n    <meta refines="#b" property="role">edt</meta>\n    <dc:creator id="author" opf:role="aut">Ada Penrose</dc:creator>') !== -1, r.opf);
    assert.deepEqual(r.read.model.metadata.creators.map((c) => c.value), ['B. Writer', 'Ada Penrose']);
});

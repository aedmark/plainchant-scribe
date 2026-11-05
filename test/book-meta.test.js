const BMO = 'OEBPS/content.opf';
const bmBook = () => ExampleBook.create({ uuid: '0f3c2a1e-6b7d-4e2a-9c1b-8a5d4f3e2b10', now: Date.UTC(2026, 10, 4) }).files;

// Applies BookMeta ops to fresh reads, as the Book panel does, and returns the files and the new read.
function bmRun(files, ops) {
    let f = files;
    ops.forEach((op) => { f = Object.assign({}, f, { [BMO]: XmlAst.applyEdits(f[BMO], op(Book.read(f).model)) }); });
    return { files: f, opf: f[BMO], read: Book.read(f) };
}

test('book-meta: the panel\'s fields come from the package document (P3-01)', () => {
    const f = BookMeta.fields(Book.read(bmBook()).model);
    assert.deepEqual(f, {
        title: 'A Short Guide to Plainchant Scribe', language: 'en', publisher: '', date: '', description: '', rights: '',
        identifier: 'urn:uuid:0f3c2a1e-6b7d-4e2a-9c1b-8a5d4f3e2b10', isbn: '', modified: '2026-11-04T00:00:00Z',
        creators: [{ index: 0, name: 'Plainchant Scribe', role: '', fileAs: '' }], contributors: [], series: '', seriesPosition: ''
    });
    const fixture = { 'META-INF/container.xml': BookTemplate.create()['files']['META-INF/container.xml'], [BMO]: require('fs').readFileSync(require('path').join(__dirname, 'fixtures', 'xml', 'content.opf'), 'utf8') };
    assert.deepEqual(BookMeta.fields(Book.read(fixture).model).creators, [{ index: 0, name: 'Ada Penrose', role: '', fileAs: 'Penrose, Ada' }], 'refinements are read');
});

test('book-meta: values are checked: title, language, date, ISBN, creator name, role', () => {
    const ok = (name, v) => assert.equal(BookMeta.check(name, v), '', name + ' ' + v);
    const bad = (name, v) => assert.ok(BookMeta.check(name, v), name + ' ' + v + ' should be refused');
    bad('title', '  '); ok('title', 'X');
    ok('language', 'pt-BR'); bad('language', 'en_US'); bad('language', '');
    ['', '2026', '2026-11', '2026-11-04', '2026-11-04T09:30Z', '2026-11-04T09:30:15+01:00'].forEach((d) => ok('date', d));
    ['04/11/2026', '2026-13', '2026-11-32', '2026-11-04T25:00Z', '2026-11-04T09:30'].forEach((d) => bad('date', d));
    ['', '978-0-306-40615-7', '9780306406157', '0-306-40615-2', '0 8044 2957 X'].forEach((i) => ok('isbn', i));
    ['978-0-306-40615-8', '0-306-40615-3', '12345', 'ISBN 978'].forEach((i) => bad('isbn', i));
    assert.equal(BookMeta.normaliseIsbn('0 8044 2957 x'), '080442957X');
    bad('creator', ''); ok('role', 'aut'); ok('role', ''); bad('role', 'Author');
});

test('book-meta: single fields are set in place, added when missing, and removed when emptied', () => {
    let r = bmRun(bmBook(), BookMeta.setField('title', 'Ink & Ash'));
    assert.ok(r.opf.indexOf('<dc:title id="title">Ink &amp; Ash</dc:title>') !== -1);
    r = bmRun(r.files, BookMeta.setField('publisher', 'Small Press').concat(BookMeta.setField('date', '2026-11'), BookMeta.setField('description', 'A <b> & c')));
    assert.ok(/<dc:publisher>Small Press<\/dc:publisher>/.test(r.opf) && /<dc:date>2026-11<\/dc:date>/.test(r.opf) && r.opf.indexOf('A &lt;b&gt; &amp; c') !== -1);
    assert.deepEqual(r.read.problems, []);
    const before = r.opf;
    r = bmRun(r.files, BookMeta.setField('publisher', '  '));
    assert.equal(r.opf.indexOf('dc:publisher'), -1, 'emptied, the element goes');
    assert.equal(r.opf, before.replace('    <dc:publisher>Small Press</dc:publisher>\n', ''), 'and nothing else changes');
    r = bmRun(r.files, BookMeta.setField('rights', ''));
    assert.equal(r.opf, before.replace('    <dc:publisher>Small Press</dc:publisher>\n', ''), 'emptying a missing field changes nothing');
});

test('book-meta: the ISBN is an extra identifier; the unique identifier is never touched', () => {
    let r = bmRun(bmBook(), BookMeta.setIsbn('978-0-306-40615-7'));
    assert.ok(r.opf.indexOf('<dc:identifier id="isbn">urn:isbn:9780306406157</dc:identifier>') !== -1);
    assert.equal(BookMeta.fields(r.read.model).isbn, '9780306406157');
    assert.equal(r.read.model.metadata.uniqueIdentifier.value, 'urn:uuid:0f3c2a1e-6b7d-4e2a-9c1b-8a5d4f3e2b10');
    r = bmRun(r.files, BookMeta.setIsbn('0-306-40615-2'));
    assert.ok(r.opf.indexOf('urn:isbn:0306406152') !== -1 && r.opf.indexOf('9780306406157') === -1);
    r = bmRun(r.files, BookMeta.setIsbn(''));
    assert.equal(r.opf.indexOf('isbn'), -1);
    assert.deepEqual(r.read.problems, []);
});

test('book-meta: creators are added with role and sort name, edited, and removed with their refinements', () => {
    let r = bmRun(bmBook(), BookMeta.addCreator('Ada Penrose', 'edt', 'Penrose, Ada'));
    assert.ok(r.opf.indexOf('    <dc:creator id="creator-2">Ada Penrose</dc:creator>\n    <meta refines="#creator-2" property="role" scheme="marc:relators">edt</meta>\n    <meta refines="#creator-2" property="file-as">Penrose, Ada</meta>\n') !== -1, r.opf);
    assert.deepEqual(BookMeta.fields(r.read.model).creators.map((c) => [c.name, c.role, c.fileAs]), [['Plainchant Scribe', '', ''], ['Ada Penrose', 'edt', 'Penrose, Ada']]);
    r = bmRun(r.files, BookMeta.setCreator(0, 'role', 'aut').concat(BookMeta.setCreator(1, 'name', 'Ada P. Penrose'), BookMeta.setCreator(1, 'fileAs', '')));
    assert.deepEqual(BookMeta.fields(r.read.model).creators.map((c) => [c.name, c.role, c.fileAs]), [['Plainchant Scribe', 'aut', ''], ['Ada P. Penrose', 'edt', '']]);
    r = bmRun(r.files, BookMeta.setCreator(0, 'role', ''));
    assert.equal(BookMeta.fields(r.read.model).creators[0].role, '');
    r = bmRun(r.files, BookMeta.removeCreator(1));
    assert.equal(r.opf.indexOf('creator-2'), -1, 'the creator and its refinements go');
    assert.deepEqual(r.read.problems, []);
    const plain = bmRun(bmBook(), BookMeta.addCreator('B. Writer', '', ''));
    assert.ok(plain.opf.indexOf('<dc:creator id="creator-2">B. Writer</dc:creator>\n') !== -1 && plain.opf.indexOf('refines="#creator-2"') === -1);
});

test('book-meta: Update now stamps dcterms:modified', () => {
    const r = bmRun(bmBook(), BookMeta.touchModified(Date.UTC(2027, 0, 2, 3, 4, 5)));
    assert.equal(r.read.model.metadata.modified, '2027-01-02T03:04:05Z');
});

test('book-meta: when the unique identifier is itself an ISBN, the ISBN field leaves it alone', () => {
    const files = bmBook();
    files[BMO] = files[BMO].replace(/<dc:identifier id="pub-id">[^<]*/, '<dc:identifier id="pub-id">urn:isbn:9780306406157');
    assert.equal(BookMeta.fields(Book.read(files).model).isbn, '', 'the unique identifier is shown as the identifier, not the ISBN');
    const r = bmRun(files, BookMeta.setIsbn('0-306-40615-2'));
    assert.equal(r.read.model.metadata.uniqueIdentifier.value, 'urn:isbn:9780306406157');
    assert.ok(r.opf.indexOf('<dc:identifier id="isbn">urn:isbn:0306406152</dc:identifier>') !== -1);
});

test('book-meta: the series is a belongs-to-collection with type and number, kept in step with Calibre\'s tags (P3-06)', () => {
    let r = bmRun(bmBook(), BookMeta.setSeries('The Ledger Trilogy', '2'));
    assert.ok(r.opf.indexOf('    <meta property="belongs-to-collection" id="series">The Ledger Trilogy</meta>\n    <meta refines="#series" property="collection-type">series</meta>\n    <meta refines="#series" property="group-position">2</meta>\n    <meta name="calibre:series" content="The Ledger Trilogy"/>\n    <meta name="calibre:series_index" content="2"/>\n') !== -1, r.opf);
    assert.deepEqual([BookMeta.fields(r.read.model).series, BookMeta.fields(r.read.model).seriesPosition], ['The Ledger Trilogy', '2']);
    assert.deepEqual(r.read.problems, []);
    r = bmRun(r.files, BookMeta.setSeries('The Ledger', '2.5'));
    assert.ok(/>The Ledger<\/meta>/.test(r.opf) && /group-position">2\.5</.test(r.opf) && /calibre:series" content="The Ledger"/.test(r.opf) && /series_index" content="2\.5"/.test(r.opf));
    assert.equal((r.opf.match(/belongs-to-collection/g) || []).length, 1, 'updated in place');
    r = bmRun(r.files, BookMeta.setSeries('The Ledger', ''));
    assert.ok(r.opf.indexOf('group-position') === -1 && r.opf.indexOf('series_index') === -1 && /calibre:series"/.test(r.opf));
    r = bmRun(r.files, BookMeta.setSeries('', ''));
    assert.equal(/belongs-to-collection|calibre|collection-type/.test(r.opf), false);
    assert.deepEqual(r.read.problems, []);
    assert.ok(BookMeta.check('seriesPosition', 'two') && !BookMeta.check('seriesPosition', '3'));
});

test('book-meta: a collection typed "set" is left alone; the series is the one typed "series"', () => {
    const files = bmBook();
    files[BMO] = files[BMO].replace('  </metadata>', '    <meta property="belongs-to-collection" id="set1">Boxed Set</meta>\n    <meta refines="#set1" property="collection-type">set</meta>\n  </metadata>');
    assert.equal(BookMeta.fields(Book.read(files).model).series, '', 'a set is not the series');
    const r = bmRun(files, BookMeta.setSeries('Trilogy', '1'));
    assert.ok(r.opf.indexOf('Boxed Set') !== -1 && r.opf.indexOf('>Trilogy</meta>') !== -1);
    assert.equal(BookMeta.fields(r.read.model).series, 'Trilogy');
    const cleared = bmRun(r.files, BookMeta.setSeries('', ''));
    assert.ok(cleared.opf.indexOf('Boxed Set') !== -1 && cleared.opf.indexOf('Trilogy') === -1);
});

test('book-meta: contributors work like creators, and people move up and down within their kind', () => {
    let r = bmRun(bmBook(), BookMeta.addPerson('contributor', 'Tom Translator', 'trl', 'Translator, Tom').concat(BookMeta.addPerson('contributor', 'Eve Editor', 'edt', '')));
    assert.ok(r.opf.indexOf('<dc:contributor id="contributor">Tom Translator</dc:contributor>\n    <meta refines="#contributor" property="role" scheme="marc:relators">trl</meta>') !== -1, r.opf);
    assert.deepEqual(BookMeta.fields(r.read.model).contributors.map((c) => [c.name, c.role, c.fileAs]), [['Tom Translator', 'trl', 'Translator, Tom'], ['Eve Editor', 'edt', '']]);
    r = bmRun(r.files, BookMeta.movePerson('contributor', 1, -1));
    assert.deepEqual(BookMeta.fields(r.read.model).contributors.map((c) => [c.name, c.role]), [['Eve Editor', 'edt'], ['Tom Translator', 'trl']], 'refinements follow by id');
    r = bmRun(r.files, BookMeta.setPerson('contributor', 1, 'fileAs', ''));
    assert.equal(BookMeta.fields(r.read.model).contributors[1].fileAs, '');
    r = bmRun(r.files, BookMeta.removePerson('contributor', 0));
    assert.deepEqual(BookMeta.fields(r.read.model).contributors.map((c) => c.name), ['Tom Translator']);
    r = bmRun(r.files, BookMeta.addCreator('B. Writer', 'aut', '').concat(BookMeta.movePerson('creator', 1, -1)));
    assert.deepEqual(BookMeta.fields(r.read.model).creators.map((c) => c.name), ['B. Writer', 'Plainchant Scribe'], 'the new first creator is the one readers show');
    r = bmRun(r.files, BookMeta.movePerson('creator', 0, 1));
    assert.deepEqual(BookMeta.fields(r.read.model).creators.map((c) => c.name), ['Plainchant Scribe', 'B. Writer']);
    assert.deepEqual(bmRun(r.files, BookMeta.movePerson('creator', 1, 1)).opf, r.opf, 'moving past the end changes nothing');
    assert.deepEqual(r.read.problems, []);
});

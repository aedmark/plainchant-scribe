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
        creators: [{ index: 0, name: 'Plainchant Scribe', role: '', fileAs: '' }]
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

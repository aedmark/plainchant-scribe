/* The round-trip tool and its corpus manifest (P5-06, D-042); the books themselves run with npm run roundtrip. */
const RoundTrip = require('../tools/roundtrip.js');
const rtCorpus = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, 'corpus.json'), 'utf8'));

const { epZip: rtZip } = require('./epub.test.js');
const rtBook = () => BookTemplate.create({ title: 'Trip', uuid: '6c1f9f3e-2d4b-4b8e-9a51-3e0b7c2d1a90', now: Date.UTC(2026, 0, 1) }).files;

async function rtPacked(change) {
    const files = rtBook();
    if (change) change(files);
    return (await BookExport.pack(files, {}, { when: new Date(Date.UTC(2026, 0, 1)) })).bytes;
}

test('roundtrip: a book exported again compares equal, except for dcterms:modified only', async () => {
    const before = await rtPacked();
    const opf = 'OEBPS/content.opf';
    const same = RoundTrip.compareArchives(before, await rtPacked(), opf);
    assert.deepEqual([same.changed, same.missing, same.added, same.mimetypeFirst], [[], [], [], true]);
    const dated = RoundTrip.compareArchives(before, await rtPacked((f) => { f[opf] = f[opf].replace(/(dcterms:modified">)[^<]+/, '$12030-01-01T00:00:00Z'); }), opf);
    assert.deepEqual(dated.changed, [], 'a new dcterms:modified is the one allowed change');
    const edited = RoundTrip.compareArchives(before, await rtPacked((f) => { f[opf] = f[opf].replace('<dc:title', '<!-- x --><dc:title'); f['OEBPS/css/book.css'] += ' '; }), opf);
    assert.deepEqual(edited.changed.sort(), ['OEBPS/content.opf', 'OEBPS/css/book.css']);
    const fewer = RoundTrip.compareArchives(before, await rtPacked((f) => { delete f['OEBPS/css/book.css']; f[opf] = f[opf].replace(/<item[^>]*book\.css[^>]*\/>/, ''); }), opf);
    assert.deepEqual([fewer.missing, fewer.changed], [['OEBPS/css/book.css'], ['OEBPS/content.opf']]);
});

test('roundtrip: folder entries are not counted as files left out', async () => {
    const files = rtBook();
    const withFolders = rtZip([{ name: 'mimetype', data: files.mimetype }, { name: 'OEBPS/', data: '' }].concat(Object.keys(files).filter((p) => p !== 'mimetype').map((p) => ({ name: p, data: files[p], deflate: true }))));
    const c = RoundTrip.compareArchives(withFolders, await rtPacked(), 'OEBPS/content.opf');
    assert.deepEqual([c.missing, c.folders, c.changed], [[], 1, []]);
    const late = rtZip([{ name: 'META-INF/container.xml', data: files['META-INF/container.xml'] }, { name: 'mimetype', data: files.mimetype }]);
    assert.equal(RoundTrip.compareArchives(late, late, 'OEBPS/content.opf').mimetypeFirst, false, 'mimetype must be the first entry');
    const squeezed = rtZip([{ name: 'mimetype', data: files.mimetype, deflate: true }]);
    assert.equal(RoundTrip.compareArchives(squeezed, squeezed, 'OEBPS/content.opf').mimetypeFirst, false, 'and stored');
});

test('roundtrip: the corpus manifest names each book once, with its source and checksum', () => {
    assert.ok(rtCorpus.books.length >= 7);
    assert.equal(new Set(rtCorpus.books.map((b) => b.file)).size, rtCorpus.books.length);
    rtCorpus.books.forEach((b) => {
        assert.ok(/^[\w.-]+\.epub$/.test(b.file), b.file);
        assert.ok(/^[0-9a-f]{64}$/.test(b.sha256), b.file);
        assert.ok(/^https:\/\/(www\.gutenberg\.org|standardebooks\.org)\//.test(b.url), b.file);
        assert.ok(b.bytes > 0 && b.title && b.producer, b.file);
    });
});

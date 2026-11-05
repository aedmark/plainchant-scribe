const bxZlib = require('zlib');
const bxBook = () => ExampleBook.create({ uuid: '0f3c2a1e-6b7d-4e2a-9c1b-8a5d4f3e2b10', now: Date.UTC(2026, 10, 4) }).files;
const bxPng = () => Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));
const bxText = (e) => e.method === 8 ? bxZlib.inflateRawSync(e.data).toString('utf8') : Buffer.from(e.data).toString('utf8');

test('book-export: mimetype comes first, stored, exact, and with no extra field (P5-01)', async () => {
    const files = bxBook();
    files.mimetype = 'application/epub+zip\n';
    const r = await BookExport.pack(files, {}, { when: new Date(2026, 10, 4) });
    const b = r.bytes, view = new DataView(b.buffer, b.byteOffset, b.byteLength);
    // OCF 3.3 4.2: the local header at offset 0 names "mimetype", method 0, no extra field, then the bytes themselves.
    assert.equal(view.getUint32(0, true), 0x04034B50);
    assert.deepEqual([view.getUint16(8, true), view.getUint16(26, true), view.getUint16(28, true)], [0, 8, 0]);
    assert.equal(Buffer.from(b.subarray(30, 38)).toString(), 'mimetype');
    assert.equal(Buffer.from(b.subarray(38, 58)).toString(), 'application/epub+zip', 'the content is exact, whatever the working copy holds');
    assert.equal(Zip.list(b)[0].size, 20);
});

test('book-export: text is deflated, binaries are stored, and every entry reads back', async () => {
    const files = bxBook();
    const cover = BookCover.set(files, 'OEBPS/images/cover.png', ['OEBPS/images/cover.png']).entries;
    const r = await BookExport.pack(cover, { 'OEBPS/images/cover.png': bxPng() });
    const list = Zip.list(r.bytes);
    assert.deepEqual(list.slice(0, 3).map((e) => e.path), ['mimetype', 'META-INF/container.xml', 'OEBPS/content.opf']);
    const byPath = {};
    list.forEach((e) => { byPath[e.path] = e; });
    assert.equal(byPath['OEBPS/text/chapter-1.xhtml'].method, 8, 'chapters are deflated');
    assert.equal(byPath['OEBPS/images/cover.png'].method, 0, 'images are stored');
    Object.keys(cover).filter((p) => p !== 'mimetype').forEach((p) => assert.equal(bxText(byPath[p]), cover[p], p + ' survives'));
    list.forEach((e) => {
        const data = e.method === 8 ? new Uint8Array(bxZlib.inflateRawSync(e.data)) : e.data;
        assert.equal(Zip.crc32(data), e.crc, e.path + ' CRC is of the uncompressed bytes');
        assert.equal(data.length, e.size);
    });
    const ch = byPath['OEBPS/text/chapter-1.xhtml'], view = new DataView(r.bytes.buffer, r.bytes.byteOffset, r.bytes.byteLength);
    assert.ok(ch.data.length < ch.size, 'the compressed size is smaller than the text');
    assert.deepEqual([view.getUint32(ch.local + 18, true), view.getUint32(ch.local + 22, true)], [ch.data.length, ch.size], 'the local header agrees with the directory');
    const bigger = await BookExport.pack(files, {}, { deflate: async (b) => new Uint8Array(b.length + 10) });
    assert.ok(Zip.list(bigger.bytes).every((e) => e.method === 0), 'a file that does not shrink is stored');
    const stored = await BookExport.pack(files, {}, { deflate: null });
    assert.ok(Zip.list(stored.bytes).every((e) => e.method === 0), 'with no deflater everything is stored');
    assert.ok(stored.bytes.length > r.bytes.length - bxPng().length, 'deflating makes the book smaller');
});

test('book-export: only the manifest’s files go in; the rest and missing files are reported', async () => {
    const files = Object.assign(bxBook(), { 'notes/todo.txt': 'later', 'META-INF/com.apple.ibooks.display-options.xml': '<display_options/>' });
    const p = BookExport.plan(files, ['OEBPS/images/stray.png']);
    assert.deepEqual(p.order, ['mimetype', 'META-INF/container.xml', 'META-INF/com.apple.ibooks.display-options.xml', 'OEBPS/content.opf', 'OEBPS/nav.xhtml', 'OEBPS/css/book.css', 'OEBPS/text/chapter-1.xhtml', 'OEBPS/text/chapter-2.xhtml', 'OEBPS/text/chapter-3.xhtml']);
    assert.deepEqual(p.left, ['OEBPS/images/stray.png', 'notes/todo.txt']);
    assert.deepEqual(p.missing, []);
    const gone = bxBook();
    delete gone['OEBPS/text/chapter-3.xhtml'];
    const r = await BookExport.pack(gone, {});
    assert.deepEqual(r.missing, ['OEBPS/text/chapter-3.xhtml']);
    assert.ok(!Zip.list(r.bytes).some((e) => e.path === 'OEBPS/text/chapter-3.xhtml'));
    const broken = bxBook();
    broken['OEBPS/content.opf'] = '<package';
    assert.throws(() => BookExport.plan(broken), /cannot be exported/);
});

test('book-export: file names come from the title', () => {
    assert.equal(BookExport.fileName('Les Misérables: Tome I'), 'les-miserables-tome-i.epub');
    assert.equal(BookExport.fileName('  '), 'book.epub');
    assert.equal(BookExport.fileName('源氏物語'), 'book.epub');
    assert.ok(BookExport.fileName('x'.repeat(100)).length <= 65);
});

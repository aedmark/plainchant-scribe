const epZlib = require('zlib');
const epBook = () => ExampleBook.create({ uuid: '0f3c2a1e-6b7d-4e2a-9c1b-8a5d4f3e2b10', now: Date.UTC(2026, 10, 4) }).files;
const epPng = () => Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));

// A raw zip writer for hostile archives Zip.build refuses to make. Each entry: { name, data, deflate, size, crc,
// flags, method, compressed } where the last five override what is written in the headers.
function epZip(list) {
    const parts = [], central = [];
    let offset = 0;
    const u16 = (v) => [v & 255, (v >>> 8) & 255], u32 = (v) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
    list.forEach((e) => {
        const name = Buffer.from(e.name, 'utf8');
        const data = typeof e.data === 'string' ? Buffer.from(e.data, 'utf8') : Buffer.from(e.data || []);
        const body = e.deflate ? epZlib.deflateRawSync(data) : data;
        const method = e.method != null ? e.method : (e.deflate ? 8 : 0);
        const crc = e.crc != null ? e.crc : Zip.crc32(new Uint8Array(data));
        const fields = [].concat(u16(20), u16(e.flags != null ? e.flags : 0x0800), u16(method), u16(0), u16(0x5A21), u32(crc), u32(e.compressed != null ? e.compressed : body.length), u32(e.size != null ? e.size : data.length), u16(name.length), u16(0));
        parts.push(Buffer.from([0x50, 0x4B, 3, 4].concat(fields)), name, body);
        central.push(Buffer.from([0x50, 0x4B, 1, 2].concat(u16(20), fields, u16(0), u16(0), u16(0), u32(0), u32(offset))), name);
        offset += 30 + name.length + body.length;
    });
    const cd = Buffer.concat(central);
    const end = Buffer.from([0x50, 0x4B, 5, 6].concat(u16(0), u16(0), u16(list.length), u16(list.length), u32(cd.length), u32(offset), u16(0)));
    return new Uint8Array(Buffer.concat(parts.concat([cd, end])));
}
const epEntries = (files) => [{ name: 'mimetype', data: 'application/epub+zip' }].concat(Object.keys(files).filter((p) => p !== 'mimetype').map((p) => ({ name: p, data: files[p], deflate: true })));
const epRefused = async (bytes, code, pattern, options) => {
    try { await Epub.read(bytes, options); } catch (e) { assert.equal(e.code, code, e.message); if (pattern) assert.ok(pattern.test(e.message), e.message); return e; }
    throw new Error('expected the archive to be refused with ' + code);
};

test('epub: an exported book imports back to the same files, text and binaries apart (P5-02)', async () => {
    const files = BookCover.set(epBook(), 'OEBPS/images/cover.png', ['OEBPS/images/cover.png']).entries;
    const r = await Epub.read((await BookExport.pack(files, { 'OEBPS/images/cover.png': epPng() })).bytes);
    Object.keys(files).forEach((p) => assert.equal(r.entries[p], files[p], p));
    assert.deepEqual(Array.from(r.binaries['OEBPS/images/cover.png']), Array.from(epPng()));
    assert.deepEqual([r.title, r.warnings, r.skipped, r.problems.filter((p) => p.severity === 'error')], ['A Short Guide to Plainchant Scribe', [], [], []]);
});

test('epub: junk is skipped, a misplaced or missing mimetype is a warning, and text encodings are honoured', async () => {
    const files = epBook();
    const list = epEntries(files).filter((e) => e.name !== 'mimetype').concat(
        { name: 'OEBPS/' }, { name: '__MACOSX/OEBPS/._a.png', data: 'x' }, { name: 'OEBPS/.DS_Store', data: 'x' }, { name: 'Thumbs.db', data: 'x' },
        { name: 'mimetype', data: 'application/epub+zip' },
        { name: 'OEBPS/extra/utf16.txt', data: Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from('h\u00e9', 'utf16le')]) },
        { name: 'OEBPS/extra/latin1.txt', data: Buffer.from([0x68, 0xE9]) });
    const r = await Epub.read(epZip(list));
    assert.deepEqual(r.skipped, ['OEBPS/', '__MACOSX/OEBPS/._a.png', 'OEBPS/.DS_Store', 'Thumbs.db']);
    assert.equal(r.entries['OEBPS/extra/utf16.txt'], 'h\u00e9');
    assert.ok(r.binaries['OEBPS/extra/latin1.txt'] && !('OEBPS/extra/latin1.txt' in r.entries), 'text that is not UTF-8 or UTF-16 is kept as a file');
    assert.deepEqual(r.warnings, ['The mimetype file was not first in the archive; export puts it first.', '"OEBPS/extra/latin1.txt" is not UTF-8 or UTF-16 text, so it is kept as a file you cannot edit.']);
    const none = await Epub.read(epZip(epEntries(files).filter((e) => e.name !== 'mimetype')));
    assert.equal(none.entries.mimetype, 'application/epub+zip');
    assert.deepEqual(none.warnings, ['The archive has no mimetype file; Scribe adds one on export.']);
    const bom = epEntries(files).map((e) => (e.name === 'OEBPS/css/book.css' ? Object.assign({}, e, { data: '\ufeff' + e.data }) : e));
    assert.equal((await Epub.read(epZip(bom))).entries['OEBPS/css/book.css'], files['OEBPS/css/book.css'], 'a UTF-8 byte-order mark is dropped');
});

test('epub: unsafe and duplicate names refuse the whole book, naming the entry', async () => {
    const base = epEntries(epBook());
    for (const [name, why] of [['../evil.txt', /leaves the book/], ['OEBPS/../../evil.txt', /leaves the book/], ['/etc/passwd', /absolute/], ['C:/x.txt', /absolute/], ['OEBPS\\x.txt', /backslash/], ['OEBPS//x.txt', /empty/], ['OEBPS/./x.txt', /empty/], ['a\u0001b.txt', /control/]]) {
        const e = await epRefused(epZip(base.concat({ name: name, data: 'x' })), 'unsafe-name', why);
        assert.equal(e.entry, name);
    }
    await epRefused(epZip(base.concat({ name: 'OEBPS/Text/Chapter-1.XHTML', data: 'x' })), 'duplicate', /same name/);
    await epRefused(epZip(base.concat({ name: 'OEBPS/cafe\u0301.txt', data: 'x' }, { name: 'OEBPS/caf\u00e9.txt', data: 'y' })), 'duplicate', /same name/);
});

test('epub: limits are checked before anything is inflated, and a zip bomb stops at its declared size', async () => {
    const base = epEntries(epBook());
    const limits = { file: 4096, total: 20000, entries: 12 };
    await epRefused(epZip(base.concat({ name: 'OEBPS/big.txt', data: 'x'.repeat(5000), deflate: true })), 'too-large', /larger than/, { limits: limits });
    await epRefused(epZip(base.concat([1, 2, 3, 4].map((n) => ({ name: 'OEBPS/f' + n + '.txt', data: 'y'.repeat(4000), deflate: true })))), 'too-large', /once decompressed/, { limits: limits });
    await epRefused(epZip(base.concat([1, 2, 3, 4, 5].map((n) => ({ name: 'OEBPS/n' + n + '.txt', data: 'z' })))), 'too-many', /at most 12/, { limits: limits });
    // 50 MB of zeros deflates to about 50 KB but claims to be 100 bytes: inflating stops just past 100 bytes.
    const bomb = await epRefused(epZip(base.concat({ name: 'OEBPS/bomb.txt', data: Buffer.alloc(50 * 1024 * 1024), deflate: true, size: 100 })), 'too-large', /declared size/);
    assert.equal(bomb.entry, 'OEBPS/bomb.txt');
    await epRefused(epZip(base.concat({ name: 'OEBPS/honest.bin', data: Buffer.alloc(30 * 1024 * 1024), deflate: true })), 'too-large', /larger than 25 MB/);
});

test('epub: damaged, encrypted, and unusual archives are refused with a reason', async () => {
    const base = epEntries(epBook());
    await epRefused(new Uint8Array(100), 'not-zip', /not an \.epub/);
    await epRefused(Uint8Array.from(Buffer.from('PK\u0005\u0006' + '\u0000'.repeat(6) + '\u0005\u0000' + '\u0000'.repeat(10))), 'damaged');
    await epRefused(epZip(base.concat({ name: 'OEBPS/a.txt', data: 'abc', crc: 1 })), 'damaged', /checksum/);
    await epRefused(epZip(base.concat({ name: 'OEBPS/a.txt', data: 'abc', size: 5 })), 'damaged', /sizes disagree/);
    await epRefused(epZip(base.concat({ name: 'OEBPS/a.txt', data: 'not deflate data', method: 8 })), 'damaged');
    await epRefused(epZip(base.concat({ name: 'OEBPS/a.txt', data: 'abc', flags: 0x0801 })), 'encrypted', /zip-encrypted/);
    await epRefused(epZip(base.concat({ name: 'OEBPS/a.txt', data: 'abc', method: 12 })), 'method', /compression method/);
    const loose = epZip(base);
    new DataView(loose.buffer).setUint32(loose.length - 22 + 12, 1 << 20, true);
    await epRefused(loose, 'damaged', /out of place/);
    const cut = epZip(base);
    await epRefused(cut.subarray(0, cut.length - 30), 'not-zip');
    await epRefused(epZip([{ name: 'mimetype', data: 'application/epub+zip' }, { name: 'index.html', data: '<p>hi</p>' }]), 'not-a-book', /container\.xml/);
    const noOpf = base.filter((e) => e.name !== 'OEBPS/content.opf');
    await epRefused(epZip(noOpf), 'not-a-book', /not a readable EPUB/);
});

test('epub: DRM is refused, but font obfuscation is not', async () => {
    const base = epEntries(epBook());
    const enc = (algorithm) => '<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:enc="http://www.w3.org/2001/04/xmlenc#"><enc:EncryptedData><enc:EncryptionMethod Algorithm="' + algorithm + '"/><enc:CipherData><enc:CipherReference URI="OEBPS/fonts/a.otf"/></enc:CipherData></enc:EncryptedData></encryption>';
    const fonts = await Epub.read(epZip(base.concat({ name: 'META-INF/encryption.xml', data: enc('http://www.idpf.org/2008/embedding') })));
    assert.ok(fonts.entries['META-INF/encryption.xml'], 'obfuscated fonts import, with encryption.xml kept');
    await Epub.read(epZip(base.concat({ name: 'META-INF/encryption.xml', data: enc('http://ns.adobe.com/pdf/enc#RC') })));
    await epRefused(epZip(base.concat({ name: 'META-INF/encryption.xml', data: enc('http://www.w3.org/2001/04/xmlenc#aes128-cbc') })), 'drm', /DRM-protected/);
    await epRefused(epZip(base.concat({ name: 'META-INF/encryption.xml', data: '<encryption' })), 'drm', /cannot be read/);
    await epRefused(epZip(base.concat({ name: 'META-INF/rights.xml', data: '<rights/>' })), 'drm', /Adobe DRM/);
    await epRefused(epZip(base.concat({ name: 'META-INF/sinf.xml', data: '<sinf/>' })), 'drm', /FairPlay/);
});

// The raw zip writer, shared with test/roundtrip.test.js.
if (typeof module === 'object') module.exports = { epZip: epZip };

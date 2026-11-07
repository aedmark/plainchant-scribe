test('Preview: URLs carry the token, the entry page follows the active page, and the asset signature tracks changes (P7-12)', () => {
    const u = Preview.urls({ port: 4321, token: 'abc123', addresses: ['192.168.1.20', 'fe80::1'] });
    assert.equal(u.local, 'http://127.0.0.1:4321/abc123/');
    assert.deepEqual(u.lan, ['http://192.168.1.20:4321/abc123/', 'http://[fe80::1]:4321/abc123/']);
    assert.deepEqual(Preview.urls({ port: 1, token: 't' }).lan, []);

    const entries = { 'about.html': '', 'index.html': '', 'style.css': '', 'z/page.htm': '' };
    assert.equal(Preview.entryFor('about.html', entries), 'about.html');
    assert.equal(Preview.entryFor('style.css', entries), 'index.html');
    assert.equal(Preview.entryFor('gone.html', entries), 'index.html');
    assert.equal(Preview.entryFor('', { 'b.html': '', 'a.html': '' }), 'a.html');
    assert.equal(Preview.entryFor('', { 'x.css': '' }), '');

    const a = { 'images/a.png': { size: 10 }, 'b.png': { size: 5 } };
    const sig = Preview.assetSignature(a);
    assert.equal(sig, Preview.assetSignature({ 'b.png': { size: 5 }, 'images/a.png': { size: 10 } }));
    assert.ok(sig !== Preview.assetSignature({ 'images/a.png': { size: 11 }, 'b.png': { size: 5 } }));
    assert.equal(Preview.assetSignature({}), '');
});

test('Preview.sameBytes: equal only for the same bytes (P5-07)', () => {
    const u = (a) => new Uint8Array(a);
    assert.ok(Preview.sameBytes(u([1, 2, 3]), u([1, 2, 3])));
    assert.ok(!Preview.sameBytes(u([1, 2, 3]), u([1, 2, 4])));
    assert.ok(!Preview.sameBytes(u([1, 2, 3]), u([1, 2])));
    assert.ok(!Preview.sameBytes(u([1, 2]), u([1, 2, 3])), 'a longer second array');
    assert.ok(!Preview.sameBytes(u([1]), null));
    assert.ok(!Preview.sameBytes(null, null), 'nothing sent yet is never the same');
});

test('Send to reader: a book shares the .epub, the book page, and a QR code, packed with one date (P5-07)', () => {
    const fsP = require('fs'), pathP = require('path');
    const ui = fsP.readFileSync(pathP.join(__dirname, '..', 'src/app/preview-ui.js'), 'utf8');
    const html = fsP.readFileSync(pathP.join(__dirname, '..', 'app.html'), 'utf8');
    assert.includes(ui, 'BookPage.share(');
    assert.includes(ui, 'packOpenBook(previewWhen');
    assert.includes(ui, 'Qr.encode(');
    assert.ok(!/touchModified/.test(ui), 'sharing does not change dcterms:modified');
    ['id="previewQr"', 'id="previewBookNote"', 'id="previewKindleNote"', 'Send to reader&hellip;'].forEach((n) => assert.includes(html, n));
    assert.includes(fsP.readFileSync(pathP.join(__dirname, '..', 'src/app/epub-export-ui.js'), 'utf8'), 'async function packOpenBook(when)');
});

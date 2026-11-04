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

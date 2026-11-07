const ncBook = () => ExampleBook.create({ uuid: '0f3c2a1e-6b7d-4e2a-9c1b-8a5d4f3e2b10', now: Date.UTC(2026, 10, 4) }).files;
const ncThrows = (fn, code) => { try { fn(); } catch (e) { assert.equal(e.code, code, e.message); return; } assert.ok(false, 'expected ' + code); };
const ncRows = (e) => BookNcx.rows(e, Book.read(e).model).map((p) => p.severity + ' ' + p.code);

// A book whose contents have a span heading, nested links with fragments, and a page list with a repeated number,
// roman numerals, a page between two headings, and a page on a chapter's first line, so playOrder must be shared.
globalThis.ncRich = ncRich;
function ncRich() {
    const f = ncBook();
    const c2 = 'OEBPS/text/chapter-2.xhtml';
    f[c2] = f[c2].replace('</body>', '<h2 id="later">Later</h2><p id="pg-12">x</p><h2 id="séc">Accent</h2></body>');
    f['OEBPS/nav.xhtml'] = f['OEBPS/nav.xhtml']
        .replace(/<ol>\s*<li><a href="text\/chapter-1[\s\S]*?<\/ol>/, '<ol>\n      <li><span>Part One</span><ol><li><a href="text/chapter-1.xhtml">One &amp; Only</a></li></ol></li>\n      <li><a href="text/chapter-2.xhtml">Two</a><ol><li><a href="text/chapter-2.xhtml#later">Later</a></li><li><a href="text/chapter-2.xhtml#s%C3%A9c">Accent</a></li></ol></li>\n      <li><a href="text/chapter-3.xhtml">Three</a></li>\n    </ol>')
        .replace('</body>', '<nav epub:type="page-list" hidden=""><ol><li><a href="text/chapter-1.xhtml">iv</a></li><li><a href="text/chapter-2.xhtml#pg-12">12</a></li><li><a href="text/chapter-3.xhtml">12</a></li><li><a href="text/chapter-3.xhtml#none">Plate A</a></li></ol></nav></body>');
    return f;
}

test('book-ncx: enable writes toc.ncx beside the nav, its manifest item, and spine toc, and disable restores the book exactly (P7-04)', () => {
    const f = ncBook();
    assert.deepEqual(BookNcx.state(f), { on: false, owned: false, path: null });
    const r = BookNcx.enable(f, []);
    assert.equal(r.path, 'OEBPS/toc.ncx');
    const model = Book.read(r.entries).model;
    assert.equal(model.spine.toc, 'ncx');
    assert.equal(model.legacy.ncx.path, r.path);
    assert.equal(model.legacy.ncx.mediaType, 'application/x-dtbncx+xml');
    const ncx = r.entries[r.path];
    assert.ok(ncx.indexOf('<meta name="dtb:uid" content="urn:uuid:0f3c2a1e-6b7d-4e2a-9c1b-8a5d4f3e2b10"/>') !== -1, 'dtb:uid is the unique identifier');
    assert.ok(ncx.indexOf('<docTitle><text>A Short Guide to Plainchant Scribe</text></docTitle>') !== -1);
    assert.ok(ncx.indexOf('<docAuthor><text>Plainchant Scribe</text></docAuthor>') !== -1);
    assert.ok(/<ncx xmlns="http:\/\/www.daisy.org\/z3986\/2005\/ncx\/" version="2005-1" xml:lang="en">/.test(ncx));
    assert.deepEqual(BookNcx.read(ncx, r.path).points.map((p) => [p.label, p.src, p.playOrder]), [['A Book Is a Folder of Files', 'text/chapter-1.xhtml', '1'], ['Chapters and Contents', 'text/chapter-2.xhtml', '2'], ['A Page of Typical Elements', 'text/chapter-3.xhtml', '3']]);
    assert.deepEqual(BookNcx.state(r.entries), { on: true, owned: true, path: r.path });
    assert.deepEqual(ncRows(r.entries), []);
    assert.equal(BookNcx.refresh(r.entries), r.entries, 'nothing to refresh');
    ncThrows(() => BookNcx.enable(r.entries, []), 'present');
    const off = BookNcx.disable(r.entries, []);
    assert.deepEqual(off.removed, [r.path]);
    assert.deepEqual(off.entries, f);
    assert.equal(BookNcx.disable(f, []).entries, f, 'off is a no-op when there is none');
});

test('book-ncx: nested contents, span headings, fragments, and pages get one playOrder per target in reading order', () => {
    const f = ncRich();
    const r = BookNcx.enable(f, []);
    const read = BookNcx.read(r.entries[r.path], r.path);
    assert.deepEqual(read.points.map((p) => [p.depth, p.label, p.src, p.playOrder]), [
        [1, 'Part One', 'text/chapter-1.xhtml', '1'],
        [2, 'One & Only', 'text/chapter-1.xhtml', '1'],
        [1, 'Two', 'text/chapter-2.xhtml', '2'],
        [2, 'Later', 'text/chapter-2.xhtml#later', '3'],
        [2, 'Accent', 'text/chapter-2.xhtml#s%C3%A9c', '5'],
        [1, 'Three', 'text/chapter-3.xhtml', '6']
    ]);
    assert.deepEqual(read.pages.map((p) => [p.label, p.type, p.value, p.playOrder]), [['iv', 'front', null, '1'], ['12', 'normal', null, '4'], ['12', 'normal', null, '6'], ['Plate A', 'special', null, '7']]);
    assert.ok(r.entries[r.path].indexOf('<meta name="dtb:depth" content="2"/>') !== -1);
    assert.ok(r.entries[r.path].indexOf('<meta name="dtb:totalPageCount" content="4"/>') !== -1);
    assert.ok(r.entries[r.path].indexOf('<meta name="dtb:maxPageNumber" content="12"/>') !== -1);
    assert.deepEqual(ncRows(r.entries), ['error ncx-link-fragment'], 'the page-list link to a missing id is reported in the NCX too');
    // A unique number is the page's value.
    const one = Object.assign({}, f, { 'OEBPS/nav.xhtml': f['OEBPS/nav.xhtml'].replace('<li><a href="text/chapter-3.xhtml">12</a></li>', '') });
    const pages = BookNcx.read(BookNcx.enable(one, []).entries['OEBPS/toc.ncx'], 'OEBPS/toc.ncx').pages;
    assert.deepEqual(pages.map((p) => p.value), [null, '12', null]);
});

test('book-ncx: refresh rewrites Scribe\'s NCX after the contents change, and leaves an imported one alone unless adopted', () => {
    const on = BookNcx.enable(ncBook(), []).entries;
    const renamed = BookChapters.rename(on, 'OEBPS/text/chapter-2.xhtml', 'Second Thoughts').entries;
    assert.equal(renamed['OEBPS/toc.ncx'], on['OEBPS/toc.ncx'], 'BookChapters does not touch the NCX itself');
    assert.deepEqual(ncRows(renamed), ['info ncx-rewritten']);
    const fresh = BookNcx.refresh(renamed, []);
    assert.ok(fresh['OEBPS/toc.ncx'].indexOf('<text>Second Thoughts</text>') !== -1);
    assert.deepEqual(ncRows(fresh), []);
    // An NCX without Scribe's mark is the author's.
    const imported = Object.assign({}, renamed, { 'OEBPS/toc.ncx': renamed['OEBPS/toc.ncx'].replace(/\n    <meta name="plainchant-scribe:generated"[^>]*\/>/, '') });
    assert.deepEqual(BookNcx.state(imported), { on: true, owned: false, path: 'OEBPS/toc.ncx' });
    assert.equal(BookNcx.refresh(imported, []), imported);
    assert.deepEqual(ncRows(imported), ['warning ncx-stale']);
    // The same entries nested differently are stale too.
    const nested = Object.assign({}, fresh, { 'OEBPS/toc.ncx': fresh['OEBPS/toc.ncx'].replace(/\n    <meta name="plainchant-scribe:generated"[^>]*\/>/, '') });
    assert.deepEqual(ncRows(nested), []);
    nested['OEBPS/toc.ncx'] = nested['OEBPS/toc.ncx'].replace(/(<content src="text\/chapter-2.xhtml"\/>)\n    <\/navPoint>\n(    <navPoint[\s\S]*?<\/navPoint>)/, (m, c, next) => c + '\n' + next.replace(/^/gm, '  ') + '\n    </navPoint>');
    assert.ok(/<\/navPoint>\n    <\/navPoint>/.test(nested['OEBPS/toc.ncx']), 'chapter 3 now sits inside chapter 2');
    assert.deepEqual(ncRows(nested), ['warning ncx-stale']);
    const adopted = BookNcx.refresh(imported, [], { adopt: true });
    assert.deepEqual(BookNcx.state(adopted).owned, true);
    assert.deepEqual(ncRows(adopted), []);
    // An empty contents leaves the NCX as it is and refuses a new one.
    const empty = ncBook();
    empty['OEBPS/nav.xhtml'] = empty['OEBPS/nav.xhtml'].replace(/<ol>\s*<li><a href="text\/chapter-1[\s\S]*?<\/ol>/, '<ol><li><span>Nothing</span><ol><li><a href="https://example.com/">Away</a></li></ol></li></ol>');
    ncThrows(() => BookNcx.enable(empty, []), 'empty');
});

test('book-ncx: enable avoids taken names and ids, and refuses a dangling toc or a missing nav', () => {
    const f = ncBook();
    f['OEBPS/toc.ncx'] = 'not mine';
    f['OEBPS/content.opf'] = f['OEBPS/content.opf'].replace('<manifest>', '<manifest>\n    <item id="ncx" href="toc.ncx" media-type="text/plain"/>');
    const r = BookNcx.enable(Object.assign({}, f, { 'OEBPS/toc.ncx': undefined }), ['OEBPS/toc.ncx']);
    assert.equal(r.path, 'OEBPS/toc-2.ncx');
    assert.equal(Book.read(r.entries, { assets: ['OEBPS/toc.ncx'] }).model.spine.toc, 'ncx-2');
    const dangling = ncBook();
    dangling['OEBPS/content.opf'] = dangling['OEBPS/content.opf'].replace('<spine>', '<spine toc="gone">');
    ncThrows(() => BookNcx.enable(dangling, []), 'toc-dangling');
    ncThrows(() => BookNcx.enable({ 'OEBPS/content.opf': 'x' }, []), 'unreadable');
});

test('book-ncx: rows report what EPUBCheck reports in an NCX', () => {
    const base = BookNcx.enable(ncBook(), []).entries;
    const strip = (t) => t.replace(/\n    <meta name="plainchant-scribe:generated"[^>]*\/>/, '');
    const bad = (edit) => { const f = Object.assign({}, base); f['OEBPS/toc.ncx'] = edit(strip(f['OEBPS/toc.ncx'])); return ncRows(f).filter((c) => c !== 'warning ncx-stale'); };
    assert.deepEqual(bad((t) => t), []);
    assert.deepEqual(bad((t) => t.replace('urn:uuid:0f3c', 'urn:uuid:ffff')), ['error ncx-uid']);
    assert.deepEqual(bad((t) => t.replace(/\n    <meta name="dtb:uid"[^>]*\/>/, '')), ['warning ncx-uid-missing']);
    assert.deepEqual(bad((t) => t.replace('playOrder="1"', 'playOrder="4"')), ['error ncx-play-order', 'error ncx-play-order'], 'no 1, and a gap below 2');
    assert.deepEqual(bad((t) => t.replace('playOrder="3"', 'playOrder="5"')), ['error ncx-play-order']);
    assert.deepEqual(bad((t) => t.replace('playOrder="2"', 'playOrder="1"')), ['error ncx-play-order', 'error ncx-play-order']);
    assert.deepEqual(bad((t) => t.replace('src="text/chapter-2.xhtml"', 'src="text/chapter-1.xhtml"')), ['error ncx-play-order']);
    assert.deepEqual(bad((t) => t.replace('id="navpoint-2"', 'id="navpoint-1"')), ['error ncx-id-duplicate']);
    assert.deepEqual(bad((t) => t.replace('text/chapter-3.xhtml', 'text/chapter-9.xhtml')), ['error ncx-link-missing']);
    assert.deepEqual(bad((t) => t.replace('text/chapter-3.xhtml', 'text/chapter-3.xhtml#nowhere')), ['error ncx-link-fragment']);
    const unlisted = Object.assign({}, base, { 'OEBPS/extra.xhtml': base['OEBPS/text/chapter-3.xhtml'], 'OEBPS/toc.ncx': strip(base['OEBPS/toc.ncx']).replace('text/chapter-3.xhtml', 'extra.xhtml') });
    assert.deepEqual(ncRows(unlisted).filter((c) => c !== 'warning ncx-stale'), ['error ncx-link-unlisted']);
    assert.deepEqual(bad((t) => t.replace('text/chapter-3.xhtml', 'https://example.com/')), ['warning ncx-link-remote']);
    assert.deepEqual(bad((t) => t.replace('<text>Chapters and Contents</text>', '<text> </text>')), ['warning ncx-label-empty']);
    assert.deepEqual(bad((t) => t.replace(/<navPoint[\s\S]*<\/navPoint>\n/, '')), ['error ncx-empty']);
    assert.deepEqual(bad((t) => t.replace('</navMap>', '</navMap>\n  <pageList><pageTarget type="normal" value="3" playOrder="1"><navLabel><text>3</text></navLabel><content src="text/chapter-1.xhtml"/></pageTarget><pageTarget type="normal" value="3" playOrder="2"><navLabel><text>3</text></navLabel><content src="text/chapter-2.xhtml"/></pageTarget></pageList>')), ['error ncx-page-value']);
    assert.deepEqual(bad((t) => t.replace('</ncx>', '')), ['error ncx-unreadable']);
    const mt = Object.assign({}, base, { 'OEBPS/content.opf': base['OEBPS/content.opf'].replace('application/x-dtbncx+xml', 'application/xml') });
    assert.deepEqual(ncRows(mt).slice(0, 1), ['error ncx-media-type']);
    assert.deepEqual(BookNcx.rows(ncBook(), Book.read(ncBook()).model), [], 'no NCX, no rows');
    const row = BookNcx.rows(Object.assign({}, base, { 'OEBPS/toc.ncx': base['OEBPS/toc.ncx'].replace('text/chapter-3.xhtml', 'text/chapter-9.xhtml') }), Book.read(base).model)[0];
    assert.equal(row.file, 'OEBPS/toc.ncx');
    assert.equal(base['OEBPS/toc.ncx'].slice(0, row.start).split('\n').length, row.line);
    assert.ok(/^<content /.test(base['OEBPS/toc.ncx'].slice(row.start, row.end)), 'the row points at the <content>');
});

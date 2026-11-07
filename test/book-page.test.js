/* BookPage: what send to reader serves, and the page its link opens (P5-07, D-043). */

function bpBook() {
    const files = BookTemplate.create({ title: 'Dawn <&> "Dusk"', uuid: '3c8bee06-354b-4d4b-8ba6-3b91273750fd', now: Date.UTC(2026, 10, 6) }).files;
    const opf = 'OEBPS/content.opf';
    files[opf] = files[opf]
        .replace('<dc:language>', '<dc:creator>Ann <b>Bold</b></dc:creator><dc:creator>Bea</dc:creator><dc:creator>Cy</dc:creator><dc:language>')
        .replace('</manifest>', '<item id="cover" href="images/cover art.jpg" media-type="image/jpeg" properties="cover-image"/><item id="notes" href="text/end notes.xhtml" media-type="application/xhtml+xml"/></manifest>')
        .replace('</spine>', '<itemref idref="notes" linear="no"/></spine>');
    files['OEBPS/text/end notes.xhtml'] = files['OEBPS/text/chapter-1.xhtml'].replace(/<title>[^<]*<\/title>/, '<title>Notes &amp; sources</title>');
    files['OEBPS/drafts/old.xhtml'] = '<html/>';
    return files;
}

test('book-page: serves only what Export packs, and the page links each chapter and the .epub', () => {
    const entries = bpBook();
    const s = BookPage.share(entries, ['OEBPS/images/cover art.jpg', 'OEBPS/images/unused.png'], { bytes: 1536 });
    const planned = BookExport.plan(entries, ['OEBPS/images/cover art.jpg', 'OEBPS/images/unused.png']).order.filter((p) => p !== 'mimetype');
    assert.deepEqual(s.files, planned);
    assert.ok(s.files.indexOf('OEBPS/drafts/old.xhtml') === -1 && s.files.indexOf('OEBPS/images/unused.png') === -1, 'files the .epub would not hold are not served');
    assert.equal(s.page, '__pc_book/index.html');
    assert.equal(s.name, 'dawn-dusk.epub');
    assert.equal(s.download, '__pc_book/dawn-dusk.epub');
    assert.equal(s.chapters, 2);
    const h = s.html;
    assert.includes(h, '<title>Dawn &lt;&amp;&gt; &quot;Dusk&quot;</title>');
    assert.includes(h, '<p class="by">by Ann Bold, Bea, and Cy</p>');
    assert.includes(h, '<img src="OEBPS/images/cover%20art.jpg"');
    assert.includes(h, 'href="__pc_book/dawn-dusk.epub" download="dawn-dusk.epub"');
    assert.includes(h, '(2 KB)');
    assert.includes(h, '<a href="OEBPS/text/chapter-1.xhtml">');
    assert.includes(h, '<a href="OEBPS/text/end%20notes.xhtml">Notes &amp; sources</a> <span class="extra">(outside the reading order)</span>');
    assert.ok(h.indexOf('chapter-1.xhtml') < h.indexOf('end%20notes'), 'reading order');
    assert.includes(h, 'Kindle cannot open an .epub');
    assert.includes(h, '<html lang="en">');
    assert.ok(!/<script/i.test(h), 'the page has no script of its own');
});

test('book-page: no cover, no authors, and a reserved path in the book', () => {
    const entries = BookTemplate.create({ title: 'Plain', uuid: '3c8bee06-354b-4d4b-8ba6-3b91273750fd', now: Date.UTC(2026, 10, 6) }).files;
    const opf = 'OEBPS/content.opf';
    entries[opf] = entries[opf].replace('</manifest>', '<item id="x" href="../__pc_book/x.css" media-type="text/css"/></manifest>');
    entries['__pc_book/x.css'] = 'a{}';
    const s = BookPage.share(entries, [], {});
    assert.ok(!/<img|class="by"/.test(s.html));
    // A chapter whose file is missing is not served, so it is not linked either.
    const gone = Object.assign({}, entries, { [opf]: entries[opf].replace('</manifest>', '<item id="lost" href="text/lost.xhtml" media-type="application/xhtml+xml"/></manifest>').replace('</spine>', '<itemref idref="lost"/></spine>') });
    const g = BookPage.share(gone, [], {});
    assert.equal(g.chapters, 1);
    assert.ok(!/lost\.xhtml/.test(g.html));
    assert.ok(!/\(\d/.test(s.html), 'no size without bytes');
    assert.ok(s.files.indexOf('__pc_book/x.css') === -1, 'the server\'s own paths are never a book file');
    assert.equal(BookPage.size(512), '512 bytes');
    assert.equal(BookPage.size(3 * 1024 * 1024), '3.0 MB');
});

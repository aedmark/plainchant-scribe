const bcBook = () => ExampleBook.create({ uuid: '0f3c2a1e-6b7d-4e2a-9c1b-8a5d4f3e2b10', now: Date.UTC(2026, 10, 4) }).files;
const bcCh = (n) => 'OEBPS/text/chapter-' + n + '.xhtml';
const bcTitles = (e) => BookChapters.list(e).map((c) => c.title);
const bcToc = (e) => Nav.read(e, Book.read(e).model).nav.toc.entries.map((x) => [x.label, x.target.path]);
// Every problem the package and nav report, so each operation can be held to none.
const bcProblems = (e) => { const r = Book.read(e); return r.problems.concat(Nav.read(e, r.model).problems).map((p) => p.severity + ' ' + p.code); };
const bcThrows = (fn, code) => { try { fn(); } catch (e) { assert.equal(e.code, code, e.message); return; } assert.ok(false, 'expected ' + code); };

test('book-chapters: the list is the spine\'s XHTML chapters with their titles (P3-02)', () => {
    assert.deepEqual(BookChapters.list(bcBook()).map((c) => [c.path, c.id, c.title, c.linear]), [
        [bcCh(1), 'chapter-1', 'A Book Is a Folder of Files', true], [bcCh(2), 'chapter-2', 'Chapters and Contents', true], [bcCh(3), 'chapter-3', 'A Page of Typical Elements', true]
    ]);
    assert.equal(BookChapters.titleOf('<html xmlns="http://www.w3.org/1999/xhtml"><head/><body><h2>Only a heading</h2></body></html>', 'a/b.xhtml'), 'Only a heading');
    assert.equal(BookChapters.titleOf('<broken', 'a/b.xhtml'), 'b.xhtml');
    bcThrows(() => BookChapters.list(Object.assign(bcBook(), { 'OEBPS/content.opf': '<x' })), 'unreadable');
});

test('book-chapters: add makes a chapter after the given one, in the spine, manifest, and contents', () => {
    const r = BookChapters.add(bcBook(), 'The Long Road', bcCh(1));
    assert.equal(r.path, 'OEBPS/text/the-long-road.xhtml');
    assert.deepEqual(bcTitles(r.entries), ['A Book Is a Folder of Files', 'The Long Road', 'Chapters and Contents', 'A Page of Typical Elements']);
    assert.deepEqual(bcToc(r.entries)[1], ['The Long Road', r.path]);
    assert.deepEqual(bcProblems(r.entries), []);
    assert.deepEqual(Xhtml.check(r.entries[r.path], { path: r.path }).problems, []);
    assert.ok(r.entries[r.path].indexOf('<link rel="stylesheet" type="text/css" href="../css/book.css"/>') !== -1, 'the same stylesheet as the chapter before');
    assert.ok(r.entries[r.path].indexOf('xml:lang="en" lang="en"') !== -1, 'the book\'s language');
    const again = BookChapters.add(r.entries, 'The Long Road!', null);
    assert.equal(again.path, 'OEBPS/text/the-long-road-2.xhtml', 'file names do not clash');
    assert.equal(bcTitles(again.entries).slice(-1)[0], 'The Long Road!', 'with no chapter given, at the end');
    assert.equal(BookChapters.add(bcBook(), '\u00C9crit \u00E0 No\u00EBl \u2014 2', null).path, 'OEBPS/text/ecrit-a-noel-2.xhtml');
    assert.equal(BookChapters.add(bcBook(), '42', null).entries['OEBPS/content.opf'].indexOf('id="c-42"') !== -1, true, 'an id never starts with a digit');
    bcThrows(() => BookChapters.add(bcBook(), '  ', null), 'invalid-title');
});

test('book-chapters: rename sets the title, first heading, and contents label; the file name stays', () => {
    const before = bcBook();
    const r = BookChapters.rename(before, bcCh(2), 'Spines & Contents');
    assert.equal(r.entries[bcCh(2)], before[bcCh(2)].replace('<title>Chapters and Contents</title>', '<title>Spines &amp; Contents</title>').replace('Chapters and Contents</h1>', 'Spines &amp; Contents</h1>'));
    assert.deepEqual(bcToc(r.entries)[1], ['Spines & Contents', bcCh(2)]);
    assert.equal(r.entries['OEBPS/content.opf'], before['OEBPS/content.opf'], 'the package is untouched');
    assert.deepEqual(bcProblems(r.entries), []);
    bcThrows(() => BookChapters.rename(Object.assign(bcBook(), { [bcCh(2)]: '<html' }), bcCh(2), 'X'), 'not-well-formed');
});

test('book-chapters: move reorders the spine and the matching top-level contents entries, keeping other spine items in place', () => {
    const r = BookChapters.move(bcBook(), bcCh(3), 0);
    assert.deepEqual(bcTitles(r.entries), ['A Page of Typical Elements', 'A Book Is a Folder of Files', 'Chapters and Contents']);
    assert.deepEqual(bcToc(r.entries).map((x) => x[0]), ['A Page of Typical Elements', 'A Book Is a Folder of Files', 'Chapters and Contents']);
    assert.deepEqual(bcProblems(r.entries), []);
    const same = bcBook();
    assert.equal(BookChapters.move(same, bcCh(1), 0).entries, same, 'moving to the same place changes nothing');
    // A non-chapter spine item (an SVG page) keeps its slot.
    const svg = bcBook();
    svg['OEBPS/images/plate.svg'] = '<svg xmlns="http://www.w3.org/2000/svg"/>';
    svg['OEBPS/content.opf'] = svg['OEBPS/content.opf'].replace('  </manifest>', '    <item id="plate" href="images/plate.svg" media-type="image/svg+xml"/>\n  </manifest>').replace('<itemref idref="chapter-2"/>', '<itemref idref="plate"/>\n    <itemref idref="chapter-2"/>');
    const m = BookChapters.move(svg, bcCh(3), 0);
    assert.deepEqual(Book.read(m.entries).model.spine.itemrefs.map((x) => x.idref), ['chapter-3', 'plate', 'chapter-1', 'chapter-2']);
    bcThrows(() => BookChapters.move(bcBook(), 'OEBPS/nav.xhtml', 0), 'not-a-chapter');
});

test('book-chapters: remove deletes the file, its spine and manifest entries, and its entries in every nav', () => {
    const r = BookChapters.remove(bcBook(), bcCh(1));
    assert.ok(!(bcCh(1) in r.entries));
    assert.deepEqual(r.removed, [bcCh(1)]);
    assert.equal(r.path, bcCh(2), 'the first remaining chapter is shown');
    assert.deepEqual(bcTitles(r.entries), ['Chapters and Contents', 'A Page of Typical Elements']);
    assert.deepEqual(bcToc(r.entries).map((x) => x[1]), [bcCh(2), bcCh(3)]);
    assert.equal(/epub:type="landmarks"/.test(r.entries['OEBPS/nav.xhtml']), false, 'the landmarks nav it emptied goes too');
    assert.deepEqual(bcProblems(r.entries), []);
    const r3 = BookChapters.remove(bcBook(), bcCh(3));
    assert.ok(/epub:type="landmarks"/.test(r3.entries['OEBPS/nav.xhtml']), 'other landmarks stay');
    assert.deepEqual(bcProblems(r3.entries), []);
    bcThrows(() => BookChapters.remove(bcBook(), 'OEBPS/nav.xhtml'), 'item-is-nav');
    bcThrows(() => BookChapters.remove(bcBook(), 'OEBPS/none.xhtml'), 'not-a-chapter');
});

test('book-chapters: incoming links count other chapters\' links, not the contents', () => {
    const files = bcBook();
    assert.deepEqual(BookChapters.incomingLinks(files, bcCh(3)), []);
    files[bcCh(1)] = files[bcCh(1)].replace('<ul>', '<p><a href="chapter-3.xhtml#note-1">see</a> <a href="chapter-3.xhtml">and</a></p>\n    <ul>');
    files[bcCh(2)] = files[bcCh(2)].replace('<blockquote>', '<p><a href="./chapter-3.xhtml">three</a></p>\n    <blockquote>');
    assert.deepEqual(BookChapters.incomingLinks(files, bcCh(3)).map((l) => l.from), [bcCh(1), bcCh(1), bcCh(2)]);
});

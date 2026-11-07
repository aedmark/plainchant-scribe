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

const bcStart = (text, test) => XmlAst.parse(text).elements.find(test).start;

test('book-chapters: split moves a heading and what follows into a new chapter, with wrappers and links following (P3-03)', () => {
    const files = bcBook();
    const r = BookChapters.split(files, bcCh(3), bcStart(files[bcCh(3)], (e) => XmlAst.getAttr(e, 'id') === 'notes'));
    const fresh = r.entries[r.path], kept = r.entries[bcCh(3)];
    assert.equal(r.path, 'OEBPS/text/notes.xhtml');
    assert.deepEqual(bcTitles(r.entries), ['A Book Is a Folder of Files', 'Chapters and Contents', 'A Page of Typical Elements', 'Notes']);
    assert.ok(fresh.indexOf('<title>Notes</title>') !== -1);
    assert.ok(fresh.indexOf('<section epub:type="chapter" role="doc-chapter">\n    <h2 id="notes">Notes</h2>') !== -1, 'the wrapper is copied without its id or aria-labelledby');
    assert.equal(kept.indexOf('id="notes"'), -1);
    assert.ok(kept.indexOf('href="notes.xhtml#note-1"') !== -1, 'a link in the old chapter to a moved note follows it');
    assert.ok(fresh.indexOf('href="chapter-3.xhtml#ref-1"') !== -1, 'a link in the moved part to an id left behind names the old chapter');
    assert.deepEqual(bcToc(r.entries).slice(-1)[0], ['Notes', r.path], 'a contents entry is added for the new chapter');
    assert.deepEqual(bcProblems(r.entries), []);
    [fresh, kept].forEach((t) => assert.deepEqual(Xhtml.check(t, { path: 'x.xhtml' }).problems, []));
    // A link from another chapter into the moved part follows too.
    const linked = bcBook();
    linked[bcCh(1)] = linked[bcCh(1)].replace('<ul>', '<p><a href="chapter-3.xhtml#notes">notes</a> <a href="chapter-3.xhtml#lists">lists</a></p>\n    <ul>');
    const r2 = BookChapters.split(linked, bcCh(3), bcStart(linked[bcCh(3)], (e) => XmlAst.getAttr(e, 'id') === 'notes'));
    assert.ok(r2.entries[bcCh(1)].indexOf('<a href="notes.xhtml#notes">notes</a> <a href="chapter-3.xhtml#lists">lists</a>') !== -1);
});

test('book-chapters: a heading that opens a section takes the section; one at the very start is refused', () => {
    const files = bcBook();
    files[bcCh(2)] = files[bcCh(2)].replace('</section>', '</section>\n  <section id="part-b">\n    <h2 id="b">Part B</h2>\n    <p>B text.</p>\n  </section>');
    const r = BookChapters.split(files, bcCh(2), bcStart(files[bcCh(2)], (e) => XmlAst.getAttr(e, 'id') === 'b'));
    assert.ok(r.entries[r.path].indexOf('<body epub:type="bodymatter">\n  <section id="part-b">') !== -1, 'the whole section moves, id and all');
    assert.equal(r.entries[bcCh(2)].indexOf('part-b'), -1);
    assert.deepEqual(bcProblems(r.entries), []);
    bcThrows(() => BookChapters.split(files, bcCh(2), bcStart(files[bcCh(2)], (e) => e.local === 'h1')), 'nothing-before');
    bcThrows(() => BookChapters.split(files, bcCh(2), bcStart(files[bcCh(2)], (e) => e.local === 'p')), 'not-a-heading');
});

test('book-chapters: merge appends the next chapter, renames clashing ids, and points its links into the merged chapter', () => {
    const files = bcBook();
    files[bcCh(2)] = files[bcCh(2)].replace('<blockquote>', '<p id="chapter-1">clash <a href="#chapter-1">self</a> <a href="chapter-1.xhtml#chapter-1">one</a></p>\n    <blockquote>');
    files[bcCh(3)] = files[bcCh(3)].replace('<ol>', '<p><a href="chapter-2.xhtml#chapter-1">x</a> <a href="chapter-2.xhtml">y</a></p>\n    <ol>');
    const r = BookChapters.merge(files, bcCh(1));
    const merged = r.entries[bcCh(1)];
    assert.ok(!(bcCh(2) in r.entries));
    assert.deepEqual(r.removed, [bcCh(2)]);
    assert.deepEqual(r.renamedIds, [['chapter-1', 'chapter-1-2']]);
    assert.ok(merged.indexOf('<p id="chapter-1-2">clash <a href="#chapter-1-2">self</a> <a href="#chapter-1">one</a></p>') !== -1, merged);
    assert.ok(r.entries[bcCh(3)].indexOf('<a href="chapter-1.xhtml#chapter-1-2">x</a> <a href="chapter-1.xhtml#chapter-2">y</a>') !== -1, 'into the renamed id, and the chapter\'s start');
    assert.deepEqual(bcToc(r.entries).map((x) => x[1]), [bcCh(1), bcCh(1), bcCh(3)], 'its contents entry now points into the merged chapter');
    assert.equal(merged.indexOf('<title>A Book Is a Folder of Files</title>') !== -1, true, 'the merged chapter keeps its own head');
    assert.deepEqual(bcProblems(r.entries), []);
    assert.deepEqual(Xhtml.check(merged, { path: bcCh(1) }).problems, []);
    bcThrows(() => BookChapters.merge(bcBook(), bcCh(3)), 'no-next');
    const sheets = bcBook();
    sheets[bcCh(2)] = sheets[bcCh(2)].replace('</head>', '  <link rel="stylesheet" type="text/css" href="../css/extra.css"/>\n</head>');
    assert.deepEqual(BookChapters.merge(sheets, bcCh(1)).lostStylesheets, ['../css/extra.css']);
});

test('book-chapters: splitting then merging gives back the same body and contents targets', () => {
    const files = bcBook();
    const s = BookChapters.split(files, bcCh(3), bcStart(files[bcCh(3)], (e) => XmlAst.getAttr(e, 'id') === 'notes'));
    const m = BookChapters.merge(s.entries, bcCh(3));
    const text = (t) => XmlAst.textContent(XmlAst.find(XmlAst.parse(t), 'body')).replace(/\s+/g, ' ').trim();
    assert.equal(text(m.entries[bcCh(3)]), text(files[bcCh(3)]));
    assert.ok(m.entries[bcCh(3)].indexOf('href="#note-1"') !== -1 && m.entries[bcCh(3)].indexOf('href="#ref-1"') !== -1, 'the note links are fragment-only again');
    assert.deepEqual(bcProblems(m.entries), []);
});

test('book-chapters: the contents page goes into the reading order after the front matter, with a toc landmark, and comes out exactly (D-047)', () => {
    let e = BookCover.set(bcBook(), 'OEBPS/images/cover.png', ['OEBPS/images/cover.png']).entries;
    e = BookMatter.add(e, { kind: 'titlepage' }, new Date('2026-11-06')).entries;
    assert.equal(BookChapters.navInReading(e), false);
    const on = BookChapters.setNavInReading(e, true).entries;
    assert.equal(BookChapters.navInReading(on), true);
    assert.deepEqual(BookChapters.list(on).map((c) => c.path.split('/').pop() + (c.nav ? '*' : '')), ['cover.xhtml', 'titlepage.xhtml', 'nav.xhtml*', 'chapter-1.xhtml', 'chapter-2.xhtml', 'chapter-3.xhtml']);
    assert.includes(on['OEBPS/nav.xhtml'], '<li><a epub:type="toc" href="nav.xhtml#toc">Contents</a></li>');
    assert.deepEqual(bcProblems(on).filter((p) => !/cover-missing|item-file-missing/.test(p)), [], 'the cover image is a binary asset, not in these text entries');
    assert.equal(BookChapters.setNavInReading(on, true).entries, on, 'already on: nothing changes');
    // It can move, but nothing else that would damage it.
    bcThrows(() => BookChapters.rename(on, 'OEBPS/nav.xhtml', 'Index'), 'nav');
    bcThrows(() => BookChapters.remove(on, 'OEBPS/nav.xhtml'), 'nav');
    bcThrows(() => BookChapters.split(on, 'OEBPS/nav.xhtml', on['OEBPS/nav.xhtml'].indexOf('<h1>')), 'nav');
    bcThrows(() => BookChapters.merge(on, 'OEBPS/nav.xhtml'), 'nav');
    bcThrows(() => BookChapters.merge(on, 'OEBPS/text/titlepage.xhtml'), 'nav');
    const moved = BookChapters.move(on, 'OEBPS/nav.xhtml', 4).entries;
    assert.equal(BookChapters.list(moved)[4].path, 'OEBPS/nav.xhtml');
    // Generate contents now keeps the toc landmark and does not list the contents page in itself.
    const plan = BookContents.plan(on);
    assert.ok(plan.landmarks.some((l) => l.type === 'toc'), 'toc landmark planned');
    const after = BookContents.apply(on, plan);
    assert.ok(Nav.entries(Nav.read(after, Book.read(after).model).nav.toc).every((x) => x.target.path !== 'OEBPS/nav.xhtml'));
    assert.equal(JSON.stringify(BookChapters.setNavInReading(on, false).entries), JSON.stringify(e), 'off restores every byte');
    // With no front matter it goes first.
    assert.equal(BookChapters.list(BookChapters.setNavInReading(bcBook(), true).entries)[0].path, 'OEBPS/nav.xhtml');
});

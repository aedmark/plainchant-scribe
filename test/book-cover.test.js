const cvBook = () => ExampleBook.create({ uuid: '0f3c2a1e-6b7d-4e2a-9c1b-8a5d4f3e2b10', now: Date.UTC(2026, 10, 4) }).files;
const CV_ASSETS = ['OEBPS/images/cover.png', 'OEBPS/images/photo.jpg'];
const cvProblems = (e, assets) => { const r = Book.read(e, { assets: assets || CV_ASSETS }); return r.problems.concat(Nav.read(e, r.model).problems).map((p) => p.severity + ' ' + p.code); };
const cvThrows = (fn, code) => { try { fn(); } catch (e) { assert.equal(e.code, code, e.message); return; } assert.ok(false, 'expected ' + code); };

test('book-cover: set marks the image cover-image and adds a cover page first in the spine with a landmark (P3-05)', () => {
    const r = BookCover.set(cvBook(), 'OEBPS/images/cover.png', CV_ASSETS);
    const model = Book.read(r.entries, { assets: CV_ASSETS }).model;
    assert.equal(model.cover.path, 'OEBPS/images/cover.png');
    assert.equal(model.coverSource, 'cover-image');
    assert.equal(r.page, 'OEBPS/text/cover.xhtml');
    assert.equal(model.spine.itemrefs[0].item.path, r.page);
    assert.ok(r.entries[r.page].indexOf('<img src="../images/cover.png" alt="Cover of A Short Guide to Plainchant Scribe"/>') !== -1);
    assert.deepEqual(Xhtml.check(r.entries[r.page], { path: r.page }).problems, []);
    const nav = Nav.read(r.entries, model).nav;
    assert.deepEqual(nav.landmarks.entries.map((e) => [e.types[0], e.target.path]), [['bodymatter', 'OEBPS/text/chapter-1.xhtml'], ['cover', r.page]]);
    assert.deepEqual(cvProblems(r.entries), []);
    assert.deepEqual(BookCover.current(r.entries, CV_ASSETS), { path: 'OEBPS/images/cover.png', mediaType: 'image/png', page: r.page });
});

test('book-cover: changing the cover moves cover-image, updates the page and the EPUB 2 meta, and makes no second page', () => {
    let f = BookCover.set(cvBook(), 'OEBPS/images/cover.png', CV_ASSETS).entries;
    f['OEBPS/content.opf'] = f['OEBPS/content.opf'].replace('  </metadata>', '    <meta name="cover" content="cover-image"/>\n  </metadata>');
    const r = BookCover.set(f, 'OEBPS/images/photo.jpg', CV_ASSETS);
    const model = Book.read(r.entries, { assets: CV_ASSETS }).model;
    assert.equal(model.cover.path, 'OEBPS/images/photo.jpg');
    assert.equal(model.manifest.items.filter((i) => i.properties.indexOf('cover-image') !== -1).length, 1);
    assert.equal(model.legacy.cover.content, model.cover.id, 'the EPUB 2 meta follows');
    assert.ok(r.entries[r.page].indexOf('src="../images/photo.jpg"') !== -1);
    assert.equal(Object.keys(r.entries).filter((p) => /cover.*\.xhtml$/.test(p)).length, 1);
    assert.deepEqual(cvProblems(r.entries).filter((c) => c !== 'info legacy-cover'), []);
    cvThrows(() => BookCover.set(cvBook(), 'OEBPS/images/none.png', CV_ASSETS), 'missing');
    cvThrows(() => BookCover.set(cvBook(), 'OEBPS/css/book.css', CV_ASSETS), 'not-an-image');
});

test('book-cover: remove unmarks the image, deletes the page and its landmark, and keeps the image', () => {
    const set = BookCover.set(cvBook(), 'OEBPS/images/cover.png', CV_ASSETS).entries;
    const r = BookCover.remove(set, CV_ASSETS);
    const model = Book.read(r.entries, { assets: CV_ASSETS }).model;
    assert.equal(model.cover, null);
    assert.deepEqual(r.removed, ['OEBPS/text/cover.xhtml']);
    assert.ok(model.manifest.items.some((i) => i.path === 'OEBPS/images/cover.png'), 'the image stays in the manifest');
    assert.equal(r.entries['OEBPS/nav.xhtml'].indexOf('cover'), -1);
    assert.deepEqual(cvProblems(r.entries), []);
    assert.deepEqual(BookCover.current(r.entries, CV_ASSETS), { path: null, mediaType: null, page: null });
});

test('book-cover: generated contents leave the cover page out but give it its landmark', () => {
    const f = BookCover.set(cvBook(), 'OEBPS/images/cover.png', CV_ASSETS).entries;
    const p = BookContents.plan(f, 1);
    assert.deepEqual(p.tree.map((i) => i.label), ['A Book Is a Folder of Files', 'Chapters and Contents', 'A Page of Typical Elements']);
    assert.deepEqual(p.landmarks.map((l) => l.type), ['cover', 'bodymatter']);
});

test('book-cover: the typographic layout wraps the title, shrinks it to fit four lines, and places the author', () => {
    const measure = (t, size) => t.length * size * 0.5;
    assert.deepEqual(BookCover.wrap('one two three four', 30, (t) => t.length * 4), ['one two', 'three', 'four']);
    assert.deepEqual(BookCover.wrap('  ', 100, (t) => t.length), []);
    const short = BookCover.layout('Ink', 'Ada Penrose', 'dark', measure);
    assert.deepEqual(short.steps.map((s) => s.op), ['fill', 'text', 'rule', 'text']);
    assert.equal(short.steps[0].color, BookCover.PALETTES.dark.background);
    assert.equal(short.steps[1].size, 190, 'a short title is set large');
    assert.equal(short.steps[3].text, 'Ada Penrose');
    const long = BookCover.layout('A Short Guide to Plainchant Scribe and Other Very Long Titles', '', 'paper', measure);
    const lines = long.steps.filter((s) => s.op === 'text');
    assert.ok(lines.length <= 4 && lines.every((s) => measure(s.text, s.size) <= BookCover.SIZE.width - 320), 'every line fits inside the margins');
    assert.ok(lines[0].size < 190, 'a long title is set smaller');
    assert.equal(long.steps.filter((s) => s.op === 'rule').length, 1);
    assert.equal(BookCover.layout('X', '', 'nope', measure).steps[0].color, BookCover.PALETTES.paper.background, 'an unknown palette falls back');
    assert.equal(BookCover.mediaTypeFor('a/B.JPG'), 'image/jpeg');
});

test('book-cover: set writes the EPUB 2 cover meta Kobo reads, once, and remove drops it', () => {
    const f = BookCover.set(cvBook(), 'OEBPS/images/cover.png', CV_ASSETS).entries;
    assert.equal(f['OEBPS/content.opf'].split('<meta name="cover" content="cover-image"/>').length, 2, 'exactly one');
    assert.ok(/<meta name="cover" content="cover-image"\/>\n  <\/metadata>/.test(f['OEBPS/content.opf']), 'last in the metadata, indented');
    const again = BookCover.set(f, 'OEBPS/images/cover.png', CV_ASSETS).entries;
    assert.equal(again['OEBPS/content.opf'].split('name="cover"').length, 2, 'setting it again adds no second one');
    const r = BookCover.remove(f, CV_ASSETS);
    assert.equal(r.entries['OEBPS/content.opf'].indexOf('name="cover"'), -1);
    assert.deepEqual(cvProblems(r.entries), []);
});

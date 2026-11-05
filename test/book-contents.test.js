const tcBook = () => ExampleBook.create({ uuid: '0f3c2a1e-6b7d-4e2a-9c1b-8a5d4f3e2b10', now: Date.UTC(2026, 10, 4) }).files;
const tcCh = (n) => 'OEBPS/text/chapter-' + n + '.xhtml';
const tcShape = (tree) => tree.map((i) => (i.children.length ? [i.label + (i.fragment ? '#' + i.fragment : ''), tcShape(i.children)] : i.label + (i.fragment ? '#' + i.fragment : '')));
const tcProblems = (e) => { const r = Book.read(e); return r.problems.concat(Nav.read(e, r.model).problems).map((p) => p.severity + ' ' + p.code); };
const tcWith = (n, from, to) => { const f = tcBook(); assert.ok(f[tcCh(n)].indexOf(from) !== -1); f[tcCh(n)] = f[tcCh(n)].replace(from, to); return f; };

test('book-contents: the plan follows the spine and nests headings to the chosen depth (P3-04)', () => {
    const files = tcWith(2, '<blockquote>', '<h2>Reading order</h2>\n    <h3>Spine details</h3>\n    <h4 id="deep">Deep</h4>\n    <blockquote>');
    assert.deepEqual(tcShape(BookContents.plan(files, 1).tree), ['A Book Is a Folder of Files', 'Chapters and Contents', 'A Page of Typical Elements']);
    assert.deepEqual(tcShape(BookContents.plan(files, 2).tree), ['A Book Is a Folder of Files', ['Chapters and Contents', ['Reading order#reading-order']], ['A Page of Typical Elements', ['Lists#lists', 'Notes#notes']]]);
    assert.deepEqual(tcShape(BookContents.plan(files, 3).tree)[1], ['Chapters and Contents', [['Reading order#reading-order', ['Spine details#spine-details']]]]);
    assert.equal(BookContents.plan(files, 9).depth, 2, 'an unknown depth falls back to 2');
    const p = BookContents.plan(files, 3);
    assert.deepEqual(p.ids.map((x) => x.id), ['reading-order', 'spine-details'], 'ids only for headings that link and lack one');
    assert.equal(BookContents.count(p.tree), 7);
});

test('book-contents: levels are relative, a second top heading is its own entry, and chapters without headings use their title', () => {
    const skip = tcWith(1, '<ul>', '<h3>Skipped a level</h3>\n    <ul>');
    assert.deepEqual(tcShape(BookContents.plan(skip, 2).tree)[0], ['A Book Is a Folder of Files', ['Skipped a level#skipped-a-level']], 'h3 under h1 is the next level down');
    const two = tcWith(1, '<ul>', '<h1>A second part</h1>\n    <ul>');
    assert.deepEqual(tcShape(BookContents.plan(two, 2).tree).slice(0, 2), ['A Book Is a Folder of Files', 'A second part#a-second-part']);
    const none = tcWith(2, /<h1[^>]*>Chapters and Contents<\/h1>/.exec(tcBook()[tcCh(2)])[0], '');
    assert.equal(BookContents.plan(none, 2).tree[1].label, 'Chapters and Contents', 'the <title>');
    const clash = tcWith(1, '<ul>', '<h2 id="x">X</h2>\n    <h2>Lists</h2>\n    <h2>Lists</h2>\n    <ul>');
    clash[tcCh(1)] = clash[tcCh(1)].replace('<p>An EPUB', '<p id="lists">An EPUB');
    assert.deepEqual(BookContents.plan(clash, 2).ids.map((x) => x.id), ['lists-2', 'lists-3'], 'generated ids never clash');
});

test('book-contents: non-linear chapters, the nav, and broken chapters are left out', () => {
    const files = tcBook();
    files['OEBPS/content.opf'] = files['OEBPS/content.opf'].replace('<itemref idref="chapter-2"/>', '<itemref idref="chapter-2" linear="no"/>');
    assert.deepEqual(tcShape(BookContents.plan(files, 1).tree), ['A Book Is a Folder of Files', 'A Page of Typical Elements']);
    const broken = tcBook();
    broken[tcCh(3)] = '<html';
    const p = BookContents.plan(broken, 1);
    assert.deepEqual(p.skipped, [tcCh(3)]);
    assert.equal(p.tree.length, 2);
    assert.throws(() => BookContents.plan(Object.assign(tcBook(), { 'OEBPS/content.opf': '<x' }), 2));
});

test('book-contents: landmarks come from epub:type, the first of each type, toc only with the nav in the spine', () => {
    assert.deepEqual(BookContents.plan(tcBook(), 2).landmarks.map((l) => [l.type, l.path]), [['bodymatter', tcCh(1)]], 'every chapter says bodymatter; the first wins');
    const typed = tcBook();
    typed[tcCh(1)] = typed[tcCh(1)].replace('<body epub:type="bodymatter">', '<body epub:type="frontmatter">').replace('<section epub:type="chapter"', '<section epub:type="preface"');
    typed[tcCh(3)] = typed[tcCh(3)].replace('<section epub:type="chapter"', '<section epub:type="index"');
    assert.deepEqual(BookContents.plan(typed, 2).landmarks.map((l) => [l.type, l.path.split('/').pop(), l.label]), [
        ['frontmatter', 'chapter-1.xhtml', 'Front matter'], ['preface', 'chapter-1.xhtml', 'Preface'], ['bodymatter', 'chapter-2.xhtml', 'Start of content'], ['index', 'chapter-3.xhtml', 'Index']
    ]);
    const inSpine = tcBook();
    inSpine['OEBPS/content.opf'] = inSpine['OEBPS/content.opf'].replace('<itemref idref="chapter-1"/>', '<itemref idref="nav"/>\n    <itemref idref="chapter-1"/>');
    assert.deepEqual(BookContents.plan(inSpine, 2).landmarks.map((l) => l.type), ['bodymatter', 'toc']);
    // A landmark to a file the plan does not consider (a non-linear chapter) stays.
    const kept = tcBook();
    kept['OEBPS/content.opf'] = kept['OEBPS/content.opf'].replace('<itemref idref="chapter-3"/>', '<itemref idref="chapter-3" linear="no"/>');
    kept['OEBPS/nav.xhtml'] = kept['OEBPS/nav.xhtml'].replace('Start of content</a></li>', 'Start of content</a></li>\n      <li><a epub:type="index" href="text/chapter-3.xhtml">Index</a></li>');
    assert.deepEqual(BookContents.plan(kept, 2).landmarks.map((l) => [l.type, l.kept || false]), [['index', true], ['bodymatter', false]]);
});

test('book-contents: apply writes the ids, replaces the toc list, refreshes the landmarks, and keeps the page list', () => {
    const files = tcWith(2, '<blockquote>', '<h2>Reading order</h2>\n    <blockquote>');
    let f = Object.assign({}, files);
    f['OEBPS/nav.xhtml'] = XmlAst.applyEdits(f['OEBPS/nav.xhtml'], Nav.setPageList(Nav.read(f, Book.read(f).model).nav, [{ label: '1', path: tcCh(1), fragment: 'chapter-1' }]));
    const pageList = /<nav epub:type="page-list"[\s\S]*?<\/nav>/.exec(f['OEBPS/nav.xhtml'])[0];
    const out = BookContents.apply(f, BookContents.plan(f, 2));
    assert.ok(out[tcCh(2)].indexOf('<h2 id="reading-order">Reading order</h2>') !== -1);
    assert.equal(out[tcCh(2)], f[tcCh(2)].replace('<h2>Reading order</h2>', '<h2 id="reading-order">Reading order</h2>'), 'only the id is added');
    assert.ok(out['OEBPS/nav.xhtml'].indexOf('<li><a href="text/chapter-2.xhtml#reading-order">Reading order</a></li>') !== -1);
    assert.ok(out['OEBPS/nav.xhtml'].indexOf(pageList) !== -1, 'the page list is untouched');
    assert.deepEqual(tcProblems(out), []);
    assert.equal(out['OEBPS/content.opf'], f['OEBPS/content.opf']);
    // With no landmarks nav, one is made; with types gone, the old landmarks are replaced.
    const bare = tcBook();
    bare['OEBPS/nav.xhtml'] = bare['OEBPS/nav.xhtml'].replace(/\s*<nav epub:type="landmarks"[\s\S]*?<\/nav>/, '');
    const made = BookContents.apply(bare, BookContents.plan(bare, 1));
    assert.deepEqual(Nav.read(made, Book.read(made).model).nav.landmarks.entries.map((e) => [e.types[0], e.target.path]), [['bodymatter', tcCh(1)]]);
    assert.deepEqual(tcProblems(made), []);
});

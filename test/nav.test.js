const nvFs = require('fs');
const nvPath = require('path');

const NV = 'OEBPS/nav.xhtml';
const nvFixture = (name) => nvFs.readFileSync(nvPath.join(__dirname, 'fixtures', 'xml', name), 'utf8');
const nvTemplate = (opts) => BookTemplate.create(Object.assign({ uuid: '0f3c2a1e-6b7d-4e2a-9c1b-8a5d4f3e2b10', now: Date.UTC(2026, 10, 3) }, opts)).files;

// The hand-edited fixture book: tab-indented nav, two chapters.
function nvFixtureBook() {
    return {
        'mimetype': 'application/epub+zip',
        'META-INF/container.xml': nvFixture('container.xml'),
        'OEBPS/content.opf': nvFixture('content.opf'),
        'OEBPS/nav.xhtml': nvFixture('nav.xhtml'),
        'OEBPS/css/book.css': '',
        'OEBPS/text/chapter-1.xhtml': nvFixture('chapter.xhtml'),
        'OEBPS/text/chapter-2.xhtml': nvFixture('chapter.xhtml')
    };
}
const nvRead = (files) => Nav.read(files, Book.read(files).model);
const nvCodes = (files) => nvRead(files).problems.map((p) => p.severity + ' ' + p.code);

// Replaces the template nav's <body> content.
function nvWithBody(body, extra) {
    const files = Object.assign(nvTemplate(), extra || {});
    files[NV] = files[NV].replace(/<body>[\s\S]*<\/body>/, '<body>\n' + body + '\n</body>');
    return files;
}
const nvToc = (inner) => '<nav epub:type="toc" id="toc"><ol>' + inner + '</ol></nav>';
const nvLink = '<li><a href="text/chapter-1.xhtml">One</a></li>';

// Runs one op on a fresh read; returns the new files, nav text, and read.
function nvRun(files, op) {
    const r = nvRead(files);
    assert.ok(r.nav, 'the nav reads');
    const edits = op(r.nav);
    const next = Object.assign({}, files);
    next[NV] = XmlAst.applyEdits(files[NV], edits);
    return { files: next, text: next[NV], read: nvRead(next), edits: edits };
}
function nvExpect(files, op, pairs) {
    const r = nvRun(files, op);
    let want = files[NV];
    pairs.forEach(([from, to]) => {
        assert.ok(want.indexOf(from) !== -1, 'the nav contains ' + JSON.stringify(from));
        want = want.replace(from, to);
    });
    assert.equal(r.text, want);
    return r;
}
const nvThrows = (fn, code) => {
    try { fn(); } catch (e) { assert.equal(e.code, code, e.message); return; }
    assert.ok(false, 'expected an error with code ' + code);
};

test('nav: reads the template and the hand-edited fixture with no problems (P1-05)', () => {
    const t = nvRead(nvTemplate());
    assert.deepEqual(t.problems, []);
    assert.equal(t.nav.path, NV);
    assert.deepEqual(t.nav.toc.entries.map((e) => [e.label, e.kind, e.target.path, e.depth]), [['Chapter 1', 'a', 'OEBPS/text/chapter-1.xhtml', 0]]);
    assert.equal(t.nav.toc.heading.text, 'Contents');
    assert.equal(t.nav.toc.hidden, false);
    assert.deepEqual(t.nav.landmarks.entries.map((e) => [e.types, e.label]), [[['bodymatter'], 'Start of content']]);
    assert.equal(t.nav.landmarks.hidden, true);
    assert.equal(t.nav.pageList, null);
    const f = nvRead(nvFixtureBook());
    assert.deepEqual(f.problems, []);
    assert.deepEqual(f.nav.toc.entries.map((e) => e.label), ['I. The Counting House', 'II. Ink & Ash']);
    assert.equal(f.nav.toc.id, 'toc');
    assert.equal(Nav.read(nvTemplate(), null).nav, null, 'no model, no nav');
});

test('nav: reads nesting, span headings, image labels, other navs, and fragments', () => {
    const files = nvWithBody(
        '<nav epub:type="toc"><h2>Contents</h2><ol>' +
        '<li><span>Part <em>One</em></span><ol><li><a href="text/chapter-1.xhtml#s%C3%A9c">Section</a></li></ol></li>' +
        '<li><a href="text/chapter-1.xhtml#fig"><img src="x.png" alt="A figure"/></a></li>' +
        '<li><a href="text/chapter-1.xhtml#t" title="Titled"><img src="y.png"/></a></li>' +
        '</ol></nav>\n<nav epub:type="loi lot"><h2>Lists</h2><ol><li><a href="https://example.org/">Online</a></li></ol></nav>\n<nav><p>Untyped navs are not restricted.</p></nav>');
    const r = nvRead(files);
    assert.deepEqual(r.problems.map((p) => p.severity + ' ' + p.code), ['error nav-label-no-text', 'error nav-label-no-text'], 'image-only links have labels by §7.3, but EPUBCheck wants text');
    const all = Nav.entries(r.nav.toc);
    assert.deepEqual(all.map((e) => [e.label, e.kind, e.depth]), [['Part One', 'span', 0], ['Section', 'a', 1], ['A figure', 'a', 0], ['Titled', 'a', 0]]);
    assert.equal(all[1].target.fragment, 'séc');
    assert.equal(all[1].parent, all[0]);
    assert.deepEqual(r.nav.others.map((n) => [n.kind, n.types]), [['other', ['loi', 'lot']]]);
    assert.equal(r.nav.others[0].entries[0].target.remote, true, 'other navs may link outside the book');
    assert.deepEqual(Nav.toTree(r.nav.toc)[0], { label: 'Part One', href: null, types: [], children: [{ label: 'Section', href: 'text/chapter-1.xhtml#s%C3%A9c', types: [], children: [] }] });
});

test('nav: the §7 content model, nav counts, and landmark rules each give their problem', () => {
    const cases = [
        ['<nav epub:type="landmarks"><ol>' + nvLink.replace('<a ', '<a epub:type="bodymatter" ') + '</ol></nav>', ['error nav-toc-missing']],
        [nvToc(nvLink) + nvToc(nvLink).replace(' id="toc"', ''), ['error nav-toc-multiple']],
        ['<nav epub:type="toc"><h1>T</h1></nav>', ['error nav-list-missing']],
        ['<nav epub:type="toc"><ol>' + nvLink + '</ol><ol>' + nvLink + '</ol></nav>', ['error nav-content']],
        ['<nav epub:type="toc"><ol>' + nvLink + '</ol><h1>Late</h1></nav>', ['error nav-content']],
        ['<nav epub:type="toc">Loose text<ol>' + nvLink + '</ol></nav>', ['error nav-content']],
        [nvToc(''), ['error nav-list-empty']],
        [nvToc(nvLink + '<p>x</p>'), ['error nav-content']],
        [nvToc('<li>Bare text</li>'), ['error nav-entry-label-missing']],
        [nvToc('<li><a href="text/chapter-1.xhtml">One</a><a href="text/chapter-1.xhtml">Two</a></li>'), ['error nav-content']],
        [nvToc('<li><a href="text/chapter-1.xhtml"> </a></li>'), ['error nav-label-empty']],
        [nvToc('<li><a href="text/chapter-1.xhtml"><img src="x.png"/></a></li>'), ['error nav-label-empty']],
        [nvToc('<li><span>Heading only</span></li>'), ['error nav-span-leaf']],
        [nvToc('<li><a>No href</a></li>'), ['warning nav-href-missing']],
        [nvToc(nvLink) + '<nav epub:type="landmarks"><ol>' + nvLink + '</ol></nav>', ['error landmark-type-missing']],
        [nvToc(nvLink) + '<nav epub:type="landmarks"><ol><li><a epub:type="bodymatter" href="text/chapter-1.xhtml">A</a></li><li><a epub:type="bodymatter" href="text/chapter-1.xhtml">B</a></li></ol></nav>', ['error landmark-repeated']],
        [nvToc(nvLink) + '<nav epub:type="landmarks"><ol><li><a epub:type="bodymatter" href="text/chapter-1.xhtml">A</a></li><li><a epub:type="bodymatter" href="text/chapter-1.xhtml#x">B</a></li></ol></nav>', []],
        [nvToc(nvLink) + '<nav epub:type="landmarks"><ol></ol></nav><nav epub:type="landmarks"><ol>' + nvLink.replace('<a ', '<a epub:type="toc" ') + '</ol></nav>', ['error nav-list-empty', 'error nav-landmarks-multiple']],
        [nvToc(nvLink) + '<nav epub:type="page-list"><ol>' + nvLink + '</ol></nav><nav epub:type="page-list"><ol>' + nvLink + '</ol></nav>', ['error nav-page-list-multiple']],
        [nvToc(nvLink) + '<nav epub:type="lot"><ol>' + nvLink + '</ol></nav>', ['error nav-heading-missing']],
        [nvToc(nvLink) + '<nav epub:type="lot"><h2>Tables</h2><ol>' + nvLink + '</ol></nav>', []],
        [nvToc('<li><a href="text/chapter-1.xhtml"><img src="x.png" alt="Pic"/> One</a></li>'), []],
        [nvToc(nvLink) + '<nav epub:type="page-list"><ol><li><a href="text/chapter-1.xhtml">1</a><ol>' + nvLink + '</ol></li></ol></nav>', ['warning nav-nested']]
    ];
    cases.forEach(([body, codes]) => assert.deepEqual(nvCodes(nvWithBody(body)), codes, body));
    const notX = nvTemplate();
    notX[NV] = '<?xml version="1.0"?>\n<html><body/></html>';
    assert.deepEqual(nvCodes(notX), ['error nav-not-xhtml']);
    const broken = nvTemplate();
    broken[NV] = broken[NV].replace('</ol>', '</ul>');
    assert.ok(nvCodes(broken).every((c) => c.indexOf('error xml-') === 0) && nvRead(broken).nav === null, 'a nav that is not well-formed gives XML problems and no model');
});

test('nav: toc, landmarks, and page-list links must reach a document in the spine (RSC-011), in spine order', () => {
    const extra = { 'OEBPS/text/chapter-2.xhtml': '', 'OEBPS/text/notes.xhtml': '', 'OEBPS/p.xml': '' };
    const withOpf = (files) => {
        files['OEBPS/content.opf'] = files['OEBPS/content.opf']
            .replace('  </manifest>', '    <item id="chapter-2" href="text/chapter-2.xhtml" media-type="application/xhtml+xml"/>\n    <item id="notes" href="text/notes.xhtml" media-type="application/xhtml+xml"/>\n    <item id="raw" href="p.xml" media-type="application/xml" fallback="notes"/>\n  </manifest>')
            .replace('    <itemref idref="chapter-1"/>', '    <itemref idref="chapter-1"/>\n    <itemref idref="chapter-2"/>');
        return files;
    };
    const one = (href) => nvCodes(withOpf(nvWithBody(nvToc('<li><a href="' + href + '">X</a></li>'), extra)));
    assert.deepEqual(one('text/chapter-2.xhtml#x'), []);
    assert.deepEqual(one('https://example.org/'), ['error nav-link-remote']);
    assert.deepEqual(one('../../x.xhtml'), ['error nav-link-invalid']);
    assert.deepEqual(one('text/missing.xhtml'), ['error nav-link-unknown']);
    assert.deepEqual(one('text/notes.xhtml'), ['error nav-link-not-in-spine']);
    assert.deepEqual(one('#toc'), ['error nav-link-not-in-spine'], 'the nav itself is not in the spine');
    const viaFallback = withOpf(nvWithBody(nvToc('<li><a href="text/notes.xhtml">Notes</a></li>'), extra));
    viaFallback['OEBPS/content.opf'] = viaFallback['OEBPS/content.opf'].replace('<itemref idref="chapter-2"/>', '<itemref idref="chapter-2"/>\n    <itemref idref="raw"/>');
    assert.deepEqual(nvCodes(viaFallback), ['error nav-link-fallback'], 'top-level by §7.3, but EPUBCheck wants the spine item itself');
    const navInSpine = nvWithBody(nvToc('<li><a href="#toc">Contents</a></li>'));
    navInSpine['OEBPS/content.opf'] = navInSpine['OEBPS/content.opf'].replace('<itemref idref="chapter-1"/>', '<itemref idref="nav"/>\n    <itemref idref="chapter-1"/>');
    assert.deepEqual(nvCodes(navInSpine), []);
    const order = withOpf(nvWithBody(nvToc('<li><a href="text/chapter-2.xhtml">Two</a></li><li><a href="text/chapter-1.xhtml">One</a></li>'), extra));
    assert.deepEqual(nvCodes(order), ['warning toc-order']);
    assert.deepEqual(nvCodes(withOpf(nvWithBody('<nav epub:type="lot"><h2>Tables</h2><ol><li><a href="text/notes.xhtml">T</a></li><li><a href="https://example.org/">Web</a></li></ol></nav>' + nvToc(nvLink), extra))), ['error nav-link-not-in-spine'], 'other navs may link to the web, but EPUBCheck holds their internal links to the spine');
});

test('nav: labels and hrefs are set in place; spans have no href', () => {
    const files = nvFixtureBook();
    nvExpect(files, (n) => Nav.setLabel(n, n.toc.entries[1], '  II.  Ash & Ink '), [['II. Ink &amp; Ash', 'II. Ash &amp; Ink']]);
    nvExpect(files, (n) => Nav.setHref(n, n.toc.entries[1], { path: 'OEBPS/text/chapter-2.xhtml', fragment: 'part two' }), [['"text/chapter-2.xhtml"', '"text/chapter-2.xhtml#part%20two"']]);
    nvExpect(files, (n) => Nav.setHref(n, n.toc.entries[1], { href: 'text/chapter-2.xhtml#raw' }), [['"text/chapter-2.xhtml"', '"text/chapter-2.xhtml#raw"']]);
    const spans = nvWithBody(nvToc('<li><span>H</span><ol>' + nvLink + '</ol></li>'));
    const n = nvRead(spans).nav;
    nvThrows(() => Nav.setHref(n, n.toc.entries[0], { path: 'OEBPS/text/chapter-1.xhtml' }), 'not-a-link');
    nvThrows(() => Nav.setHref(n, n.toc.entries[0].children[0], { path: '../x' }), 'invalid-path');
    nvThrows(() => Nav.setLabel(nvRead(files).nav, n.toc.entries[0], 'x'), 'unknown-entry');
});

test('nav: entries are added before, after, as children, and at the end, in the file\'s indentation', () => {
    const files = nvFixtureBook();
    const c2 = { label: 'III. Last', path: 'OEBPS/text/chapter-2.xhtml', fragment: 'end' };
    nvExpect(files, (n) => Nav.addEntry(n, n.toc, 'append', c2), [['II. Ink &amp; Ash</a></li>\n', 'II. Ink &amp; Ash</a></li>\n\t\t\t<li><a href="text/chapter-2.xhtml#end">III. Last</a></li>\n']]);
    nvExpect(files, (n) => Nav.addEntry(n, n.toc.entries[0], 'before', { label: 'Preface', path: 'OEBPS/text/chapter-1.xhtml', fragment: 'pre' }), [['\t\t\t<li><a href="text/chapter-1.xhtml">I.', '\t\t\t<li><a href="text/chapter-1.xhtml#pre">Preface</a></li>\n\t\t\t<li><a href="text/chapter-1.xhtml">I.']]);
    // An inline <li> becomes a block holding its label as written and the new sublist, with tabs.
    const child = nvExpect(files, (n) => Nav.addEntry(n, n.toc.entries[0], 'child', { label: 'A section', path: 'OEBPS/text/chapter-1.xhtml', fragment: 's1' }), [[
        '\t\t\t<li><a href="text/chapter-1.xhtml">I. The Counting House</a></li>',
        '\t\t\t<li>\n\t\t\t\t<a href="text/chapter-1.xhtml">I. The Counting House</a>\n\t\t\t\t<ol>\n\t\t\t\t\t<li><a href="text/chapter-1.xhtml#s1">A section</a></li>\n\t\t\t\t</ol>\n\t\t\t</li>'
    ]]);
    assert.deepEqual(child.read.problems, []);
    // A second child goes into the existing sublist.
    const more = nvRun(child.files, (n) => Nav.addEntry(n, n.toc.entries[0], 'child', { label: 'B section', path: 'OEBPS/text/chapter-1.xhtml', fragment: 's2' }));
    assert.ok(more.text.indexOf('#s1">A section</a></li>\n\t\t\t\t\t<li><a href="text/chapter-1.xhtml#s2">B section</a></li>\n\t\t\t\t</ol>') !== -1, more.text);
    assert.deepEqual(Nav.entries(more.read.nav.toc).map((e) => e.depth), [0, 1, 1, 0]);
    // A one-line nav stays on one line.
    const flat = nvWithBody(nvToc(nvLink));
    const r = nvRun(flat, (n) => Nav.addEntry(n, n.toc.entries[0], 'child', { label: 'Sub', path: 'OEBPS/text/chapter-1.xhtml', fragment: 'x', children: [{ label: 'Deeper', path: 'OEBPS/text/chapter-1.xhtml', fragment: 'y' }] }));
    assert.ok(r.text.indexOf('<a href="text/chapter-1.xhtml">One</a><ol><li><a href="text/chapter-1.xhtml#x">Sub</a><ol><li><a href="text/chapter-1.xhtml#y">Deeper</a></li></ol></li></ol></li>') !== -1, r.text);
    assert.deepEqual(r.read.problems, []);
    // A span heading with no href, and an entry with epub:type.
    const typed = nvRun(files, (n) => Nav.addEntry(n, n.toc, 'append', { label: 'Back', types: ['backmatter'], children: [{ label: 'Notes', path: 'OEBPS/text/chapter-2.xhtml', types: 'endnotes' }] }));
    assert.ok(typed.text.indexOf('\t\t\t<li>\n\t\t\t\t<span>Back</span>\n\t\t\t\t<ol>\n\t\t\t\t\t<li><a epub:type="endnotes" href="text/chapter-2.xhtml">Notes</a></li>\n\t\t\t\t</ol>\n\t\t\t</li>\n') !== -1, typed.text);
    const one = nvRead(files).nav;
    nvThrows(() => Nav.addEntry(one, one.toc.entries[0], 'inside', c2), 'invalid-position');
});

test('nav: removing an entry takes its subtree, and an emptied sublist goes too', () => {
    const files = nvWithBody([
        '  <nav epub:type="toc" id="toc">',
        '    <ol>',
        '      <li>',
        '        <a href="text/chapter-1.xhtml">One</a>',
        '        <ol>',
        '          <li><a href="text/chapter-1.xhtml#a">A</a></li>',
        '        </ol>',
        '      </li>',
        '      <li><a href="text/chapter-1.xhtml#b">Two</a></li>',
        '    </ol>',
        '  </nav>'].join('\n'));
    assert.deepEqual(nvRead(files).problems, []);
    nvExpect(files, (n) => Nav.removeEntry(n, n.toc.entries[0]), [['      <li>\n        <a href="text/chapter-1.xhtml">One</a>\n        <ol>\n          <li><a href="text/chapter-1.xhtml#a">A</a></li>\n        </ol>\n      </li>\n', '']]);
    const r = nvExpect(files, (n) => Nav.removeEntry(n, n.toc.entries[0].children[0]), [['        <ol>\n          <li><a href="text/chapter-1.xhtml#a">A</a></li>\n        </ol>\n', '']]);
    assert.deepEqual(r.read.problems, []);
    const last = nvRun(nvWithBody(nvToc(nvLink)), (n) => Nav.removeEntry(n, n.toc.entries[0]));
    assert.deepEqual(last.read.problems.map((p) => p.code), ['nav-list-empty'], 'emptying the toc is a rule gap, reported');
});

test('nav: replaceList rewrites one list from a tree; toTree round-trips and reorders', () => {
    const files = nvFixtureBook();
    const n = nvRead(files).nav;
    const same = nvRun(files, (nav) => Nav.replaceList(nav, nav.toc, Nav.toTree(nav.toc)));
    assert.equal(same.text, files[NV], 'a list in the generated layout rebuilds to the same text');
    const tree = Nav.toTree(n.toc).reverse();
    tree[0].children = [{ label: 'Inside', path: 'OEBPS/text/chapter-2.xhtml', fragment: 'i' }];
    const r = nvRun(files, (nav) => Nav.replaceList(nav, nav.toc, tree));
    assert.ok(r.text.indexOf('\t\t<ol>\n\t\t\t<li>\n\t\t\t\t<a href="text/chapter-2.xhtml">II. Ink &amp; Ash</a>\n\t\t\t\t<ol>\n\t\t\t\t\t<li><a href="text/chapter-2.xhtml#i">Inside</a></li>\n\t\t\t\t</ol>\n\t\t\t</li>\n\t\t\t<li><a href="text/chapter-1.xhtml">I. The Counting House</a></li>\n\t\t</ol>\n\t</nav>') !== -1, r.text);
    assert.deepEqual(r.read.problems.map((p) => p.code), ['toc-order'], 'reversing the chapters is reported as a SHOULD');
    assert.equal(r.text.slice(r.text.indexOf('<nav epub:type="landmarks"')), files[NV].slice(files[NV].indexOf('<nav epub:type="landmarks"')), 'the other nav is untouched');
    const crlf = nvTemplate();
    crlf[NV] = crlf[NV].replace(/\n/g, '\r\n');
    const c = nvRun(crlf, (nav) => Nav.replaceList(nav, nav.toc, [{ label: 'A', path: 'OEBPS/text/chapter-1.xhtml', children: [{ label: 'B', path: 'OEBPS/text/chapter-1.xhtml', fragment: 'b' }] }]));
    assert.ok(!/[^\r]\n/.test(c.text), 'no bare LF');
    assert.deepEqual(c.read.problems, []);
});

test('nav: landmarks and the page list are set, added as hidden navs, and removed; the toc stays', () => {
    const files = nvTemplate();
    nvExpect(files, (n) => Nav.setLandmark(n, 'bodymatter', { path: 'OEBPS/text/chapter-1.xhtml', fragment: 'chapter-1' }, 'Begin'), [
        ['<a epub:type="bodymatter" href="text/chapter-1.xhtml">Start of content</a>', '<a epub:type="bodymatter" href="text/chapter-1.xhtml#chapter-1">Begin</a>']
    ]);
    const added = nvExpect(files, (n) => Nav.setLandmark(n, 'toc', { path: NV, fragment: 'toc' }, 'Contents'), [
        ['Start of content</a></li>\n', 'Start of content</a></li>\n      <li><a epub:type="toc" href="nav.xhtml#toc">Contents</a></li>\n']
    ]);
    assert.deepEqual(added.read.nav.landmarks.entries.map((e) => e.types[0]), ['bodymatter', 'toc']);
    nvExpect(added.files, (n) => Nav.removeLandmark(n, 'toc'), [['      <li><a epub:type="toc" href="nav.xhtml#toc">Contents</a></li>\n', '']]);
    const noLandmarks = nvRun(files, (n) => Nav.removeLandmark(n, 'bodymatter'));
    assert.equal(noLandmarks.read.nav.landmarks, null, 'the last landmark takes its nav');
    assert.equal(noLandmarks.text.indexOf('landmarks'), -1);
    const back = nvRun(noLandmarks.files, (n) => Nav.setLandmark(n, 'bodymatter', { path: 'OEBPS/text/chapter-1.xhtml' }, 'Start of content'));
    assert.equal(back.text, files[NV], 'adding it back writes the template\'s own markup');
    assert.deepEqual(nvRun(files, (n) => Nav.removeLandmark(n, 'index')).edits, []);
    const pages = nvRun(files, (n) => Nav.setPageList(n, [{ label: 'i', path: 'OEBPS/text/chapter-1.xhtml', fragment: 'p-i' }, { label: '1', path: 'OEBPS/text/chapter-1.xhtml', fragment: 'p1' }]));
    assert.ok(pages.text.indexOf('  </nav>\n  <nav epub:type="page-list" role="doc-pagelist" id="page-list" hidden="">\n    <ol>\n      <li><a href="text/chapter-1.xhtml#p-i">i</a></li>\n      <li><a href="text/chapter-1.xhtml#p1">1</a></li>\n    </ol>\n  </nav>\n</body>') !== -1, pages.text);
    assert.deepEqual(pages.read.problems, []);
    const again = nvRun(pages.files, (n) => Nav.setPageList(n, [{ label: '2', path: 'OEBPS/text/chapter-1.xhtml', fragment: 'p2' }]));
    assert.deepEqual(again.read.nav.pageList.entries.map((e) => e.label), ['2']);
    const gone = nvRun(pages.files, (n) => Nav.removeNav(n, n.pageList));
    assert.equal(gone.text, files[NV]);
    const one = nvRead(files).nav;
    nvThrows(() => Nav.removeNav(one, one.toc), 'nav-toc-required');
    nvThrows(() => Nav.setLandmark(nvRead(files).nav, 'two words', { path: NV }), 'invalid-type');
    // Without an epub prefix in scope, new navs and typed links declare it.
    const bare = nvWithBody(nvToc(nvLink));
    bare[NV] = bare[NV].replace(' xmlns:epub="http://www.idpf.org/2007/ops"', '').replace('<nav epub:type="toc"', '<nav xmlns:e="http://www.idpf.org/2007/ops" e:type="toc"');
    const lm = nvRun(bare, (n) => Nav.setLandmark(n, 'bodymatter', { path: 'OEBPS/text/chapter-1.xhtml' }));
    assert.ok(lm.text.indexOf('<nav epub:type="landmarks" xmlns:epub="http://www.idpf.org/2007/ops" id="landmarks" hidden="">') !== -1, lm.text);
    assert.deepEqual(lm.read.problems, []);
    assert.equal(lm.read.nav.landmarks.entries[0].types[0], 'bodymatter');
});

test('nav: a new entry beside another uses the prefixes of their parent, not ones declared on the sibling', () => {
    const files = nvTemplate();
    files[NV] = files[NV].replace('<li><a epub:type', '<li xmlns:x="http://www.idpf.org/2007/ops"><a x:type');
    const r = nvRun(files, (n) => Nav.addEntry(n, n.landmarks.entries[0], 'after', { label: 'Contents', path: NV, fragment: 'toc', types: ['toc'] }));
    assert.ok(r.text.indexOf('<li><a epub:type="toc" href="nav.xhtml#toc">Contents</a></li>') !== -1, r.text);
    assert.deepEqual(r.read.nav.landmarks.entries.map((e) => e.types), [['bodymatter'], ['toc']]);
});

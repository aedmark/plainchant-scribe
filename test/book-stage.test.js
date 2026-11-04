const bsTemplate = () => BookTemplate.create({ uuid: '0f3c2a1e-6b7d-4e2a-9c1b-8a5d4f3e2b10', now: Date.UTC(2026, 10, 3) }).files;
const BS_CH = 'OEBPS/text/chapter-1.xhtml';

test('book-stage: books are told apart from web pages, and the chapter is the preferred one or the first in the spine (P2-01)', () => {
    const files = ExampleBook.create().files;
    assert.ok(BookStage.isBook(files));
    assert.ok(!BookStage.isBook(Project.starter().entries));
    assert.deepEqual(BookStage.chapters(files), ['OEBPS/text/chapter-1.xhtml', 'OEBPS/text/chapter-2.xhtml', 'OEBPS/text/chapter-3.xhtml']);
    assert.equal(BookStage.chapterFor(files, null), 'OEBPS/text/chapter-1.xhtml');
    assert.equal(BookStage.chapterFor(files, 'OEBPS/text/chapter-3.xhtml'), 'OEBPS/text/chapter-3.xhtml');
    assert.equal(BookStage.chapterFor(files, 'OEBPS/nav.xhtml'), 'OEBPS/nav.xhtml', 'the nav is an XHTML document too');
    assert.equal(BookStage.chapterFor(files, 'OEBPS/content.opf'), 'OEBPS/text/chapter-1.xhtml');
    const reordered = Object.assign({}, files);
    reordered['OEBPS/content.opf'] = XmlAst.applyEdits(files['OEBPS/content.opf'], OpfEdit.moveItemref(Book.read(files).model, 'chapter-3', 0));
    assert.equal(BookStage.chapterFor(reordered, null), 'OEBPS/text/chapter-3.xhtml', 'spine order, not file order');
    const broken = Object.assign({}, files, { 'OEBPS/content.opf': '<package' });
    assert.equal(BookStage.chapterFor(broken, null), 'OEBPS/nav.xhtml', 'with no readable spine, the first XHTML file by name');
    assert.equal(BookStage.chapterFor(Project.starter().entries, null), null);
});

test('book-stage: assemble inlines the book\'s stylesheets, follows @import, and points assets at Blob URLs', () => {
    const files = bsTemplate();
    files['OEBPS/css/book.css'] = '@import "fonts.css" screen;\n@import url(missing.css);\nbody { background: url(../images/paper.png); }\n';
    files['OEBPS/css/fonts.css'] = '@import "book.css";\n@font-face { font-family: Book; src: url("../fonts/book.woff2"); }\n';
    files[BS_CH] = files[BS_CH].replace('<p>Begin writing here.</p>', '<p><img src="../images/a%20b.png" alt="A"/><a href="#chapter-1">top</a><a href="chapter-2.xhtml">next</a><a href="../images/paper.png">plate</a></p>\n    <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><image xlink:href="../images/paper.png"/></svg>\n    <p style="background: url(\'../images/paper.png\')">styled</p>');
    const urls = { 'OEBPS/images/paper.png': 'blob:paper', 'OEBPS/images/a b.png': 'blob:ab', 'OEBPS/fonts/book.woff2': 'blob:font' };
    const r = BookStage.assemble(files, BS_CH, urls);
    assert.ok(r.ok);
    const ast = XmlAst.parse(r.xhtml);
    assert.deepEqual(ast.errors, [], 'the result is still well-formed XHTML');
    assert.equal(XmlAst.find(ast, 'link'), null, 'the stylesheet link is replaced');
    const css = XmlAst.textContent(XmlAst.find(ast, 'style'));
    assert.ok(css.indexOf('@media screen {\n@import "book.css";\n@font-face { font-family: Book; src: url("blob:font"); }') !== -1, 'the import is inlined once, with its media, and a cycle stops: ' + css);
    assert.ok(css.indexOf('@import url(missing.css);') !== -1, 'an import of a file not in the book is left');
    assert.ok(css.indexOf('url("blob:paper")') !== -1);
    assert.ok(r.xhtml.indexOf('<img src="blob:ab" alt="A"/>') !== -1, 'percent-encoded paths resolve');
    assert.ok(r.xhtml.indexOf('<a href="#chapter-1">top</a><a href="chapter-2.xhtml">next</a><a href="../images/paper.png">plate</a>') !== -1, 'links are not rewritten');
    assert.ok(r.xhtml.indexOf('xlink:href="blob:paper"') !== -1);
    assert.ok(r.xhtml.indexOf('style="background: url(&quot;blob:paper&quot;)"') !== -1);
    assert.ok(files[BS_CH].indexOf('blob:') === -1, 'the book file itself is unchanged');
});

test('book-stage: scripts, event handlers, and javascript: URLs never reach the Stage', () => {
    const files = bsTemplate();
    files[BS_CH] = files[BS_CH].replace('<p>Begin writing here.</p>', '<p onclick="steal()" title="kept">x<script>steal()</script></p>\n    <a href="javascript:steal()">bad</a>\n    <svg xmlns="http://www.w3.org/2000/svg"><script>steal()</script><a href=" JavaScript:steal()" onload="x"><text>t</text></a></svg>')
        .replace('</head>', '<script src="evil.js"></script>\n</head>');
    const r = BookStage.assemble(files, BS_CH, {});
    assert.ok(r.ok);
    assert.equal(/script|onclick|onload|javascript/i.test(r.xhtml), false, r.xhtml);
    assert.ok(r.xhtml.indexOf('<p title="kept">x</p>') !== -1);
    assert.deepEqual(XmlAst.parse(r.xhtml).errors, []);
});

test('book-stage: a prefixed XHTML link keeps its prefix, a missing stylesheet is dropped, and broken chapters give errors', () => {
    const files = bsTemplate();
    files[BS_CH] = '<?xml version="1.0" encoding="UTF-8"?>\n<h:html xmlns:h="http://www.w3.org/1999/xhtml"><h:head><h:title>T</h:title><h:link rel="Stylesheet" href="../css/book.css" media="screen"/><h:link rel="stylesheet" href="../css/gone.css"/></h:head><h:body><h:p>x</h:p></h:body></h:html>\n';
    const r = BookStage.assemble(files, BS_CH, {});
    assert.ok(r.ok);
    assert.ok(/<h:style media="screen">[\s\S]*text-indent[\s\S]*<\/h:style><\/h:head>/.test(r.xhtml), r.xhtml);
    const broken = BookStage.assemble(Object.assign({}, files, { [BS_CH]: '<html><p></html>' }), BS_CH, {});
    assert.equal(broken.ok, false);
    assert.ok(broken.errors.length && typeof broken.errors[0].line === 'number');
    assert.equal(BookStage.assemble(files, 'OEBPS/none.xhtml', {}).ok, false);
});

test('example-book: three chapters made with the template, OpfEdit, and Nav, clean by every Scribe check', () => {
    const a = ExampleBook.create({ uuid: '0f3c2a1e-6b7d-4e2a-9c1b-8a5d4f3e2b10', now: Date.UTC(2026, 10, 4) });
    const r = Book.read(a.files);
    assert.deepEqual(r.problems, []);
    assert.equal(r.model.metadata.title, ExampleBook.TITLE);
    assert.deepEqual(r.model.metadata.creators.map((c) => c.value), ['Plainchant Scribe']);
    const nav = Nav.read(a.files, r.model);
    assert.deepEqual(nav.problems, []);
    assert.deepEqual(nav.nav.toc.entries.map((e) => [e.label, e.target.path]), [
        ['A Book Is a Folder of Files', 'OEBPS/text/chapter-1.xhtml'], ['Chapters and Contents', 'OEBPS/text/chapter-2.xhtml'], ['A Page of Typical Elements', 'OEBPS/text/chapter-3.xhtml']
    ]);
    Object.keys(a.files).filter((p) => /\.xhtml$/.test(p)).forEach((p) => assert.deepEqual(Xhtml.check(a.files[p], { path: p }).problems, [], p));
    assert.deepEqual(Object.keys(a.files).filter((p) => /chapter/.test(p)).map((p) => /<title>([^<]*)/.exec(a.files[p])[1]), ['A Book Is a Folder of Files', 'Chapters and Contents', 'A Page of Typical Elements']);
    assert.deepEqual(a.dirs, ['OEBPS/images', 'OEBPS/fonts']);
});

test('project: a book saves and reloads without web-page files, keeps its folders, and is titled from its package', () => {
    const made = ExampleBook.create();
    let tree = Project.deriveTree(made.files, null, []);
    made.dirs.forEach((d) => { tree = Project.treeAfter(tree, { type: 'mkdir', path: d }); });
    const files = { html: made.files[BS_CH], css: made.files['OEBPS/css/book.css'] + '/* edited */', js: '', activeHtml: BS_CH, activeCss: 'OEBPS/css/book.css', entries: made.files, tree: tree };
    assert.deepEqual(Object.keys(Project.normalizeEntries(files)).sort(), Object.keys(made.files).sort(), 'no index.html, styles.css, or script.js');
    const back = Project.unpack(Project.pack(files));
    assert.deepEqual(Object.keys(back.entries).sort(), Object.keys(made.files).sort());
    assert.ok(back.entries['OEBPS/css/book.css'].endsWith('/* edited */'), 'the open stylesheet\'s mirror is written back');
    assert.deepEqual(back.tree.filter((t) => t.kind === 'dir').map((t) => t.path), ['META-INF', 'OEBPS', 'OEBPS/css', 'OEBPS/fonts', 'OEBPS/images', 'OEBPS/text']);
    assert.equal(Project.extractTitle(files), ExampleBook.TITLE);
    const amp = Object.assign({}, made.files, { 'OEBPS/content.opf': made.files['OEBPS/content.opf'].replace(ExampleBook.TITLE, 'Ink &amp; Ash') });
    assert.equal(Project.extractTitle({ entries: amp }), 'Ink & Ash');
    assert.equal(Project.extractTitle({ entries: bsTemplate() }), 'Untitled Book');
    const web = Project.unpack(Project.pack(Project.starter()));
    assert.ok('index.html' in web.entries && !Project.isBookEntries(web.entries), 'web pages pack as before');
});

test('book-stage: reader settings fall back to defaults, write forced margins and theme colours, and keep book link colours (P2-02)', () => {
    assert.deepEqual(BookStage.readerPrefs(), { size: 100, margins: 'normal', theme: 'light', mode: 'paged', device: 'fit', orientation: 'portrait' });
    assert.deepEqual(BookStage.readerPrefs({ size: 120, margins: 'huge', theme: 'sepia', mode: 'flip', device: 'watch', orientation: 'sideways' }), { size: 100, margins: 'normal', theme: 'sepia', mode: 'paged', device: 'fit', orientation: 'portrait' }, 'only listed sizes and names');
    const css = BookStage.readerCss({ size: 150, margins: 'wide', theme: 'dark', mode: 'scroll' });
    assert.ok(css.indexOf('html, body { background-color: #121212 !important; color: #e0e0e0 !important; }') !== -1, css);
    assert.ok(css.indexOf('body { margin: 0 !important; padding: 1.5em 3em !important; }') !== -1);
    assert.ok(/a:link, a:visited \{ color: #8ab4f8; \}/.test(css), 'the theme\'s link colour, without !important, so a book\'s own wins');
    assert.equal(/font-size/.test(css), false, 'text size is applied on load from the book\'s computed root size, not here');
    assert.equal(/a:link/.test(BookStage.readerCss({ theme: 'light' })), false, 'light keeps the browser\'s link colours');
    // WCAG 2 relative luminance: text and links must reach 4.5:1 on each theme's page.
    const lum = (hex) => {
        const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
        return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };
    const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    Object.keys(BookStage.READER.themes).forEach((name) => {
        const t = BookStage.READER.themes[name];
        assert.ok(ratio(t.text, t.page) >= 4.5, name + ' text ' + ratio(t.text, t.page).toFixed(2));
        if (t.link) assert.ok(ratio(t.link, t.page) >= 4.5, name + ' links ' + ratio(t.link, t.page).toFixed(2));
    });
});

test('book-stage: the reader style goes last in <head>, after the book\'s inlined styles, and the book file is unchanged', () => {
    const files = bsTemplate();
    const css = BookStage.readerCss({ theme: 'sepia' });
    const r = BookStage.assemble(files, BS_CH, {}, { css: css });
    const ast = XmlAst.parse(r.xhtml);
    assert.deepEqual(ast.errors, []);
    const head = XmlAst.find(ast, 'head');
    const styles = XmlAst.elementChildren(head).filter((el) => el.local === 'style');
    assert.equal(styles.length, 2);
    assert.equal(XmlAst.getAttr(styles[1], 'id'), 'scribe-reader');
    assert.equal(XmlAst.textContent(styles[1]), css);
    assert.equal(XmlAst.elementChildren(head).slice(-1)[0], styles[1], 'last, so it follows the book\'s styles');
    assert.equal(files[BS_CH].indexOf('scribe-reader'), -1);
    const prefixed = '<?xml version="1.0"?>\n<h:html xmlns:h="http://www.w3.org/1999/xhtml"><h:head/><h:body><h:p>x</h:p></h:body></h:html>';
    const p = BookStage.assemble({ [BS_CH]: prefixed }, BS_CH, {}, { css: 'p{}' });
    assert.ok(p.xhtml.indexOf('<h:head><h:style id="scribe-reader">p{}</h:style></h:head>') !== -1, p.xhtml);
    const headless = BookStage.assemble({ [BS_CH]: '<html xmlns="http://www.w3.org/1999/xhtml"><body><p>x</p></body></html>' }, BS_CH, {}, { css: 'a < b' });
    assert.ok(headless.xhtml.indexOf('<html xmlns="http://www.w3.org/1999/xhtml"><style id="scribe-reader">a &lt; b</style><body>') !== -1, headless.xhtml);
    assert.deepEqual(XmlAst.parse(headless.xhtml).errors, []);
});

test('book-stage: paged mode lays the body out in columns exactly one viewport wide; scroll mode has none (P2-03)', () => {
    const paged = BookStage.readerCss({ margins: 'wide', mode: 'paged' });
    assert.ok(paged.indexOf('html { height: 100% !important; overflow: hidden !important; }') !== -1, paged);
    // Column width plus gap is 100vw, so page n starts at n viewport widths.
    assert.ok(paged.indexOf('column-width: calc(100vw - calc(2 * 3em)) !important; column-gap: calc(2 * 3em) !important;') !== -1, paged);
    assert.ok(paged.indexOf('height: 100vh !important') !== -1 && paged.indexOf('column-fill: auto') !== -1);
    assert.ok(paged.indexOf('max-height: calc(100vh - 2 * 1.5em)') !== -1, 'media fit within one page');
    assert.ok(BookStage.readerCss({ margins: 'none' }).indexOf('padding: 0 !important; }') !== -1);
    assert.ok(BookStage.readerCss({ margins: 'none' }).indexOf('column-gap: calc(2 * 0em)') !== -1);
    const scroll = BookStage.readerCss({ mode: 'scroll' });
    assert.equal(/column|overflow|100vh/.test(scroll), false, scroll);
    assert.ok(scroll.indexOf('padding: 1em 1.5em !important;') !== -1);
    const r = BookStage.assemble(bsTemplate(), BS_CH, {}, { css: paged });
    assert.deepEqual(XmlAst.parse(r.xhtml).errors, []);
});

test('book-stage: device presets give their screen size, turn for landscape, scale down to fit, and e-ink stops animation (P2-04)', () => {
    assert.equal(BookStage.deviceSize({ device: 'fit' }), null);
    assert.deepEqual(BookStage.deviceSize({ device: 'phone' }), { width: 390, height: 844, greyscale: false, label: 'Phone' });
    assert.deepEqual(BookStage.deviceSize({ device: 'eink' }), { width: 600, height: 800, greyscale: true, label: 'E-ink 6"' });
    assert.deepEqual(BookStage.deviceSize({ device: 'tablet', orientation: 'landscape' }), { width: 1180, height: 820, greyscale: false, label: 'Tablet' });
    const eink = BookStage.deviceSize({ device: 'eink' });
    assert.equal(BookStage.fitScale(eink, 300, 2000), 0.5, 'limited by width');
    assert.equal(BookStage.fitScale(eink, 2000, 400), 0.5, 'limited by height');
    assert.equal(BookStage.fitScale(eink, 2000, 2000), 1, 'never scaled up');
    assert.equal(BookStage.fitScale(null, 10, 10), 1);
    assert.equal(BookStage.fitScale(eink, 0, 0), 1, 'a hidden Stage is left alone');
    const still = '*, *::before, *::after { animation: none !important; transition: none !important; }';
    assert.ok(BookStage.readerCss({ device: 'eink' }).indexOf(still) !== -1);
    ['fit', 'phone', 'tablet'].forEach((d) => assert.equal(BookStage.readerCss({ device: d }).indexOf('animation'), -1, d));
    assert.ok(/data-device="eink"\] #stageFrame \{ filter: grayscale\(1\); \}/.test(require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'styles.css'), 'utf8')), 'e-ink greyscale is a filter on the frame');
});

test('book-stage: next and previous chapter follow the spine and skip non-linear items (P2-05)', () => {
    const files = ExampleBook.create().files;
    const c = (n) => 'OEBPS/text/chapter-' + n + '.xhtml';
    assert.deepEqual(BookStage.readingOrder(files).map((o) => [o.path, o.linear]), [[c(1), true], [c(2), true], [c(3), true]]);
    assert.equal(BookStage.neighbour(files, c(1), 1), c(2));
    assert.equal(BookStage.neighbour(files, c(2), -1), c(1));
    assert.equal(BookStage.neighbour(files, c(1), -1), null, 'the first chapter has no previous');
    assert.equal(BookStage.neighbour(files, c(3), 1), null);
    assert.equal(BookStage.neighbour(files, 'OEBPS/nav.xhtml', 1), c(1), 'from outside the spine, next is the first chapter');
    assert.equal(BookStage.neighbour(files, 'OEBPS/nav.xhtml', -1), null);
    const aux = Object.assign({}, files);
    aux['OEBPS/content.opf'] = files['OEBPS/content.opf'].replace('<itemref idref="chapter-2"/>', '<itemref idref="chapter-2" linear="no"/>');
    assert.equal(BookStage.neighbour(aux, c(1), 1), c(3), 'linear="no" is skipped');
    assert.equal(BookStage.neighbour(aux, c(2), 1), c(3), 'but from it, reading goes on');
    assert.equal(BookStage.neighbour(aux, c(3), -1), c(1));
});

test('book-stage: links are told apart: same chapter, another chapter, a book file, missing, external, invalid', () => {
    const files = ExampleBook.create().files;
    const from = 'OEBPS/text/chapter-1.xhtml';
    const kind = (href, assets) => { const t = BookStage.linkTarget(files, from, href, assets); return [t.kind, t.path, t.fragment]; };
    assert.deepEqual(kind('#top'), ['fragment', from, 'top']);
    assert.deepEqual(kind('chapter-1.xhtml#s%C3%A9c'), ['fragment', from, 's\u00E9c']);
    assert.deepEqual(kind('chapter-3.xhtml#note-1'), ['chapter', 'OEBPS/text/chapter-3.xhtml', 'note-1']);
    assert.deepEqual(kind('../nav.xhtml'), ['chapter', 'OEBPS/nav.xhtml', null]);
    assert.deepEqual(kind('../css/book.css'), ['file', 'OEBPS/css/book.css', null]);
    assert.deepEqual(kind('../images/a.png', ['OEBPS/images/a.png']), ['file', 'OEBPS/images/a.png', null], 'binary assets count as book files');
    assert.deepEqual(kind('gone.xhtml'), ['missing', 'OEBPS/text/gone.xhtml', null]);
    assert.deepEqual(kind('https://example.org/'), ['external', null, null]);
    assert.deepEqual(kind('mailto:a@example.org'), ['external', null, null]);
    assert.deepEqual(kind('../../../x.xhtml'), ['invalid', null, null]);
});

test('book-stage: the contents tree comes from the nav toc, with nesting and headings', () => {
    assert.deepEqual(BookStage.contents(ExampleBook.create().files).map((e) => [e.label, e.path, e.fragment, e.children.length]), [
        ['A Book Is a Folder of Files', 'OEBPS/text/chapter-1.xhtml', null, 0], ['Chapters and Contents', 'OEBPS/text/chapter-2.xhtml', null, 0], ['A Page of Typical Elements', 'OEBPS/text/chapter-3.xhtml', null, 0]
    ]);
    const files = bsTemplate();
    files['OEBPS/nav.xhtml'] = files['OEBPS/nav.xhtml'].replace('<li><a href="text/chapter-1.xhtml">Chapter 1</a></li>', '<li><span>Part One</span><ol><li><a href="text/chapter-1.xhtml#s1">Section</a></li></ol></li>');
    assert.deepEqual(BookStage.contents(files), [{ label: 'Part One', path: null, fragment: null, children: [{ label: 'Section', path: 'OEBPS/text/chapter-1.xhtml', fragment: 's1', children: [] }] }]);
    assert.deepEqual(BookStage.contents(Object.assign({}, files, { 'OEBPS/nav.xhtml': '<broken' })), []);
    assert.deepEqual(BookStage.contents(Project.starter().entries), []);
});

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

const clCodes = (problems) => problems.map((p) => p.line + ' ' + p.severity + ' ' + p.code);

test('css-lint: EPUB 3.3 forbids direction and unicode-bidi in style sheets (P4-06)', () => {
    const css = 'p {\n  direction: rtl;\n  unicode-bidi: embed;\n}\n';
    const r = CssLint.checkCss(css);
    assert.deepEqual(clCodes(r), ['2 error css-direction', '3 error css-unicode-bidi']);
    assert.equal(css.slice(r[0].start, r[0].end), 'direction: rtl;');
    assert.ok(r.every((p) => p.category === 'stylesheets'));
    assert.deepEqual(CssLint.checkCss('/* direction: rtl; */\np { writing-mode: vertical-rl; }'), [], 'comments and other properties are fine');
});

test('css-lint: layout that fights the reader’s pages', () => {
    const css = '.a { position: absolute; }\n.b { position: fixed; }\n.c { position: relative; }\nimg { width: 600px; max-width: 100%; }\n.d { width: 50%; height: 0px; }\n.e { min-height: 100vh; max-height: 90vh; }\n.f { overflow: hidden; overflow-x: auto; }\n.g { column-count: 2; columns: auto; }\n';
    assert.deepEqual(clCodes(CssLint.checkCss(css)), ['1 warning css-position', '2 warning css-position', '4 warning css-fixed-size', '6 warning css-viewport-height', '7 warning css-overflow', '8 warning css-columns']);
});

test('css-lint: values that override the reader’s settings', () => {
    const css = 'p { font-size: 12px; }\nh1 { font: bold 18pt/1.2 serif; }\nsmall { font-size: 0.8em; }\np { line-height: 20px; }\nblockquote { line-height: 1.4; }\np { margin: 0 !important; }\nbody { color: #222; background-color: white; }\nh2 { color: maroon; }\n.note p, main { background: #eee; }\np { color: inherit; }\n';
    assert.deepEqual(clCodes(CssLint.checkCss(css)), ['1 warning css-font-size', '2 warning css-font-size', '4 warning css-line-height', '6 warning css-important', '7 warning css-text-colour', '7 warning css-text-colour', '9 warning css-text-colour']);
});

test('css-lint: features older readers handle badly', () => {
    const css = '@import url("more.css");\n.grid { display: grid; }\n.row { display: inline-flex; }\na:hover { text-decoration: underline; }\nh1 { font-size: 5vw; }\n@font-face { font-family: X; src: url(https://example.com/x.woff2); }\n.bg { background-image: url("//cdn.example/a.png"); }\n.ok { background-image: url("../images/a.png"); }\np { color: red; }\n';
    const r = CssLint.checkCss(css);
    assert.deepEqual(clCodes(r), ['1 warning css-import', '2 warning css-display', '3 warning css-display', '4 warning css-hover', '5 warning css-font-size-viewport', '6 warning css-remote-url', '7 warning css-remote-url', '9 warning css-text-colour']);
    assert.equal(css.slice(r[3].start, r[3].end), 'a:hover');
    assert.equal(css.slice(r[0].start, r[0].end), '@import url("more.css");');
    assert.deepEqual(clCodes(CssLint.checkCss('@import url("https://example.com/a.css");\np { margin: 0; }')), ['1 warning css-import'], 'a remote @import is reported once');
    assert.deepEqual(CssLint.checkCss('/* @import "old.css"; url(https://example.com/a.png) */\nbody { background: url("../images/paper.png"); }'), [], 'commented-out text and a background image are fine');
});

test('css-lint: style attributes in chapters are checked with offsets into the chapter', () => {
    const x = '<html xmlns="http://www.w3.org/1999/xhtml"><body>\n<p style="font-size: 14px; color: black">a</p>\n<p style="font-family: &quot;A&quot;; position: fixed">b</p>\n<p style="">c</p></body></html>';
    const r = CssLint.checkInline(x);
    assert.deepEqual(clCodes(r), ['2 warning css-font-size', '2 warning css-text-colour', '3 warning css-position']);
    assert.deepEqual(r.map((p) => x.slice(p.start, p.end)), ['font-size: 14px;', 'color: black', 'position: fixed']);
    assert.deepEqual(CssLint.checkInline('<p style="x'), [], 'a chapter that is not well-formed is left to the XHTML check');
});

test('css-lint: Scribe’s own books and layout block pass, and the checker covers book files only', () => {
    const files = ExampleBook.create().files;
    let css = files['OEBPS/css/book.css'];
    css = BookStyle.apply(css, Object.assign({}, BookStyle.PRESETS.novel.settings, { headingAlign: 'center', headingDrop: 'third', dropCap: 3, firstLineCaps: true, sceneBreak: 'fleuron', smallCaps: true, noteStyle: true, blocks: true, notes: 'endnotes',
        fonts: [{ family: 'Lora', weight: 400, style: 'normal', src: '../fonts/Lora.ttf' }], bodyFont: 'Lora' }), 'en');
    assert.deepEqual(CssLint.checkCss(css), [], 'the layout block with every setting');
    [BookTemplate.create().files, files].forEach((book) => Object.keys(book).filter((p) => /\.(css|xhtml)$/.test(p)).forEach((p) => {
        assert.deepEqual(/\.css$/.test(p) ? CssLint.checkCss(book[p]) : CssLint.checkInline(book[p]), [], p);
    }));
    const cover = BookCover.set(files, 'OEBPS/images/c.png', ['OEBPS/images/c.png']).entries;
    Object.keys(cover).filter((p) => /\.xhtml$/.test(p)).forEach((p) => assert.deepEqual(CssLint.checkInline(cover[p]), [], p));
    const checker = CssLint.createChecker();
    const r = checker.check({ 'a.css': 'p { font-size: 12px; }', 'b.html': '<p style="font-size: 12px">x</p>', 'c.xhtml': '<p xmlns="http://www.w3.org/1999/xhtml" style="direction: rtl">x</p>' });
    assert.deepEqual(r.problems.map((p) => p.file + ' ' + p.code), ['a.css css-font-size', 'c.xhtml css-direction']);
    assert.equal(checker.check({ 'a.css': 'p { font-size: 12px; }' }).problems[0].file, 'a.css', 'cached results keep their file');
});

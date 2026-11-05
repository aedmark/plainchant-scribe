const bkBook = () => ExampleBook.create({ uuid: '0f3c2a1e-6b7d-4e2a-9c1b-8a5d4f3e2b10', now: Date.UTC(2026, 10, 4) }).files;
const bkCh = (n) => 'OEBPS/text/chapter-' + n + '.xhtml';
const bkP = (text, k) => XmlAst.parse(text).elements.filter((e) => e.local === 'p')[k].start;
const BK_IMG = 'OEBPS/images/map of the town.png';
const bkInsert = (kind, opts, k) => { const f = bkBook(); return BookBlocks.insert(f, bkCh(1), bkP(f[bkCh(1)], k || 0), kind, opts, [BK_IMG]).entries; };
const bkClean = (f) => {
    assert.deepEqual(Xhtml.check(f[bkCh(1)], { path: bkCh(1) }).problems, []);
    assert.deepEqual(Book.read(f, { assets: [BK_IMG] }).problems.map((p) => p.severity + ' ' + p.code), []);
};

test('book-blocks: a figure goes after the selected paragraph, with its image in the manifest (P4-05)', () => {
    const f = bkInsert('figure', { image: BK_IMG, alt: 'A map of "the" town & river', caption: 'The town <then>.' });
    const t = f[bkCh(1)];
    assert.ok(t.indexOf('the whole book.</p>\n    <figure class="figure">\n      <img src="../images/map%20of%20the%20town.png" alt="A map of &quot;the&quot; town &amp; river"/>\n      <figcaption>The town &lt;then&gt;.</figcaption>\n    </figure>\n    <ul>') !== -1, t);
    const item = Book.read(f, { assets: [BK_IMG] }).model.manifest.items.find((i) => i.path === BK_IMG);
    assert.deepEqual([item.id, item.mediaType], ['map-of-the-town', 'image/png']);
    bkClean(f);
    const again = BookBlocks.insert(f, bkCh(1), bkP(f[bkCh(1)], 0), 'figure', { image: BK_IMG, decorative: true }, [BK_IMG]).entries;
    assert.equal(again['OEBPS/content.opf'], f['OEBPS/content.opf'], 'an image already listed is not listed twice');
    assert.ok(/<img src="[^"]+" alt=""\/>\n {4}<\/figure>/.test(again[bkCh(1)]), 'a decorative image has empty alt and no caption');
    assert.throws(() => bkInsert('figure', { image: BK_IMG, alt: ' ' }), /Describe the image/);
    assert.throws(() => bkInsert('figure', { image: 'OEBPS/images/none.png', alt: 'x' }), /not in the book/);
    assert.throws(() => bkInsert('figure', { image: 'OEBPS/text/chapter-2.xhtml', alt: 'x' }), /JPEG, PNG/);
});

test('book-blocks: a table has a caption, a header row of column headings, and empty cells', () => {
    const f = bkInsert('table', { rows: 2, cols: 3, header: true, caption: 'Files & folders' });
    const t = f[bkCh(1)];
    assert.ok(t.indexOf('<table class="table">\n      <caption>Files &amp; folders</caption>\n      <thead>\n        <tr>\n          <th scope="col">Column 1</th>') !== -1, t);
    assert.equal((t.match(/<tr><td><\/td><td><\/td><td><\/td><\/tr>/g) || []).length, 2);
    bkClean(f);
    assert.ok(BookBlocks.table(1, 1, '', false).indexOf('<thead>') === -1, 'no header row when asked');
    [[0, 2], [51, 2], [2, 11], ['x', 2]].forEach(([r, c]) => assert.throws(() => BookBlocks.table(r, c), /1 to 50 rows/));
});

test('book-blocks: a poem keeps stanzas, lines, and indents', () => {
    const f = bkInsert('poem', { text: 'The first line,\n  indented & second;\n\n\nA new stanza.\r\n' });
    const t = f[bkCh(1)];
    assert.ok(t.indexOf('<div class="poem">\n      <div class="stanza">\n        <p class="line">The first line,</p>\n        <p class="line indent">indented &amp; second;</p>\n      </div>\n      <div class="stanza">\n        <p class="line">A new stanza.</p>\n      </div>\n    </div>') !== -1, t);
    bkClean(f);
    assert.throws(() => BookBlocks.poem(' \n\n '), /lines/);
});

test('book-blocks: a quote is a blockquote, with any attribution in a figure caption outside it', () => {
    assert.equal(BookBlocks.quote('One\nline.\n\nTwo.'), '<blockquote>\n  <p>One line.</p>\n  <p>Two.</p>\n</blockquote>');
    const f = bkInsert('quote', { text: 'Books are <files>.', attribution: 'A reader' });
    assert.ok(f[bkCh(1)].indexOf('<figure class="quote">\n      <blockquote>\n        <p>Books are &lt;files&gt;.</p>\n      </blockquote>\n      <figcaption>— A reader</figcaption>\n    </figure>') !== -1, f[bkCh(1)]);
    bkClean(f);
    assert.throws(() => BookBlocks.quote(''), /quotation/);
});

test('book-blocks: placement climbs out of inline markup, appends to a selected section, and refuses the head', () => {
    const b = bkBook(), t = b[bkCh(1)];
    const code = XmlAst.parse(t).elements.find((e) => e.local === 'code').start;
    const inLi = BookBlocks.insert(b, bkCh(1), code, 'quote', { text: 'Q' }).entries[bkCh(1)];
    assert.ok(inLi.indexOf('is an EPUB.</li>\n      <blockquote>') !== -1, 'after the list item holding the code');
    const section = XmlAst.parse(t).elements.find((e) => e.local === 'section').start;
    assert.ok(/<\/blockquote>\n  <\/section>/.test(BookBlocks.insert(b, bkCh(1), section, 'quote', { text: 'Q' }).entries[bkCh(1)]), 'at the end of the section');
    const title = XmlAst.parse(t).elements.find((e) => e.local === 'title').start;
    assert.throws(() => BookBlocks.insert(b, bkCh(1), title, 'quote', { text: 'Q' }), /Select a paragraph/);
    assert.throws(() => BookBlocks.insert(b, bkCh(1), bkP(t, 0), 'chart', {}), /Unknown/);
});

test('book-blocks: the reflow-safe styling is one switch in the layout block', () => {
    const css = bkBook()['OEBPS/css/book.css'];
    const s = Object.assign(BookStyle.normalise(BookStyle.PRESETS.novel.settings), { blocks: true });
    const out = BookStyle.apply(css, s, 'en');
    ['figure.figure img {\n  max-width: 100%;\n  max-height: 90vh;\n  height: auto;\n}', 'table.table tr {\n  page-break-inside: avoid;\n  break-inside: avoid;\n}',
        'div.poem p.line {\n  margin: 0;\n  padding-left: 2em;\n  text-indent: -2em;\n  text-align: left;\n}', 'figcaption {\n  font-size: 0.9em;\n  text-indent: 0;\n  page-break-before: avoid;\n  break-before: avoid;\n}'
    ].forEach((r) => assert.ok(out.indexOf(r) !== -1, r));
    assert.equal(BookStyle.read(out).blocks, true);
    assert.ok(/div\.poem p\.line \{[^}]*text-align: right;/.test(BookStyle.apply(css, s, 'ar')), 'right-to-left books align poems right');
    assert.equal(BookStyle.apply(out, Object.assign({}, s, { blocks: false }), 'en'), BookStyle.apply(css, Object.assign({}, s, { blocks: false }), 'en'));
    assert.equal(BookStyle.presetOf(s), 'novel', 'the switch does not affect the preset mark');
});

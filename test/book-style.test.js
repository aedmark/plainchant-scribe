const stBook = () => ExampleBook.create({ uuid: '0f3c2a1e-6b7d-4e2a-9c1b-8a5d4f3e2b10', now: Date.UTC(2026, 10, 4) }).files;
const ST_CSS = 'OEBPS/css/book.css';

test('book-style: presets write one marked block at the end of the stylesheet, and the rest is kept (P4-01)', () => {
    const before = stBook()[ST_CSS];
    const novel = BookStyle.apply(before, BookStyle.PRESETS.novel.settings, 'en');
    assert.ok(novel.startsWith(before.replace(/\s*$/, '')), 'the old text is untouched');
    assert.equal(novel.split(BookStyle.START).length, 2);
    const block = novel.slice(novel.indexOf(BookStyle.START));
    ['text-indent: 1.5em;', 'line-height: 1.4;', 'text-align: justify;', '-webkit-hyphens: auto;', '-epub-hyphens: auto;', 'hyphens: auto;', 'widows: 2;', 'orphans: 2;', 'h1 + p, h2 + p, h3 + p, h4 + p, h5 + p, h6 + p, hr + p {'].forEach((d) => assert.ok(block.indexOf(d) !== -1, d));
    assert.deepEqual(CssAst.parse(novel).rules.slice(-2).map((r) => r.selector.trim()), ['p', 'h1 + p, h2 + p, h3 + p, h4 + p, h5 + p, h6 + p, hr + p']);
    const modern = BookStyle.apply(novel, BookStyle.PRESETS.modern.settings, 'en');
    assert.equal(modern.split(BookStyle.START).length, 2, 'replaced in place, not added twice');
    assert.ok(/margin-bottom: 1em;[\s\S]*text-indent: 0;[\s\S]*text-align: left;/.test(modern) && modern.indexOf('hyphens') === -1);
    assert.equal(BookStyle.apply(modern, BookStyle.PRESETS.plain.settings, 'en'), before, 'Plain removes the block and gives back the file');
    assert.equal(BookStyle.apply(before, BookStyle.PRESETS.plain.settings, 'en'), before);
    assert.ok(BookStyle.apply(before, BookStyle.PRESETS.modern.settings, 'he').indexOf('text-align: right;') !== -1, 'ragged left for right-to-left languages');
    assert.equal(BookStyle.apply('', BookStyle.PRESETS.novel.settings, 'en').indexOf(BookStyle.START), 0, 'an empty stylesheet gets just the block');
});

test('book-style: settings read back from the block, including hand edits, and presets are recognised', () => {
    const base = stBook()[ST_CSS];
    assert.equal(BookStyle.read(base), null, 'no block, no settings');
    Object.keys(BookStyle.PRESETS).filter((k) => k !== 'plain').forEach((k) => {
        const t = BookStyle.apply(base, BookStyle.PRESETS[k].settings, 'en');
        assert.deepEqual(BookStyle.read(t), BookStyle.normalise(BookStyle.PRESETS[k].settings), k);
        assert.equal(BookStyle.presetOf(BookStyle.read(t)), k);
    });
    const withBlock = BookStyle.apply(base, BookStyle.PRESETS.novel.settings, 'en');
    const at = withBlock.indexOf(BookStyle.START);
    const edited = withBlock.slice(0, at) + withBlock.slice(at).replace('line-height: 1.4;', 'line-height: 1.3;').replace('text-indent: 1.5em;', 'text-indent: 2em;');
    const s = BookStyle.read(edited);
    assert.deepEqual([s.lineHeight, s.size, s.paragraph], [1.3, 2, 'indent']);
    assert.equal(BookStyle.presetOf(s), null);
    const custom = { paragraph: 'indent', size: 1, lineHeight: null, justify: false, hyphens: true, widows: 3 };
    assert.deepEqual(BookStyle.read(BookStyle.apply(base, custom, 'en')), BookStyle.normalise(custom));
    assert.deepEqual(BookStyle.normalise({ paragraph: 'weird', size: 99, lineHeight: 'x', widows: 9 }), { paragraph: 'none', size: 1, lineHeight: null, justify: false, hyphens: false, widows: null }, 'out-of-range values fall back');
});

test('book-style: the stylesheet is the one the first chapter links, else the first CSS item', () => {
    const files = stBook();
    assert.equal(BookStyle.stylesheet(files), ST_CSS);
    const other = Object.assign({}, files);
    other['OEBPS/css/main.css'] = 'p {}';
    other['OEBPS/content.opf'] = other['OEBPS/content.opf'].replace('  </manifest>', '    <item id="main" href="css/main.css" media-type="text/css"/>\n  </manifest>');
    other['OEBPS/text/chapter-1.xhtml'] = other['OEBPS/text/chapter-1.xhtml'].replace('../css/book.css', '../css/main.css');
    assert.equal(BookStyle.stylesheet(other), 'OEBPS/css/main.css');
    const unlinked = Object.assign({}, files);
    unlinked['OEBPS/text/chapter-1.xhtml'] = unlinked['OEBPS/text/chapter-1.xhtml'].replace(/\s*<link[^>]*>/, '');
    assert.equal(BookStyle.stylesheet(unlinked), ST_CSS, 'the first CSS in the manifest');
    assert.equal(BookStyle.stylesheet(Object.assign({}, files, { 'OEBPS/content.opf': '<x' })), null);
});

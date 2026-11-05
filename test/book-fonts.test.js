const bfBook = () => ExampleBook.create({ uuid: '0f3c2a1e-6b7d-4e2a-9c1b-8a5d4f3e2b10', now: Date.UTC(2026, 10, 4) }).files;
const BF_ASSETS = ['OEBPS/fonts/Lora-Regular.ttf', 'OEBPS/fonts/Lora-Italic.ttf', 'OEBPS/fonts/Inter.woff2'];
const BF_CSS = 'OEBPS/css/book.css';
const bfProblems = (e) => Book.read(e, { assets: BF_ASSETS }).problems.map((p) => p.severity + ' ' + p.code);

test('book-fonts: adding a font lists it in the manifest and writes its @font-face rule (P4-03)', () => {
    let r = BookFonts.add(bfBook(), BF_ASSETS, { path: 'OEBPS/fonts/Lora-Regular.ttf', family: 'Lora', weight: 400, style: 'normal' });
    r = BookFonts.add(r.entries, BF_ASSETS, { path: 'OEBPS/fonts/Lora-Italic.ttf', family: 'Lora', weight: 400, style: 'italic' });
    r = BookFonts.add(r.entries, BF_ASSETS, { path: 'OEBPS/fonts/Inter.woff2', family: 'Inter', weight: 600, style: 'normal' });
    const model = Book.read(r.entries, { assets: BF_ASSETS }).model;
    assert.deepEqual(model.manifest.items.filter((i) => /font/.test(i.mediaType)).map((i) => [i.path, i.mediaType]), [['OEBPS/fonts/Lora-Regular.ttf', 'font/ttf'], ['OEBPS/fonts/Lora-Italic.ttf', 'font/ttf'], ['OEBPS/fonts/Inter.woff2', 'font/woff2']]);
    assert.deepEqual(BookFonts.list(r.entries).map((f) => [f.family, f.weight, f.style, f.src, f.path]), [
        ['Lora', 400, 'normal', '../fonts/Lora-Regular.ttf', 'OEBPS/fonts/Lora-Regular.ttf'], ['Lora', 400, 'italic', '../fonts/Lora-Italic.ttf', 'OEBPS/fonts/Lora-Italic.ttf'], ['Inter', 600, 'normal', '../fonts/Inter.woff2', 'OEBPS/fonts/Inter.woff2']
    ]);
    const css = r.entries[BF_CSS];
    assert.ok(css.indexOf('@font-face {\n  font-family: "Lora";\n  font-weight: 400;\n  font-style: italic;\n  src: url("../fonts/Lora-Italic.ttf");\n}') !== -1, css);
    assert.deepEqual(bfProblems(r.entries), []);
    assert.equal(BookFonts.folder(bfBook()), 'OEBPS/fonts');
    const again = BookFonts.add(r.entries, BF_ASSETS, { path: 'OEBPS/fonts/Inter.woff2', family: 'Inter', weight: 700, style: 'normal' });
    assert.deepEqual(BookFonts.list(again.entries).filter((f) => f.family === 'Inter').map((f) => f.weight), [700], 'adding the same file again updates its rule');
    assert.throws(() => BookFonts.add(bfBook(), BF_ASSETS, { path: 'OEBPS/fonts/x.eot', family: 'X' }));
    assert.throws(() => BookFonts.add(bfBook(), BF_ASSETS, { path: 'OEBPS/fonts/Lora-Regular.ttf', family: ' ' }));
});

test('book-fonts: body and heading choices use the families, and removing the last face clears them', () => {
    let f = BookFonts.add(bfBook(), BF_ASSETS, { path: 'OEBPS/fonts/Lora-Regular.ttf', family: 'Lora', weight: 400, style: 'normal' }).entries;
    f = BookFonts.add(f, BF_ASSETS, { path: 'OEBPS/fonts/Inter.woff2', family: 'Inter', weight: 600, style: 'normal' }).entries;
    const s = BookStyle.read(f[BF_CSS]);
    Object.assign(s, { bodyFont: 'Lora', headingFont: 'Inter', headingFallback: 'sans-serif' });
    f[BF_CSS] = BookStyle.apply(f[BF_CSS], s, 'en');
    assert.ok(/body \{\n  font-family: "Lora", serif;\n\}/.test(f[BF_CSS]) && /h1, h2, h3, h4, h5, h6 \{\n  font-family: "Inter", sans-serif;\n\}/.test(f[BF_CSS]));
    assert.deepEqual([BookStyle.read(f[BF_CSS]).bodyFont, BookStyle.read(f[BF_CSS]).headingFallback], ['Lora', 'sans-serif']);
    const r = BookFonts.remove(f, BF_ASSETS, 'OEBPS/fonts/Inter.woff2');
    const after = BookStyle.read(r.entries[BF_CSS]);
    assert.deepEqual([after.headingFont, after.bodyFont, after.fonts.length], ['', 'Lora', 1], 'the heading choice goes with its only face');
    assert.ok(!Book.read(r.entries, { assets: BF_ASSETS }).model.manifest.items.some((i) => i.path === 'OEBPS/fonts/Inter.woff2'));
    assert.deepEqual(r.removed, ['OEBPS/fonts/Inter.woff2']);
    const gone = BookFonts.remove(r.entries, BF_ASSETS, 'OEBPS/fonts/Lora-Regular.ttf');
    assert.equal(gone.entries[BF_CSS], bfBook()[BF_CSS], 'with nothing left, the stylesheet is as it was');
    assert.deepEqual(bfProblems(gone.entries), []);
});

test('book-fonts: presets and other layout changes keep the fonts', () => {
    const f = BookFonts.add(bfBook(), BF_ASSETS, { path: 'OEBPS/fonts/Lora-Regular.ttf', family: 'Lora', weight: 400, style: 'normal' }).entries;
    const s = BookStyle.withPreset(BookStyle.read(f[BF_CSS]), 'novel');
    assert.equal(BookStyle.read(BookStyle.apply(f[BF_CSS], s, 'en')).fonts.length, 1);
    assert.equal(BookStyle.presetOf(s), 'novel', 'fonts do not affect the preset mark');
});

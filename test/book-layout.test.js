// BookLayout (P7-01, D-052): whole-book fixed layout, the viewport syntax, spreads, and the checks.
const flBook = () => ExampleBook.create({ uuid: '0f3c2a1e-6b7d-4e2a-9c1b-8a5d4f3e2b10', now: Date.UTC(2026, 10, 4) }).files;
const flOn = (f, o) => BookLayout.enable(f || flBook(), [], Object.assign({ width: 1200, height: 1600, spread: 'landscape' }, o));
const flRows = (f) => BookLayout.rows(f, Book.read(f).model).map((r) => r.severity + ' ' + r.code);
const flThrows = (fn, code) => { try { fn(); } catch (e) { assert.equal(e.code, code, e.message); return; } assert.ok(false, 'expected ' + code); };
const FL_C1 = 'OEBPS/text/chapter-1.xhtml', FL_OPF = 'OEBPS/content.opf';

test('book-layout: enable makes every spine page fixed with one size, and disable restores the book exactly (P7-01)', () => {
    const f = flBook();
    assert.deepEqual(BookLayout.state(f, []), { on: false, spread: 'auto', orientation: 'auto', width: null, height: null, docs: [] });
    const on = flOn(f);
    assert.includes(on[FL_OPF], '<meta property="rendition:layout">pre-paginated</meta>');
    assert.includes(on[FL_OPF], '<meta property="rendition:spread">landscape</meta>');
    assert.includes(on[FL_C1], '<title>A Book Is a Folder of Files</title>\n  <meta name="viewport" content="width=1200, height=1600"/>\n  <link', 'after the title, at its indent');
    assert.deepEqual(BookLayout.state(on, []), { on: true, spread: 'landscape', orientation: 'auto', width: 1200, height: 1600, docs: ['OEBPS/text/chapter-1.xhtml', 'OEBPS/text/chapter-2.xhtml', 'OEBPS/text/chapter-3.xhtml'] });
    assert.equal(on['OEBPS/nav.xhtml'], f['OEBPS/nav.xhtml'], 'the nav is not in the spine, so it stays reflowable');
    assert.deepEqual(flRows(on), []);
    const off = BookLayout.disable(on, []);
    Object.keys(f).forEach((k) => assert.equal(off[k], f[k], k));
    const resized = BookLayout.setSize(on, [], 1600, 1200);
    assert.includes(resized[FL_C1], 'content="width=1600, height=1200"');
    assert.equal(BookLayout.setSize(resized, [], 1600, 1200), resized, 'no change, no new object');
    assert.includes(BookLayout.setSpread(on, [], 'none')[FL_OPF], '<meta property="rendition:spread">none</meta>');
    flThrows(() => BookLayout.setSize(on, [], 0, 100), 'bad-size');
    flThrows(() => BookLayout.setSize(on, [], 1200.5, 100), 'bad-size');
    flThrows(() => flOn(f, { width: 20000 }), 'bad-size');
    flThrows(() => BookLayout.setSpread(on, [], 'portrait'), 'bad-spread');
    flThrows(() => BookLayout.enable({ 'META-INF/container.xml': f['META-INF/container.xml'] }, [], { width: 10, height: 10 }), 'unreadable');
    // A page that already had a viewport keeps its element; only the size changes, and disable removes it.
    const had = Object.assign({}, f, { [FL_C1]: f[FL_C1].replace('<link', '<meta name="viewport" content="width=device-width"/>\n  <link') });
    assert.equal((flOn(had)[FL_C1].match(/name="viewport"/g) || []).length, 1);
    assert.excludes(BookLayout.disable(flOn(had), [])[FL_C1], 'viewport');
});

test('book-layout: refresh gives a new fixed page the book size, and leaves reflowable books and sized pages alone (P7-01)', () => {
    const on = flOn(BookLayout.setSize(flOn(), [], 1600, 1200));
    const added = BookChapters.add(on, 'Four', FL_C1);
    assert.excludes(added.entries[added.path], 'viewport');
    const r = BookLayout.refresh(added.entries, []);
    assert.includes(r[added.path], '<meta name="viewport" content="width=1200, height=1600"/>');
    assert.equal(BookLayout.refresh(r, []), r);
    const plain = BookChapters.add(flBook(), 'Four', FL_C1).entries;
    assert.equal(BookLayout.refresh(plain, []), plain, 'a reflowable book is never touched');
    const odd = Object.assign({}, r, { [FL_C1]: r[FL_C1].replace('width=1200, height=1600', 'width=600, height=800') });
    assert.equal(BookLayout.refresh(odd, []), odd, 'a page with its own size keeps it');
    const lastOdd = Object.assign({}, r, { [added.path]: r[added.path].replace('width=1200, height=1600', 'width=600, height=800') });
    assert.deepEqual([BookLayout.state(lastOdd, []).width, BookLayout.state(lastOdd, []).height], [1200, 1600], 'the size most pages use, not the last one seen');
    const mixed = flBook();
    mixed[FL_OPF] = mixed[FL_OPF].replace('<itemref idref="chapter-1"', '<itemref idref="chapter-1" properties="rendition:layout-pre-paginated"').replace('<itemref idref="chapter-2"', '<itemref idref="chapter-2" properties="rendition:layout-pre-paginated"');
    mixed[FL_C1] = mixed[FL_C1].replace('<link', '<meta name="viewport" content="width=10, height=10"/>\n  <link');
    assert.equal(BookLayout.refresh(mixed, []), mixed, 'only a whole-book fixed layout is filled in; a mixed book is left to its author');
});

test('book-layout: parseViewport follows Appendix F and §8.2.2.6 (P7-01)', () => {
    const p = (s) => { const r = BookLayout.parseViewport(s); return [r.width, r.height, r.problems.map((x) => x.code).join(' ')]; };
    assert.deepEqual(p('width=1200, height=1600'), [1200, 1600, '']);
    assert.deepEqual(p(' width = 1200 ;height=1600\n'), [1200, 1600, ''], 'spaces round "=", any separator, whitespace normalised');
    assert.deepEqual(p('width=1200,height=1600,initial-scale=1.0'), [1200, 1600, ''], 'other properties are allowed');
    assert.deepEqual(p('width=device-width, height=device-height'), ['device-width', 'device-height', '']);
    assert.deepEqual(p('width=.5, height=10.25'), [0.5, 10.25, '']);
    assert.deepEqual(p('width=1200'), [1200, null, 'viewport-height-missing']);
    assert.deepEqual(p(''), [null, null, 'viewport-syntax']);
    assert.deepEqual(p('width=1200,, height=1600=3'), [null, null, 'viewport-syntax']);
    assert.deepEqual(p('width=, height=5'), [null, null, 'viewport-syntax']);
    assert.deepEqual(p('width=1200, height=1600,'), [null, null, 'viewport-syntax'], 'a trailing separator, as EPUBCheck HTM-047 also says');
    assert.deepEqual(p(';width=1200 height=1600'), [null, null, 'viewport-syntax'], 'a leading one');
    assert.deepEqual(p('width=0, height=-4'), [null, null, 'viewport-value viewport-value']);
    assert.deepEqual(p('width=12px, height=device-width'), [null, null, 'viewport-value viewport-value'], 'units and the other keyword are not allowed');
    assert.deepEqual(p('width=1, width=2, height=3'), [null, 3, 'viewport-repeated']);
    assert.deepEqual(BookLayout.pageSize('<html xmlns="http://www.w3.org/1999/xhtml"><head><meta name="viewport" content="width=10, height=20"/><meta name="viewport" content="width=1, height=2"/></head><body/></html>'), { width: 10, height: 20 }, 'the first one counts');
    assert.equal(BookLayout.pageSize('<html xmlns="http://www.w3.org/1999/xhtml"><head/><body/></html>'), null);
});

test('book-layout: spreads fill each spread in reading order, the first page on the right, and follow page-spread properties (P7-01)', () => {
    const name = (s) => s.map((pair) => pair.map((p) => (p ? p.split('/').pop().replace('chapter-', 'c').replace('.xhtml', '') : '-')).join('|')).join(' ');
    const on = flOn();
    assert.equal(name(BookLayout.spreads(on, [])), '-|c1 c2|c3');
    const props = (f, id, value) => Object.assign({}, f, { [FL_OPF]: f[FL_OPF].replace('<itemref idref="' + id + '"', '<itemref idref="' + id + '" properties="' + value + '"') });
    assert.equal(name(BookLayout.spreads(props(on, 'chapter-1', 'page-spread-left'), [])), 'c1|c2 c3|-');
    assert.equal(name(BookLayout.spreads(props(on, 'chapter-2', 'rendition:page-spread-right'), [])), '-|c1 -|c2 c3|-');
    assert.equal(name(BookLayout.spreads(props(on, 'chapter-2', 'rendition:page-spread-center'), [])), '-|c1 c2|- c3|-', 'a centred page stands alone (shown as its own spread)');
    assert.equal(name(BookLayout.spreads(props(on, 'chapter-1', 'rendition:page-spread-center'), [])), 'c1|- c2|c3', 'after a centred page the next spread starts on its first side');
    const rtl = Object.assign({}, on, { [FL_OPF]: on[FL_OPF].replace('<spine', '<spine page-progression-direction="rtl"') });
    assert.equal(name(BookLayout.spreads(rtl, [])), 'c1|- c3|c2', 'right to left: the first page on the left, then right before left');
    const aux = Object.assign({}, on, { [FL_OPF]: on[FL_OPF].replace('<itemref idref="chapter-2"', '<itemref idref="chapter-2" linear="no"') });
    assert.equal(name(BookLayout.spreads(aux, [])), '-|c1 c3|-', 'non-linear pages are not in spreads');
});

test('book-layout: rows find the rendition and viewport errors EPUBCheck finds, and only in fixed pages (P7-01)', () => {
    const on = flOn();
    const vp = (c) => Object.assign({}, on, { [FL_C1]: on[FL_C1].replace('content="width=1200, height=1600"', 'content="' + c + '"') });
    assert.deepEqual(flRows(Object.assign({}, on, { [FL_C1]: on[FL_C1].replace(/\n\s*<meta name="viewport"[^>]*\/>/, '') })), ['error viewport-missing']);
    assert.deepEqual(flRows(vp('width=1200, width=1300, height=1600')), ['error viewport-repeated']);
    assert.deepEqual(flRows(Object.assign({}, on, { [FL_C1]: on[FL_C1].replace('<link', '<meta name="viewport" content="width=1"/>\n  <link') })), ['info viewport-second']);
    const opf = (from, to) => Object.assign({}, on, { [FL_OPF]: on[FL_OPF].replace(from, to) });
    assert.deepEqual(flRows(opf('<meta property="rendition:spread">landscape</meta>', '<meta property="rendition:spread">landscape</meta><meta property="rendition:spread" refines="#t">none</meta><meta property="rendition:orientation">sideways</meta>')), ['error rendition-value', 'error rendition-refines'], 'orientation is checked before spread');
    assert.deepEqual(flRows(opf('>landscape<', '>portrait<')), ['warning rendition-spread-portrait']);
    assert.deepEqual(flRows(opf('<meta property="rendition:spread">', '<meta property="rendition:layout">pre-paginated</meta><meta property="rendition:spread">')), ['error rendition-repeated']);
    assert.deepEqual(flRows(opf('<itemref idref="chapter-2"', '<itemref idref="chapter-2" properties="rendition:spread-none rendition:spread-both rendition:page-spread-left page-spread-right"')), ['error rendition-override-repeated', 'error page-spread-both']);
    assert.deepEqual(flRows(opf('<itemref idref="chapter-2"', '<itemref idref="chapter-2" properties="page-spread-left rendition:page-spread-left"')), [], 'the prefixed and plain forms of one side may be given together');
    const reflow = opf('<itemref idref="chapter-1"', '<itemref idref="chapter-1" properties="rendition:layout-reflowable"');
    assert.deepEqual(flRows(reflow), ['info viewport-reflowable'], 'an override makes the page reflowable, so its viewport is ignored');
    assert.deepEqual(BookLayout.fixedDocs(reflow, []), ['OEBPS/text/chapter-2.xhtml', 'OEBPS/text/chapter-3.xhtml']);
    const mixed = Object.assign({}, flBook());
    mixed[FL_OPF] = mixed[FL_OPF].replace('<itemref idref="chapter-1"', '<itemref idref="chapter-1" properties="rendition:layout-pre-paginated"');
    assert.deepEqual(flRows(mixed), ['error viewport-missing'], 'a fixed page in a reflowable book still needs its viewport');
    assert.deepEqual(flRows(flBook()), [], 'a reflowable book has nothing to report');
    assert.deepEqual(BookLayout.rows(on, null), []);
});

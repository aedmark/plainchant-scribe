/* BookCheck: the Book Problems tab's checks (P5-04, D-040). */
const { BOOK_CHECK_CASES: bcCases, PNG: bcPng } = require('./book-check-cases.js');

const BC_CHAPTER = 'OEBPS/text/chapter-1.xhtml';
const BC_OPF = 'OEBPS/content.opf';
const BC_NAV = 'OEBPS/nav.xhtml';

// Splits a book's files into text entries and binary assets, as the Studio holds them.
function bcSplit(files) {
    const entries = {}, heads = {};
    Object.keys(files).forEach((p) => { if (typeof files[p] === 'string') entries[p] = files[p]; else heads[p] = files[p]; });
    return { entries: entries, options: { assets: Object.keys(heads), heads: heads } };
}

function bcRun(change) {
    const files = BookTemplate.create({ title: 'Check' }).files;
    if (change) change(files);
    const s = bcSplit(files);
    return { problems: BookCheck.check(s.entries, s.options).problems, entries: s.entries };
}

const bcCodes = (problems) => Array.from(new Set(problems.map((p) => p.code))).filter((c) => c !== 'cover-missing').sort();

test('book-check: each broken book gives its codes, and a sound one gives none', () => {
    bcCases.forEach((c) => assert.deepEqual(bcCodes(bcRun(c.change).problems), c.codes.slice().sort(), c.name));
    assert.deepEqual(bcRun().problems.map((p) => p.code), ['cover-missing']);
    const example = ExampleBook.create().files;
    assert.deepEqual(BookCheck.check(example).problems.map((p) => p.code), ['cover-missing'], 'the example book');
});

test('book-check: a marked cover clears cover-missing', () => {
    const r = bcRun((f) => {
        f['OEBPS/images/cover.png'] = bcPng;
        f[BC_OPF] = f[BC_OPF].replace('</manifest>', '<item id="cover" href="images/cover.png" media-type="image/png" properties="cover-image"/></manifest>');
    });
    assert.deepEqual(r.problems, []);
});

test('book-check: problems point at the exact text, in the right category', () => {
    const r = bcRun((f) => {
        f[BC_CHAPTER] = f[BC_CHAPTER].replace('<p>Begin', '<p id="chapter-1"><a href="#nope">x</a><img src="../css/book.css"/></p><p>Begin');
        f[BC_OPF] = f[BC_OPF].replace('<package ', '<package xmlns:opf="http://www.idpf.org/2007/opf" ').replace('<dc:language>', '<dc:creator opf:role="aut">A</dc:creator><dc:language>');
    });
    const find = (code) => r.problems.find((p) => p.code === code);
    const text = (p) => r.entries[p.file].slice(p.start, p.end);
    assert.equal(text(find('fragment-missing')), '#nope');
    assert.equal(find('fragment-missing').category, 'links');
    assert.equal(find('fragment-missing').severity, 'error');
    assert.equal(text(find('duplicate-id')), 'id="chapter-1"');
    assert.ok(/already used on line 9\./.test(find('duplicate-id').message), find('duplicate-id').message);
    assert.equal(find('duplicate-id').line, 11);
    assert.equal(find('duplicate-id').category, 'markup');
    assert.equal(find('img-alt-missing').category, 'accessibility');
    assert.equal(find('img-alt-missing').severity, 'warning');
    assert.equal(text(find('opf-attribute')), 'opf:role="aut"');
    assert.equal(find('opf-attribute').file, BC_OPF);
    assert.equal(find('opf-attribute').category, 'package');
    assert.equal(find('opf-attribute').line, r.entries[BC_OPF].slice(0, find('opf-attribute').start).split('\n').length);
    // The package document comes before the chapters.
    assert.ok(r.problems.indexOf(find('opf-attribute')) < r.problems.indexOf(find('duplicate-id')));
});

test('book-check: nav links are checked for fragments, and not twice for files', () => {
    const r = bcRun((f) => {
        f[BC_NAV] = f[BC_NAV].replace('href="text/chapter-1.xhtml"', 'href="text/chapter-1.xhtml#lost"').replace('</ol>', '<li><a href="text/gone.xhtml">Gone</a></li></ol>');
    });
    const codes = r.problems.filter((p) => p.file === BC_NAV).map((p) => p.code).sort();
    assert.deepEqual(codes, ['fragment-missing', 'nav-link-unknown']);
});

test('book-check: links that are fine pass', () => {
    const r = bcRun((f) => {
        f[BC_CHAPTER] = f[BC_CHAPTER].replace('<p>Begin', '<p><a href="#chapter-1-title">top</a> <a href="chapter-1.xhtml#chapter-1">self</a> <a href="mailto:a@example.com">mail</a> <a href="https://example.com/">web</a> <a href="chapter-1.xhtml#epubcfi(/6/2)">cfi</a> <a href="#chapter%2D1">encoded</a></p><p>Begin');
    });
    assert.deepEqual(bcCodes(r.problems), []);
});

test('book-check: file names with forbidden characters are errors', () => {
    const r = bcRun((f) => { f['OEBPS/what?.txt'] = 'x'; f['OEBPS/end.'] = 'x'; });
    const names = r.problems.filter((p) => p.code === 'file-name');
    assert.deepEqual(names.map((p) => p.file).sort(), ['OEBPS/end.', 'OEBPS/what?.txt']);
    assert.ok(names.every((p) => p.severity === 'error' && p.category === 'package'));
});

test('book-check: an unreadable package gives its own problems and stops', () => {
    const r = bcRun((f) => { f[BC_OPF] = '<package'; });
    assert.ok(r.problems.length > 0);
    assert.ok(r.problems.every((p) => p.category === 'package' && p.file === BC_OPF), JSON.stringify(r.problems.map((p) => p.code)));
});

test('book-check: sniff tells image formats apart', () => {
    assert.equal(BookCheck.sniff(bcPng), 'image/png');
    assert.equal(BookCheck.sniff(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg');
    assert.equal(BookCheck.sniff(new TextEncoder().encode('GIF89a')), 'image/gif');
    assert.equal(BookCheck.sniff(new TextEncoder().encode('RIFF\u0000\u0000\u0000\u0000WEBPVP8 ')), 'image/webp');
    assert.equal(BookCheck.sniff(new TextEncoder().encode('RIFF\u0000\u0000\u0000\u0000WAVE')), null);
    assert.equal(BookCheck.sniff(new TextEncoder().encode('<?xml version="1.0"?><svg/>')), 'image/svg+xml');
    assert.equal(BookCheck.sniff('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/svg+xml');
    assert.equal(BookCheck.sniff(new TextEncoder().encode('hello')), null);
});

test('book-check: an image without its first bytes is not judged', () => {
    const files = BookTemplate.create({ title: 'Check' }).files;
    files['OEBPS/images/a.png'] = bcPng;
    files[BC_OPF] = files[BC_OPF].replace('</manifest>', '<item id="a" href="images/a.png" media-type="image/jpeg"/></manifest>');
    const s = bcSplit(files);
    assert.deepEqual(bcCodes(BookCheck.check(s.entries, { assets: s.options.assets }).problems), []);
    assert.deepEqual(bcCodes(BookCheck.check(s.entries, s.options).problems), ['media-type-mismatch']);
});

test('book-check: a checker re-reads only the chapters that changed', () => {
    const files = BookTemplate.create({ title: 'Check' }).files;
    const s = bcSplit(files);
    const checker = BookCheck.createChecker();
    const original = Xhtml.check;
    const seen = [];
    Xhtml.check = function (text, options) { seen.push(options.path); return original.apply(this, arguments); };
    try {
        checker.check(s.entries, s.options);
        assert.deepEqual(seen.slice().sort(), [BC_NAV, BC_CHAPTER].sort());
        seen.length = 0;
        checker.check(s.entries, s.options);
        assert.deepEqual(seen, []);
        checker.check(Object.assign({}, s.entries, { [BC_CHAPTER]: s.entries[BC_CHAPTER].replace('Begin', 'Start') }), s.options);
        assert.deepEqual(seen, [BC_CHAPTER]);
    } finally {
        Xhtml.check = original;
    }
});

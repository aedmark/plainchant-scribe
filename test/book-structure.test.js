/* P6-02 (D-045): roles, page numbers, language of parts, the alt-text pass, and reading order. */

const BS_CH = (n) => 'OEBPS/text/chapter-' + n + '.xhtml';
const bsBook = () => ExampleBook.create().files;
const bsModel = (e) => Book.read(e).model;

test('book-roles: what Scribe writes carries the matching roles, and the fix adds them to older chapters', () => {
    const e = bsBook();
    Object.keys(e).filter((p) => /\.xhtml$/.test(p)).forEach((p) => assert.deepEqual(BookRoles.scan(e[p]).map((f) => f.type), [], p + ' needs no role'));
    const old = '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>t</title></head><body epub:type="chapter">' +
        '<section epub:type="chapter" id="c"><p>x<a epub:type="noteref" href="#n">1</a></p><aside epub:type="footnote" id="n"><p>n</p></aside>' +
        '<p epub:type="pullquote" role="note">q</p><div epub:type="figure">f</div><ol epub:type="endnotes"><li epub:type="endnote">e</li></ol></section></body></html>';
    const found = BookRoles.scan(old);
    assert.deepEqual(found.map((f) => f.type + (f.fixable ? '' : ':' + f.why)), [
        'chapter:role="doc-chapter" is not allowed on <body>', 'chapter', 'noteref', 'footnote', 'pullquote:it already has role="note"', 'endnotes']);
    const fixed = BookRoles.fix(old);
    assert.equal(fixed.count, 4);
    assert.includes(fixed.text, '<section epub:type="chapter" id="c" role="doc-chapter">');
    assert.includes(fixed.text, '<a epub:type="noteref" href="#n" role="doc-noteref">');
    assert.includes(fixed.text, '<ol epub:type="endnotes" role="doc-endnotes">');
    assert.includes(fixed.text, '<li epub:type="endnote">', 'doc-endnote is deprecated in DPUB-ARIA 1.1, so it is left out');
    assert.equal(fixed.text.replace(/ role="doc-[a-z]+"/g, ''), old, 'only role attributes are added');
    assert.equal(BookRoles.fix(fixed.text).count, 0);
    const rows = BookRoles.rows({ 'a.xhtml': old });
    assert.equal(rows.length, 6);
    assert.deepEqual([rows[0].code, rows[0].line, rows[1].fixable], ['role-missing', 1, true]);
    // Inside the landmarks nav, epub:type names the target, not the element.
    const nav = '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>n</title></head><body><nav epub:type="toc" aria-label="Contents"><ol><li><a href="a.xhtml">A</a></li></ol></nav><nav epub:type="landmarks"><ol><li><a epub:type="toc" href="#toc">C</a></li></ol></nav></body></html>';
    assert.deepEqual(BookRoles.scan(nav).map((f) => f.fixable + ' ' + f.why), ['false EPUBCheck refuses role="doc-toc" with aria-label or aria-labelledby']);
    assert.equal(BookRoles.roleFor('bodymatter chapter'), 'doc-chapter');
    assert.equal(BookRoles.roleFor('bodymatter'), null);
});

test('book-pages: markers go in the text with the next number, and the page list links them in reading order', () => {
    let e = bsBook();
    const m = bsModel(e);
    const p1 = e[BS_CH(1)].indexOf('<p>An EPUB book');
    assert.equal(BookPages.nextLabel(e, m, BS_CH(1), p1), '1');
    let r = BookPages.insertAt(e[BS_CH(1)], p1, '1');
    assert.includes(r.text, '<span epub:type="pagebreak" role="doc-pagebreak" id="page-1" aria-label="1"/><p>An EPUB book');
    e = Object.assign({}, e, { [BS_CH(1)]: r.text });
    const p2 = e[BS_CH(2)].indexOf('</p>');
    assert.equal(BookPages.nextLabel(e, bsModel(e), BS_CH(2), p2), '2', 'the last marker before it in reading order, plus one');
    e = Object.assign({}, e, { [BS_CH(2)]: BookPages.insertAt(e[BS_CH(2)], p2, '2').text });
    r = BookPages.insertAt(e[BS_CH(2)], e[BS_CH(2)].lastIndexOf('</p>'), '2');
    assert.equal(r.id, 'page-2-2', 'ids stay unique');
    assert.throws(() => BookPages.insertAt(e[BS_CH(1)], 3, '9'), /in the text of a chapter/);
    assert.throws(() => BookPages.insertAt(e[BS_CH(1)], e[BS_CH(1)].indexOf('<p>') + 1, '9'), /in the text/);
    assert.throws(() => BookPages.insertAt(e[BS_CH(1)], p1, ' '), /page number/);
    assert.deepEqual(BookPages.list(e, bsModel(e)).map((x) => x.path.slice(-15) + ' ' + x.id + ' ' + x.label), ['chapter-1.xhtml page-1 1', 'chapter-2.xhtml page-2 2']);
    assert.deepEqual(BookPages.rows(e, bsModel(e)).map((x) => x.code), ['page-list-missing', 'page-source-missing']);
    const built = BookPages.buildPageList(e, bsModel(e));
    assert.equal(built.count, 2);
    assert.includes(built.entries['OEBPS/nav.xhtml'], '<nav epub:type="page-list" role="doc-pagelist" id="page-list" hidden="">');
    assert.includes(built.entries['OEBPS/nav.xhtml'], '<li><a href="text/chapter-2.xhtml#page-2">2</a></li>');
    e = built.entries;
    let opf = e['OEBPS/content.opf'];
    BookPages.setSource('978-0-306-40615-7').forEach((op) => { opf = XmlAst.applyEdits(opf, op(bsModel(Object.assign({}, e, { 'OEBPS/content.opf': opf })))); });
    e = Object.assign({}, e, { 'OEBPS/content.opf': opf });
    assert.includes(opf, '<meta property="pageBreakSource">urn:isbn:9780306406157</meta>');
    assert.equal(BookPages.source(bsModel(e)), 'urn:isbn:9780306406157');
    assert.deepEqual(BookPages.rows(e, bsModel(e)), []);
    // A marker added after the list is built is reported until the list is rebuilt.
    const later = Object.assign({}, e, { [BS_CH(3)]: BookPages.insertAt(e[BS_CH(3)], e[BS_CH(3)].indexOf('<p>'), '3').text });
    assert.deepEqual(BookPages.rows(later, bsModel(later)).map((x) => x.code), ['page-list-incomplete']);
    const dup = Object.assign({}, e, { [BS_CH(3)]: BookPages.insertAt(e[BS_CH(3)], e[BS_CH(3)].indexOf('<p>'), '2').text });
    assert.ok(BookPages.rows(dup, bsModel(dup)).some((x) => x.code === 'page-label-repeated'));
    let none = e['OEBPS/content.opf'];
    BookPages.setSource('none').forEach((op) => { none = XmlAst.applyEdits(none, op(bsModel(Object.assign({}, e, { 'OEBPS/content.opf': none })))); });
    assert.includes(none, '>none</meta>');
    let gone = none;
    BookPages.setSource('').forEach((op) => { gone = XmlAst.applyEdits(gone, op(bsModel(Object.assign({}, e, { 'OEBPS/content.opf': gone })))); });
    assert.ok(gone.indexOf('pageBreakSource') === -1);
    assert.throws(() => BookPages.buildPageList(bsBook(), bsModel(bsBook())), /no page breaks/);
    assert.equal(BookPages.toRoman(14, false), 'xiv');
    const roman = Object.assign({}, bsBook(), { [BS_CH(1)]: BookPages.insertAt(bsBook()[BS_CH(1)], p1, 'xiv').text });
    assert.equal(BookPages.nextLabel(roman, bsModel(roman), BS_CH(2), 10 ** 6), 'xv');
});

test('book-lang: a selection is wrapped in a span, an element takes lang and xml:lang, and bad tags are reported', () => {
    const t = '<html xmlns="http://www.w3.org/1999/xhtml" lang="en" xml:lang="en"><head><title>t</title></head><body><p>He said <i>bonjour</i> to her.</p><p>Gut.</p></body></html>';
    const word = t.indexOf('bonjour');
    assert.includes(BookLang.apply(t, word, word + 7, 'fr'), '<i lang="fr" xml:lang="fr">bonjour</i>', 'exactly an element\'s content sets it on the element');
    const s = t.indexOf('He said'), e = t.indexOf(' to her');
    assert.includes(BookLang.apply(t, s, s + 7, 'de'), '<p><span lang="de" xml:lang="de">He said</span> <i>', 'a run of text is wrapped');
    assert.throws(() => BookLang.apply(t, s, word + 3, 'fr'), /cuts through markup/);
    assert.includes(BookLang.apply(t, s, e, 'fr'), '<span lang="fr" xml:lang="fr">He said <i>bonjour</i></span> to her', 'whole elements inside the run are fine');
    const gut = t.indexOf('Gut');
    const set = BookLang.apply(t, gut + 1, gut + 1, 'de-CH');
    assert.includes(set, '<p lang="de-CH" xml:lang="de-CH">Gut.</p>', 'a cursor sets the paragraph');
    assert.equal(BookLang.at(set, set.indexOf('Gut')), 'de-CH');
    assert.equal(BookLang.apply(set, set.indexOf('Gut'), set.indexOf('Gut'), ''), t, 'no language removes both attributes');
    assert.throws(() => BookLang.apply(t, s, s + 7, 'fr_FR'), /not a language tag/);
    assert.throws(() => BookLang.apply(t, 2, 2, 'fr'), /chapter itself/);
    assert.throws(() => BookLang.apply(t, t.indexOf('<i>') + 1, word, 'fr'), /inside a tag/);
    ['fr', 'de-CH', 'zh-Hant-TW', 'es-419', 'sl-rozaj-biske', 'en-US-x-twain', 'x-private', 'i-klingon', 'en-a-bbb-x-a-ccc'].forEach((tag) => assert.ok(BookLang.wellFormed(tag), tag));
    ['', 'e', 'fr_FR', 'en-US-US', 'de-1996-1996', 'en--us', 'toolongtag9', 'en-a-xx-a-yy'].forEach((tag) => assert.ok(!BookLang.wellFormed(tag), tag));
    const rows = BookLang.rows({ 'a.xhtml': t.replace('<p>Gut', '<p lang="english_UK" xml:lang="english_UK">Gut') });
    assert.deepEqual(rows.map((r) => r.code + ' ' + r.line), ['lang-invalid 1', 'lang-invalid 1']);
});

test('book-alt: images are listed missing first, with chapter and caption, and alt is spliced in', () => {
    const e = bsBook();
    e[BS_CH(1)] = e[BS_CH(1)].replace('</section>', '<figure><img src="../images/map.png" alt="A map of the book"/><figcaption>The map</figcaption></figure><img src="../images/rule.png" alt=""/></section>');
    e[BS_CH(2)] = e[BS_CH(2)].replace('</section>', '<p><img src="../images/no%20alt.png"/></p></section>');
    const items = BookAlt.list(e, bsModel(e));
    assert.deepEqual(items.map((i) => i.file + ' ' + JSON.stringify(i.alt)), ['OEBPS/images/no alt.png null', 'OEBPS/images/rule.png ""', 'OEBPS/images/map.png "A map of the book"']);
    assert.equal(items[2].caption, 'The map');
    assert.equal(items[0].chapter, 'Chapters and Contents');
    assert.deepEqual(BookAlt.counts(items), { total: 3, missing: 1, decorative: 1 });
    const t2 = BookAlt.setAlt(e[BS_CH(2)], items[0].start, '  A   page  ', false);
    assert.includes(t2, '<img src="../images/no%20alt.png" alt="A page"/>');
    assert.includes(BookAlt.setAlt(e[BS_CH(1)], items[2].start, '', true), '<img src="../images/map.png" alt=""/>');
    assert.throws(() => BookAlt.setAlt(e[BS_CH(2)], items[0].start, ' ', false), /Describe the image/);
    assert.throws(() => BookAlt.setAlt(e[BS_CH(2)], 0, 'x', false), /moved/);
});

test('book-order: an unreachable non-linear chapter and a contents list out of reading order are reported', () => {
    let e = bsBook();
    assert.deepEqual(BookOrder.rows(e, bsModel(e)), []);
    const opf = 'OEBPS/content.opf';
    e = Object.assign({}, e, { [opf]: e[opf].replace('<itemref idref="chapter-3"/>', '<itemref idref="chapter-3" linear="no"/>') });
    const nav = e['OEBPS/nav.xhtml'];
    e = Object.assign({}, e, { 'OEBPS/nav.xhtml': nav.replace(/<li><a href="text\/chapter-3\.xhtml">[^<]*<\/a><\/li>/, '') });
    assert.deepEqual(BookOrder.rows(e, bsModel(e)).map((r) => r.code + ' ' + r.severity), ['nonlinear-unreachable error']);
    const swapped = bsBook();
    const ln = /<li><a href="text\/chapter-1\.xhtml">[^<]*<\/a><\/li>/.exec(swapped['OEBPS/nav.xhtml'])[0];
    const s2 = Object.assign({}, swapped, { 'OEBPS/nav.xhtml': swapped['OEBPS/nav.xhtml'].replace(ln, '').replace(/(<li><a href="text\/chapter-3\.xhtml">[^<]*<\/a><\/li>)/, '$1' + ln) });
    const rows = BookOrder.rows(s2, bsModel(s2));
    assert.deepEqual(rows.map((r) => r.code), ['toc-order']);
    assert.includes(rows[0].message, '"A Book Is a Folder of Files" comes after "A Page of Typical Elements"');
});

test('css-lint: CSS that shows content out of markup order is flagged (P6-02)', () => {
    const codes = (css) => CssLint.checkCss(css).map((p) => p.code);
    assert.deepEqual(codes('nav { flex-direction: row-reverse; }'), ['css-reading-order']);
    assert.deepEqual(codes('.a { order: 2 } .b { order: 0 } .c { flex-flow: column-reverse wrap } .d { grid-auto-flow: row dense }'), ['css-reading-order', 'css-reading-order', 'css-reading-order']);
    assert.deepEqual(codes('.a { flex-direction: column; order: initial }'), []);
});

test('P6-02: the buttons, the alt-text dialog, and the Problems rows are wired in', () => {
    const fsS = require('fs'), pathS = require('path');
    const read = (p) => fsS.readFileSync(pathS.join(__dirname, '..', p), 'utf8');
    const html = read('app.html');
    ['id="pageBreakBtn"', 'id="langBtn"', 'id="pageListBtn"', 'id="altReviewBtn"', 'id="rolesFixBtn"', 'id="pageSourceInput"', 'id="alt-modal"', 'id="altList"'].forEach((n) => assert.includes(html, n));
    const order = Array.from(html.matchAll(/<script src="([^"]+)"><\/script>/g)).map((m) => m[1]);
    assert.ok(order.indexOf('src/app/structure-ui.js') > order.indexOf('src/app/book-ui.js'), 'structure-ui.js loads after book-ui.js');
    const problems = read('src/app/problems-ui.js');
    ['BookRoles.rows(', 'BookPages.rows(', 'BookLang.rows(', 'BookOrder.rows('].forEach((n) => assert.includes(problems, n));
    assert.includes(read('src/app/book-ui.js'), 'refreshStructure(r.model)');
    const ui = read('src/app/structure-ui.js');
    assert.ok(/BookRoles\.fix[\s\S]*askConfirm[\s\S]*commitBookFiles/.test(ui), 'roles are added only after the author confirms');
});

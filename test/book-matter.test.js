/* P3-07 (D-046): front and back matter, built in and from the author's library. */

const BM_OPF = 'OEBPS/content.opf';
const bmModel = (e) => Book.read(e).model;
const bmOps = (files, ops) => { ops.forEach((op) => { files = Object.assign({}, files, { [BM_OPF]: XmlAst.applyEdits(files[BM_OPF], op(bmModel(files))) }); }); return files; };
const bmSpine = (e) => bmModel(e).spine.itemrefs.map((r) => r.item.path.split('/').pop());
const bmBook = () => bmOps(ExampleBook.create().files, [].concat(BookMeta.setField('publisher', 'Small Press'), BookMeta.setField('date', '2024-05-01'),
    BookMeta.setField('rights', 'All rights reserved.'), BookMeta.setIsbn('978-0-306-40615-7')));
const bmWhen = new Date('2026-11-06T12:00:00Z');

test('book-matter: each built-in page lands in its place with its type and role, and back matter joins the contents', () => {
    let e = BookCover.set(bmBook(), 'OEBPS/images/cover.png', ['OEBPS/images/cover.png']).entries;
    // Out of order on purpose: each page still finds its place.
    ['also-by', 'epigraph', 'acknowledgements', 'titlepage', 'about-author', 'dedication', 'copyright'].forEach((k) => {
        const r = BookMatter.add(e, { kind: k }, bmWhen);
        assert.deepEqual(r.missing, [], k);
        e = r.entries;
    });
    assert.deepEqual(bmSpine(e), ['cover.xhtml', 'titlepage.xhtml', 'copyright.xhtml', 'dedication.xhtml', 'epigraph.xhtml', 'chapter-1.xhtml', 'chapter-2.xhtml', 'chapter-3.xhtml',
        'acknowledgements.xhtml', 'about-the-author.xhtml', 'also-by.xhtml']);
    const page = (f) => e['OEBPS/text/' + f + '.xhtml'];
    assert.includes(page('titlepage'), '<body epub:type="frontmatter">');
    assert.includes(page('titlepage'), '<section epub:type="titlepage" id="titlepage" aria-labelledby="titlepage-title">');
    assert.includes(page('titlepage'), '<h1 id="titlepage-title" data-pc-field="title">A Short Guide to Plainchant Scribe</h1>');
    assert.includes(page('titlepage'), '<p class="publisher" data-pc-field="publisher">Small Press</p>');
    assert.includes(page('copyright'), 'Copyright © <span data-pc-field="year">2024</span> <span data-pc-field="creators">Plainchant Scribe</span>');
    assert.includes(page('copyright'), '<p data-pc-field="rights">All rights reserved.</p>');
    assert.includes(page('copyright'), '<p>ISBN <span data-pc-field="isbn">9780306406157</span></p>');
    assert.includes(page('dedication'), '<section epub:type="dedication" role="doc-dedication" id="dedication" aria-label="Dedication">');
    assert.includes(page('epigraph'), 'role="doc-epigraph"');
    assert.includes(page('acknowledgements'), '<body epub:type="backmatter">');
    assert.includes(page('acknowledgements'), 'epub:type="acknowledgments" role="doc-acknowledgments"');
    assert.includes(page('also-by'), '<title>Also by Plainchant Scribe</title>');
    assert.includes(page('titlepage'), '<link rel="stylesheet" type="text/css" href="../css/book.css"/>');
    Object.keys(e).filter((p) => /\.xhtml$/.test(p)).forEach((p) => {
        assert.ok(XmlAst.parse(e[p]).wellFormed, p);
        assert.deepEqual(BookRoles.scan(e[p]).map((f) => f.type), [], p + ' needs no role');
    });
    const toc = Nav.entries(Nav.read(e, bmModel(e)).nav.toc).map((x) => x.label);
    assert.deepEqual(toc.slice(-3), ['Acknowledgements', 'About the Author', 'Also by Plainchant Scribe']);
    assert.ok(toc.indexOf('Copyright') === -1 && toc.indexOf('Dedication') === -1, 'front matter is reached in reading order, not listed');
    assert.deepEqual(BookOrder.rows(e, bmModel(e)), [], 'the contents stay in reading order');
    assert.deepEqual(BookMatter.rows(e, bmModel(e)), []);
    assert.deepEqual(Object.keys(BookMatter.present(e, bmModel(e))).sort(), BookMatter.KINDS.map((k) => k.key).sort());
    assert.throws(() => BookMatter.add(e, { kind: 'copyright' }, bmWhen), /already has a copyright page, OEBPS\/text\/copyright\.xhtml/);
    assert.throws(() => BookMatter.add(e, { kind: 'colophon' }, bmWhen), /no page of that kind/);
});

test('book-matter: fields are filled once from the Book tab, missing values are reported, and stale ones are flagged', () => {
    const plain = ExampleBook.create().files;
    const r = BookMatter.add(plain, { kind: 'copyright' }, bmWhen);
    const text = r.entries[r.path];
    assert.includes(text, '<span data-pc-field="year">2026</span>', 'no dc:date: the year it was added');
    assert.ok(text.indexOf('ISBN') === -1 && text.indexOf('Published by') === -1 && text.indexOf('data-pc-field="rights"') === -1, 'lines without a value are left out');
    assert.deepEqual(r.missing, []);
    assert.deepEqual(BookMatter.add(BookMatter.add(plain, { kind: 'titlepage' }, bmWhen).entries, { kind: 'about-author' }, bmWhen).missing, []);
    // Change the metadata afterwards: the page keeps its text, and the Problems tab says where it differs.
    let e = BookMatter.add(bmBook(), { kind: 'titlepage' }, bmWhen).entries;
    e = bmOps(e, BookMeta.setField('title', 'A Longer Guide'));
    const rows = BookMatter.rows(e, bmModel(e));
    assert.equal(rows.length, 1);
    assert.deepEqual([rows[0].code, rows[0].severity, rows[0].file, rows[0].line], ['matter-stale', 'warning', 'OEBPS/text/titlepage.xhtml', 10]);
    assert.includes(rows[0].message, 'gives the title as "A Short Guide to Plainchant Scribe", but the Book tab has "A Longer Guide"');
    assert.equal(e['OEBPS/text/titlepage.xhtml'].slice(rows[0].start, rows[0].end), '<h1 id="titlepage-title" data-pc-field="title">');
    e['OEBPS/text/titlepage.xhtml'] = e['OEBPS/text/titlepage.xhtml'].replace(' data-pc-field="title"', '');
    assert.deepEqual(BookMatter.rows(e, bmModel(e)), [], 'without the mark, the text is no longer checked');
    // A field whose metadata is now empty is not flagged: there is nothing to compare with.
    let f = BookMatter.add(bmBook(), { kind: 'copyright' }, bmWhen).entries;
    f = bmOps(f, BookMeta.setField('publisher', ''));
    assert.deepEqual(BookMatter.rows(f, bmModel(f)), []);
    // Authors only (no role or aut), joined in English; other creators count only when there is no author.
    const many = Object.assign({}, plain, { [BM_OPF]: plain[BM_OPF].replace(/(<dc:creator[^>]*>[^<]*<\/dc:creator>)/, '$1<dc:creator>B. Two</dc:creator><dc:creator>C. Three</dc:creator>') });
    assert.equal(BookMatter.values(bmModel(many)).creators, 'Plainchant Scribe, B. Two, and C. Three');
    const two = Object.assign({}, plain, { [BM_OPF]: plain[BM_OPF].replace(/(<dc:creator[^>]*>[^<]*<\/dc:creator>)/, '$1<dc:creator>B. Two</dc:creator>') });
    assert.equal(BookMatter.values(bmModel(two)).creators, 'Plainchant Scribe and B. Two');
    const editor = '<dc:creator id="ed">E. Ditor</dc:creator><meta refines="#ed" property="role" scheme="marc:relators">edt</meta>';
    const withEditor = Object.assign({}, plain, { [BM_OPF]: plain[BM_OPF].replace(/(<dc:creator[^>]*>[^<]*<\/dc:creator>)/, '$1' + editor) });
    assert.equal(BookMatter.values(bmModel(withEditor)).creators, 'Plainchant Scribe', 'an editor is not an author');
    const onlyEditor = Object.assign({}, plain, { [BM_OPF]: plain[BM_OPF].replace(/<dc:creator[^>]*>[^<]*<\/dc:creator>/, editor) });
    assert.equal(BookMatter.values(bmModel(onlyEditor)).creators, 'E. Ditor', 'with no author, the other creators are named');
});

test('book-matter: a saved page travels to another book with that book\'s values, and pages that carry files are refused', () => {
    const a = BookMatter.add(bmBook(), { kind: 'copyright' }, bmWhen);
    const saved = BookMatter.save(a.entries[a.path], '  My copyright  ');
    assert.deepEqual([saved.name, saved.place, saved.kind], ['My copyright', 'front', 'copyright']);
    assert.includes(saved.body, '9780306406157');
    // Book B has another title and no ISBN: the saved ISBN must not come along.
    const b = bmOps(ExampleBook.create().files, BookMeta.setField('title', 'Book B'));
    const r = BookMatter.add(b, saved, bmWhen);
    const text = r.entries[r.path];
    assert.equal(r.path, 'OEBPS/text/copyright.xhtml', 'a page of a known kind keeps its file name');
    assert.includes(text, '<title>My copyright</title>');
    assert.includes(text, '<span data-pc-field="title">Book B</span>');
    assert.includes(text, '<span data-pc-field="isbn"></span>');
    assert.ok(text.indexOf('9780306406157') === -1 && text.indexOf('Small Press') === -1, 'no value of book A is left');
    assert.deepEqual(r.missing.sort(), ['isbn', 'publisher', 'rights']);
    assert.deepEqual(bmSpine(r.entries).slice(0, 2), ['copyright.xhtml', 'chapter-1.xhtml']);
    assert.throws(() => BookMatter.add(r.entries, saved, bmWhen), /already has a copyright page/);
    // An untyped saved back page goes last, and an untyped one can be added twice under a new file name.
    const about = BookMatter.save(BookMatter.add(b, { kind: 'about-author' }, bmWhen).entries['OEBPS/text/about-the-author.xhtml'], 'Bio');
    assert.deepEqual([about.place, about.kind], ['back', 'about-author']);
    const notes = BookMatter.save('<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>x</title></head><body epub:type="backmatter"><section id="n"><h1>Note on the Text</h1><p>See <a href="https://example.org/">here</a> or <a href="#n">above</a>.</p></section></body></html>', 'Note');
    assert.deepEqual([notes.place, notes.kind], ['back', null]);
    let two = BookMatter.add(b, notes, bmWhen).entries;
    two = BookMatter.add(two, notes, bmWhen).entries;
    assert.deepEqual(bmSpine(two).slice(-2), ['note.xhtml', 'note-2.xhtml']);
    const doc = (body) => '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>x</title></head><body>' + body + '</body></html>';
    assert.throws(() => BookMatter.save(doc('<p><img src="../images/me.jpg" alt="Me"/></p>'), 'x'), /has <img>/);
    assert.throws(() => BookMatter.save(doc('<p><a href="chapter-1.xhtml">One</a></p>'), 'x'), /links to chapter-1\.xhtml/);
    assert.throws(() => BookMatter.save(doc('<p onclick="go()">x</p>'), 'x'), /event handler/);
    assert.throws(() => BookMatter.save(doc('<p>x</p>'), '  '), /name/);
    assert.throws(() => BookMatter.save('<html><body><p>', 'x'), /not well-formed/);
    assert.throws(() => BookMatter.save(doc('<p>' + 'x'.repeat(BookMatter.MAX_PAGE) + '</p>'), 'x'), /64 KB/);
    assert.deepEqual(BookMatter.save(doc('<p>x</p>'), 'Front').place, 'front');
});

test('book-matter: the library is checked when read, replaced by name, and capped', () => {
    const page = { name: 'Bio', place: 'back', kind: 'about-author', body: '<p>x</p>' };
    let list = BookMatter.putLibrary([], page, '2026-11-06T00:00:00Z');
    list = BookMatter.putLibrary(list, Object.assign({}, page, { body: '<p>y</p>' }), '2026-11-07T00:00:00Z');
    assert.deepEqual(list.map((p) => p.body + ' ' + p.saved), ['<p>y</p> 2026-11-07T00:00:00Z']);
    const back = BookMatter.readLibrary(JSON.stringify(list.concat([{ name: 'x' }, { name: 'y', place: 'side', body: '' }, { name: 'z', place: 'front', body: '', kind: 'nope' }, null])));
    assert.deepEqual(back.map((p) => p.name + ':' + p.kind), ['Bio:about-author', 'z:null']);
    assert.deepEqual(BookMatter.readLibrary('not json'), []);
    assert.deepEqual(BookMatter.readLibrary('{"a":1}'), []);
    assert.deepEqual(BookMatter.readLibrary(null), []);
    const full = Array.from({ length: BookMatter.MAX_PAGES }, (_, i) => Object.assign({}, page, { name: 'p' + i }));
    assert.throws(() => BookMatter.putLibrary(full, Object.assign({}, page, { name: 'new' })), /holds 50 pages/);
    assert.equal(BookMatter.putLibrary(full, Object.assign({}, page, { name: 'p3' })).length, BookMatter.MAX_PAGES, 'replacing one is allowed when full');
    assert.equal(BookMatter.readLibrary(JSON.stringify(full.concat(full))).length, BookMatter.MAX_PAGES);
});

test('book-matter: the Chapters tab offers the dialog, the Problems tab runs the check, and books hide the Parts tab', () => {
    const fs = require('fs');
    const read = (p) => fs.readFileSync(require('path').join(__dirname, '..', p), 'utf8');
    const html = read('app.html');
    assert.includes(html, 'id="matterBtn"');
    assert.includes(html, 'id="matter-modal"');
    assert.ok(html.indexOf('id="ask-modal"') < html.indexOf('id="matter-modal"'), 'the question dialogs come first, which is why matter-ui closes its dialog around them');
    assert.includes(read('src/app/matter-ui.js'), 'closeModal(matterModal);\n    const name');
    assert.includes(read('src/app/problems-ui.js'), 'BookMatter.rows(e, model)');
    const ui = read('src/app/book-ui.js');
    assert.includes(ui, "document.querySelector('.insp-tab[data-insp=\"parts\"]').hidden = book;");
    assert.includes(ui, "document.getElementById('inspPartBtn').hidden = book;");
    assert.includes(ui, "if (book && activeInspectorTab === 'parts') switchInspectorTab('props');");
});

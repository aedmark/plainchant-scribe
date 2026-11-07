/*
 * EPUBCheck as the oracle (D-005). Runs only when Java and an EPUBCheck jar are found: EPUBCHECK_JAR, or the
 * newest epubcheck.jar under .tools/epubcheck-<version>/. Otherwise it prints "not run" and registers no test, so a missing
 * oracle is never reported as a pass. SCRIBE_SKIP_EPUBCHECK=1 skips it the same way.
 */
const ecFs = require('fs');
const ecPath = require('path');
const ecOs = require('os');
const ecChild = require('child_process');

function findEpubcheck() {
    if (process.env.SCRIBE_SKIP_EPUBCHECK === '1') return { reason: 'SCRIBE_SKIP_EPUBCHECK=1' };
    let jar = process.env.EPUBCHECK_JAR || null;
    if (!jar) {
        const tools = ecPath.join(__dirname, '..', '.tools');
        const dirs = ecFs.existsSync(tools) ? ecFs.readdirSync(tools).filter((d) => /^epubcheck-[\d.]+$/.test(d)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true })) : [];
        const found = dirs.map((d) => ecPath.join(tools, d, 'epubcheck.jar')).filter((p) => ecFs.existsSync(p));
        jar = found.length ? found[found.length - 1] : null;
    }
    if (!jar || !ecFs.existsSync(jar)) return { reason: 'no EPUBCheck jar in .tools/ or EPUBCHECK_JAR' };
    try { ecChild.execFileSync('java', ['-version'], { stdio: 'ignore' }); } catch (e) { return { reason: 'java is not on the PATH' }; }
    return { jar: jar };
}

// Zips files in the given order (mimetype first, stored) and returns EPUBCheck's JSON report.
function epubcheck(jar, files) {
    return epubcheckBytes(jar, Zip.build(Object.keys(files).map((p) => ({ path: p, data: files[p] }))));
}

// EPUBCheck's JSON report on an .epub file's bytes.
function epubcheckBytes(jar, bytes) {
    const dir = ecFs.mkdtempSync(ecPath.join(ecOs.tmpdir(), 'scribe-epubcheck-'));
    try {
        const epub = ecPath.join(dir, 'book.epub');
        const report = ecPath.join(dir, 'report.json');
        ecFs.writeFileSync(epub, bytes);
        try { ecChild.execFileSync('java', ['-jar', jar, epub, '--json', report], { stdio: 'ignore' }); } catch (e) { /* non-zero when the book has errors */ }
        return JSON.parse(ecFs.readFileSync(report, 'utf8'));
    } finally {
        ecFs.rmSync(dir, { recursive: true, force: true });
    }
}

const describeMessages = (r) => r.messages.map((m) => m.severity + ' ' + m.ID + ': ' + m.message).join('; ');
const oracle = findEpubcheck();

if (!oracle.jar) {
    console.log('  skip epubcheck: not run (' + oracle.reason + ')');
} else {
    test('epubcheck: new books pass EPUBCheck with no messages (P1-02, D-005)', () => {
        [{}, { title: 'Ink & <Ash>', creator: 'A. Writer', language: 'fr-CA' }].forEach((opts) => {
            const r = epubcheck(oracle.jar, BookTemplate.create(opts).files);
            assert.deepEqual(r.messages.map((m) => m.severity + ' ' + m.ID), [], JSON.stringify(opts) + ' ' + describeMessages(r));
        });
    });

    test('epubcheck: a book edited with OpfEdit passes EPUBCheck with no messages (P1-04)', () => {
        let files = BookTemplate.create({ title: 'Draft' }).files;
        files['OEBPS/text/chapter-2.xhtml'] = files['OEBPS/text/chapter-1.xhtml'].replace(/Chapter 1/g, 'Chapter 2').replace(/chapter-1/g, 'chapter-2');
        [
            (m) => OpfEdit.addItem(m, { id: 'chapter-2', path: 'OEBPS/text/chapter-2.xhtml', mediaType: 'application/xhtml+xml' }),
            (m) => OpfEdit.addItemref(m, 'chapter-2', { index: 0 }),
            (m) => OpfEdit.moveItemref(m, 'chapter-1', 0),
            (m) => OpfEdit.renameItem(m, 'chapter-2', 'ch-2'),
            (m) => OpfEdit.setTitle(m, 'Ink & Ash'),
            (m) => OpfEdit.addDc(m, 'creator', 'Ada Penrose', { id: 'creator' }),
            (m) => OpfEdit.setRefinement(m, m.metadata.creators[0], 'role', 'aut', { scheme: 'marc:relators' }),
            (m) => OpfEdit.setRefinement(m, m.metadata.creators[0], 'file-as', 'Penrose, Ada'),
            (m) => OpfEdit.addDc(m, 'publisher', 'Small Press'),
            (m) => OpfEdit.touchModified(m, Date.UTC(2026, 11, 1))
        ].forEach((op) => {
            const model = Book.read(files).model;
            files = Object.assign({}, files, { 'OEBPS/content.opf': XmlAst.applyEdits(files['OEBPS/content.opf'], op(model)) });
        });
        const r = epubcheck(oracle.jar, files);
        assert.deepEqual(r.messages.map((m) => m.severity + ' ' + m.ID), [], describeMessages(r));
    });

    test('epubcheck: a book whose nav was edited with Nav passes EPUBCheck with no messages (P1-05)', () => {
        let files = BookTemplate.create({ title: 'Nav' }).files;
        files['OEBPS/text/chapter-2.xhtml'] = files['OEBPS/text/chapter-1.xhtml'].replace(/Chapter 1/g, 'Chapter 2').replace(/chapter-1/g, 'chapter-2');
        const opfOps = [
            (m) => OpfEdit.addItem(m, { id: 'chapter-2', path: 'OEBPS/text/chapter-2.xhtml', mediaType: 'application/xhtml+xml' }),
            (m) => OpfEdit.addItemref(m, 'chapter-2')
        ];
        opfOps.forEach((op) => {
            files = Object.assign({}, files, { 'OEBPS/content.opf': XmlAst.applyEdits(files['OEBPS/content.opf'], op(Book.read(files).model)) });
        });
        const ch = (n, frag) => ({ path: 'OEBPS/text/chapter-' + n + '.xhtml', fragment: frag });
        [
            (n) => Nav.addEntry(n, n.toc, 'append', Object.assign({ label: 'Chapter 2' }, ch(2))),
            (n) => Nav.addEntry(n, n.toc.entries[0], 'child', Object.assign({ label: 'The heading' }, ch(1, 'chapter-1-title'))),
            (n) => Nav.setLabel(n, n.toc.entries[1], 'Chapter Two'),
            (n) => Nav.setLandmark(n, 'bodymatter', ch(1, 'chapter-1'), 'Start'),
            (n) => Nav.setPageList(n, [Object.assign({ label: '1' }, ch(1, 'chapter-1')), Object.assign({ label: '2' }, ch(2, 'chapter-2'))])
        ].forEach((op) => {
            const nav = Nav.read(files, Book.read(files).model).nav;
            files = Object.assign({}, files, { 'OEBPS/nav.xhtml': XmlAst.applyEdits(files['OEBPS/nav.xhtml'], op(nav)) });
        });
        assert.deepEqual(Nav.read(files, Book.read(files).model).problems, []);
        const r = epubcheck(oracle.jar, files);
        assert.deepEqual(r.messages.map((m) => m.severity + ' ' + m.ID), [], describeMessages(r));
    });

    test('epubcheck: a chapter with fixed entities and a normalised paste passes EPUBCheck with no messages (P1-06)', () => {
        const files = BookTemplate.create({ title: 'Paste' }).files;
        const el = (name, attrs, ...kids) => ({ nodeType: 1, localName: name, attributes: Object.keys(attrs).map((k) => ({ name: k, value: attrs[k] })), childNodes: kids.map((k) => (typeof k === 'string' ? { nodeType: 3, data: k } : k)) });
        const pasted = Xhtml.normalize({ nodeType: 11, childNodes: [
            el('b', { style: 'font-weight:normal', id: 'docs-internal-guid-1' },
                el('h2', { style: 'x' }, 'A ', el('span', { style: 'font-style:italic' }, 'pasted'), ' part'),
                el('p', { class: 'MsoNormal' }, 'Caf\u00E9\u00A0time ', el('span', { style: 'font-weight:700' }, 'bold'), el('o:p', {}, '\u00A0')),
                el('ul', {}, el('li', {}, 'One'), el('li', {}, el('p', {}, 'Two'))),
                el('table', {}, el('tbody', {}, el('tr', {}, el('td', { colspan: '1' }, 'Cell')))),
                el('blockquote', {}, el('p', {}, 'Quote')),
                el('script', {}, 'x()'))
        ] });
        const path = 'OEBPS/text/chapter-1.xhtml';
        let text = files[path].replace('<p>Begin writing here.</p>', '<p>Entities&nbsp;&mdash;&rsquo;s here.</p>');
        text = XmlAst.applyEdits(text, Xhtml.fixEntities(text));
        const ast = XmlAst.parse(text);
        const section = XmlAst.find(ast, 'section', XmlAst.find(ast, 'html').ns);
        text = XmlAst.applyEdits(text, XmlAst.insert(ast, section, 'append', pasted.xhtml));
        files[path] = text;
        assert.deepEqual(Xhtml.check(text, { path: path }).problems, []);
        const r = epubcheck(oracle.jar, files);
        assert.deepEqual(r.messages.map((m) => m.severity + ' ' + m.ID), [], describeMessages(r));
    });

    test('epubcheck: the example book passes EPUBCheck with no messages (P2-01)', () => {
        const r = epubcheck(oracle.jar, ExampleBook.create().files);
        assert.deepEqual(r.messages.map((m) => m.severity + ' ' + m.ID), [], describeMessages(r));
    });

    test('epubcheck: a book edited through the Book panel passes EPUBCheck with no messages (P3-01, P3-06)', () => {
        let files = ExampleBook.create().files;
        const ops = [].concat(BookMeta.setField('title', 'Ink & Ash'), BookMeta.setField('publisher', 'Small Press'), BookMeta.setField('date', '2026-11-04'),
            BookMeta.setField('description', 'A short guide.'), BookMeta.setField('rights', 'CC BY 4.0'), BookMeta.setIsbn('978-0-306-40615-7'),
            BookMeta.setCreator(0, 'role', 'aut'), BookMeta.addCreator('Ada Penrose', 'edt', 'Penrose, Ada'), BookMeta.touchModified(Date.UTC(2026, 10, 4)),
            BookMeta.setSeries('The Ledger Trilogy', '2'), BookMeta.addPerson('contributor', 'Tom Translator', 'trl', 'Translator, Tom'), BookMeta.movePerson('creator', 1, -1));
        ops.forEach((op) => { files = Object.assign({}, files, { 'OEBPS/content.opf': XmlAst.applyEdits(files['OEBPS/content.opf'], op(Book.read(files).model)) }); });
        const r = epubcheck(oracle.jar, files);
        assert.deepEqual(r.messages.map((m) => m.severity + ' ' + m.ID), [], describeMessages(r));
    });

    test('epubcheck: a book with full accessibility metadata and a conformance claim passes EPUBCheck with no messages (P6-01)', () => {
        let files = ExampleBook.create().files;
        const s = BookA11y.suggest(files, []);
        s.state.conformance = { wcag: '2.2', level: 'AA', certifiedBy: 'Small Press', credential: 'Self-evaluated' };
        BookA11y.ops(s.state).forEach((op) => { files = Object.assign({}, files, { 'OEBPS/content.opf': XmlAst.applyEdits(files['OEBPS/content.opf'], op(Book.read(files).model)) }); });
        assert.includes(files['OEBPS/content.opf'], 'schema:accessibilitySummary');
        const r = epubcheck(oracle.jar, files);
        assert.deepEqual(r.messages.map((m) => m.severity + ' ' + m.ID), [], describeMessages(r));
    });

    test('epubcheck: page breaks, a page list, its source, matching roles, a language span, and alt text pass EPUBCheck with no messages (P6-02)', () => {
        const ch = (n) => 'OEBPS/text/chapter-' + n + '.xhtml';
        let files = ExampleBook.create().files;
        files[ch(2)] = files[ch(2)].replace('</section>', '<p><img src="../css/book.css#x" alt=""/></p><aside epub:type="footnote" id="old-note"><p>Old.</p></aside></section>').replace('<img src="../css/book.css#x" alt=""/>', '');
        files[ch(2)] = BookRoles.fix(files[ch(2)]).text;
        files[ch(1)] = BookPages.insertAt(files[ch(1)], files[ch(1)].indexOf('<p>'), '1').text;
        files[ch(3)] = BookPages.insertAt(files[ch(3)], files[ch(3)].indexOf('<p>'), '2').text;
        files = BookPages.buildPageList(files, Book.read(files).model).entries;
        BookPages.setSource('978-0-306-40615-7').forEach((op) => { files = Object.assign({}, files, { 'OEBPS/content.opf': XmlAst.applyEdits(files['OEBPS/content.opf'], op(Book.read(files).model)) }); });
        const at = files[ch(1)].indexOf('Scribe keeps them');
        files[ch(1)] = BookLang.apply(files[ch(1)], at, at + 6, 'fr-CA');
        assert.includes(files[ch(1)], '<span lang="fr-CA" xml:lang="fr-CA">Scribe</span>');
        assert.deepEqual(BookPages.rows(files, Book.read(files).model), []);
        const r = epubcheck(oracle.jar, files);
        assert.deepEqual(r.messages.map((m) => m.severity + ' ' + m.ID), [], describeMessages(r));
    });

    test('epubcheck: a book with every front and back matter page and a page from the library passes EPUBCheck with no messages (P3-07)', () => {
        let files = ExampleBook.create().files;
        files['OEBPS/content.opf'] = XmlAst.applyEdits(files['OEBPS/content.opf'], BookMeta.setIsbn('978-0-306-40615-7')[0](Book.read(files).model));
        BookMatter.KINDS.forEach((k) => { files = BookMatter.add(files, { kind: k.key }, new Date('2026-11-06')).entries; });
        const note = BookMatter.save('<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>x</title></head><body epub:type="backmatter"><section id="note" aria-labelledby="note-h"><h1 id="note-h">A Note on the Type</h1><p>Set in <a href="https://example.org/">EB Garamond</a>.</p></section></body></html>', 'A Note on the Type');
        files = BookMatter.add(files, note, new Date('2026-11-06')).entries;
        const r = epubcheck(oracle.jar, files);
        assert.deepEqual(r.messages.map((m) => m.severity + ' ' + m.ID), [], describeMessages(r));
    });

    test('epubcheck: the cover tag Kobo reads and the contents page in the reading order pass EPUBCheck with no messages (D-047)', () => {
        let files = BookCover.set(ExampleBook.create().files, 'OEBPS/images/cover.png', ['OEBPS/images/cover.png']).entries;
        files['OEBPS/images/cover.png'] = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));
        files = BookMatter.add(files, { kind: 'titlepage' }, new Date('2026-11-06')).entries;
        files = BookChapters.setNavInReading(files, true).entries;
        files = BookContents.apply(files, BookContents.plan(files));
        assert.includes(files['OEBPS/nav.xhtml'], 'epub:type="toc" href="nav.xhtml#toc"');
        assert.includes(files['OEBPS/content.opf'], '<meta name="cover" content="cover-image"/>');
        const r = epubcheck(oracle.jar, files);
        assert.deepEqual(r.messages.map((m) => m.severity + ' ' + m.ID), [], describeMessages(r));
    });

    test('epubcheck: a book made from a .docx, and .docx chapters added to a book, pass EPUBCheck with no messages (P7-03)', async () => {
        const doc = await Docx.read(dxSample());
        const made = DocxImport.newBook(doc, { name: 'draft.docx' });
        let r = epubcheckBytes(oracle.jar, (await BookExport.pack(made.entries, made.binaries)).bytes);
        assert.deepEqual(r.messages.map((m) => m.severity + ' ' + m.ID), [], 'new book: ' + describeMessages(r));
        const into = DocxImport.importInto(ExampleBook.create().files, doc, 'OEBPS/text/chapter-2.xhtml', { name: 'draft.docx' });
        r = epubcheckBytes(oracle.jar, (await BookExport.pack(into.entries, into.binaries)).bytes);
        assert.deepEqual(r.messages.map((m) => m.severity + ' ' + m.ID), [], 'into a book: ' + describeMessages(r));
    });

    test('epubcheck: BookOrder\'s two rules match EPUBCheck (OPF-096 for an unreachable non-linear chapter, NAV-011 for contents out of order) (P6-02)', () => {
        const base = ExampleBook.create().files;
        const hidden = Object.assign({}, base, {
            'OEBPS/content.opf': base['OEBPS/content.opf'].replace('<itemref idref="chapter-2"/>', '<itemref idref="chapter-2" linear="no"/>'),
            'OEBPS/nav.xhtml': base['OEBPS/nav.xhtml'].replace(/<li><a href="text\/chapter-2\.xhtml">[^<]*<\/a><\/li>/, '')
        });
        assert.deepEqual(BookOrder.rows(hidden, Book.read(hidden).model).map((x) => x.code), ['nonlinear-unreachable']);
        assert.deepEqual(epubcheck(oracle.jar, hidden).messages.map((m) => m.severity + ' ' + m.ID), ['ERROR OPF-096']);
        const ln = /<li><a href="text\/chapter-1\.xhtml">[^<]*<\/a><\/li>/.exec(base['OEBPS/nav.xhtml'])[0];
        const swapped = Object.assign({}, base, { 'OEBPS/nav.xhtml': base['OEBPS/nav.xhtml'].replace(ln, '').replace(/(<li><a href="text\/chapter-3\.xhtml">[^<]*<\/a><\/li>)/, '$1' + ln) });
        assert.deepEqual(BookOrder.rows(swapped, Book.read(swapped).model).map((x) => x.code), ['toc-order']);
        assert.deepEqual(epubcheck(oracle.jar, swapped).messages.map((m) => m.severity + ' ' + m.ID), ['WARNING NAV-011']);
    });

    test('epubcheck: a book reorganised with the chapters organiser, split and merged, passes EPUBCheck with no messages (P3-02, P3-03)', () => {
        let files = ExampleBook.create().files;
        files = BookChapters.add(files, 'The Long Road', 'OEBPS/text/chapter-1.xhtml').entries;
        files = BookChapters.rename(files, 'OEBPS/text/chapter-2.xhtml', 'Spines & Contents').entries;
        files = BookChapters.move(files, 'OEBPS/text/chapter-3.xhtml', 0).entries;
        files = BookChapters.remove(files, 'OEBPS/text/chapter-1.xhtml').entries;
        const ch3 = 'OEBPS/text/chapter-3.xhtml';
        files = BookChapters.split(files, ch3, XmlAst.parse(files[ch3]).elements.find((e) => XmlAst.getAttr(e, 'id') === 'lists').start).entries;
        files = BookChapters.merge(files, ch3).entries;
        const r = epubcheck(oracle.jar, files);
        assert.deepEqual(r.messages.map((m) => m.severity + ' ' + m.ID), [], describeMessages(r));
    });

    test('epubcheck: a book whose contents were generated from headings passes EPUBCheck with no messages (P3-04)', () => {
        const files = ExampleBook.create().files;
        files['OEBPS/text/chapter-2.xhtml'] = files['OEBPS/text/chapter-2.xhtml'].replace('<blockquote>', '<h2>Reading order</h2>\n    <h3>Spine details</h3>\n    <blockquote>');
        const r = epubcheck(oracle.jar, BookContents.apply(files, BookContents.plan(files, 3)));
        assert.deepEqual(r.messages.map((m) => m.severity + ' ' + m.ID), [], describeMessages(r));
    });

    test('epubcheck: a book with a cover image and cover page passes EPUBCheck with no messages (P3-05)', () => {
        // A real 1 x 1 PNG, so EPUBCheck can read the image.
        const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));
        const files = BookCover.set(ExampleBook.create().files, 'OEBPS/images/cover.png', ['OEBPS/images/cover.png']).entries;
        files['OEBPS/images/cover.png'] = png;
        const r = epubcheck(oracle.jar, files);
        assert.deepEqual(r.messages.map((m) => m.severity + ' ' + m.ID), [], describeMessages(r));
    });

    test('epubcheck: a book with each layout preset, and with openers and a scene break, passes EPUBCheck with no messages (P4-01, P4-02)', () => {
        ['novel', 'modern', 'openers'].forEach((k) => {
            const files = ExampleBook.create().files;
            const settings = k === 'openers' ? Object.assign({}, BookStyle.PRESETS.novel.settings, { headingAlign: 'center', headingDrop: 'third', firstLineCaps: true, dropCap: 3, sceneBreak: 'fleuron', smallCaps: true }) : BookStyle.PRESETS[k].settings;
            files['OEBPS/css/book.css'] = BookStyle.apply(files['OEBPS/css/book.css'], settings, 'en');
            if (k === 'openers') files['OEBPS/text/chapter-2.xhtml'] = BookStyle.sceneBreakAfter(files['OEBPS/text/chapter-2.xhtml'], XmlAst.parse(files['OEBPS/text/chapter-2.xhtml']).elements.find((e) => e.local === 'p').start);
            const r = epubcheck(oracle.jar, files);
            assert.deepEqual(r.messages.map((m) => m.severity + ' ' + m.ID), [], k + ': ' + describeMessages(r));
        });
    });

    test('epubcheck: a book with an embedded font passes EPUBCheck with no messages (P4-03)', () => {
        // EB Garamond (SIL Open Font License, fonts/OFL-EBGaramond.txt) may be embedded.
        const font = 'OEBPS/fonts/eb-garamond-latin-400-normal.woff2';
        let files = BookFonts.add(ExampleBook.create().files, [font], { path: font, family: 'EB Garamond', weight: 400, style: 'normal' }).entries;
        const s = BookStyle.read(files['OEBPS/css/book.css']);
        s.bodyFont = 'EB Garamond';
        files['OEBPS/css/book.css'] = BookStyle.apply(files['OEBPS/css/book.css'], s, 'en');
        files[font] = Uint8Array.from(require('fs').readFileSync(require('path').join(__dirname, '..', 'fonts', 'eb-garamond-latin-400-normal.woff2')));
        const r = epubcheck(oracle.jar, files);
        assert.deepEqual(r.messages.map((m) => m.severity + ' ' + m.ID), [], describeMessages(r));
    });

    test('epubcheck: a book with footnotes and endnotes passes EPUBCheck with no messages (P4-04)', () => {
        let files = ExampleBook.create().files;
        const p = (path, k) => XmlAst.parse(files[path]).elements.filter((e) => e.local === 'p')[k].start;
        files = BookNotes.add(files, 'OEBPS/text/chapter-1.xhtml', p('OEBPS/text/chapter-1.xhtml', 0), 'A footnote.', 'footnotes').entries;
        files = BookNotes.add(files, 'OEBPS/text/chapter-2.xhtml', p('OEBPS/text/chapter-2.xhtml', 0), 'An endnote.', 'endnotes').entries;
        files = BookNotes.add(files, 'OEBPS/text/chapter-1.xhtml', p('OEBPS/text/chapter-1.xhtml', 1), 'Another endnote.', 'endnotes').entries;
        const s = Object.assign(BookStyle.read(files['OEBPS/css/book.css']) || BookStyle.normalise(BookStyle.PRESETS.plain.settings), { notes: 'endnotes', noteStyle: true });
        files['OEBPS/css/book.css'] = BookStyle.apply(files['OEBPS/css/book.css'], s, 'en');
        const r = epubcheck(oracle.jar, files);
        assert.deepEqual(r.messages.map((m) => m.severity + ' ' + m.ID), [], describeMessages(r));
    });

    test('epubcheck: a book with a figure, table, poem, and quotes, styled for reflow, passes EPUBCheck with no messages (P4-05)', () => {
        const img = 'OEBPS/images/map.png';
        let files = ExampleBook.create().files;
        const ch = 'OEBPS/text/chapter-2.xhtml';
        const at = () => XmlAst.parse(files[ch]).elements.filter((e) => e.local === 'p')[0].start;
        [['figure', { image: img, alt: 'A map', caption: 'The map.' }], ['figure', { image: img, decorative: true }], ['table', { rows: 2, cols: 2, header: true, caption: 'Parts' }],
            ['poem', { text: 'One,\n  two.\n\nThree.' }], ['quote', { text: 'A quote.' }], ['quote', { text: 'Another.', attribution: 'Someone' }]
        ].forEach(([kind, opts]) => { files = BookBlocks.insert(files, ch, at(), kind, opts, [img]).entries; });
        files['OEBPS/css/book.css'] = BookStyle.apply(files['OEBPS/css/book.css'], Object.assign({}, BookStyle.PRESETS.novel.settings, { blocks: true }), 'en');
        files[img] = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));
        const r = epubcheck(oracle.jar, files);
        assert.deepEqual(r.messages.map((m) => m.severity + ' ' + m.ID), [], describeMessages(r));
    });

    test('epubcheck: exported books, deflated, pass EPUBCheck with no messages (P5-01)', async () => {
        const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));
        const withCover = BookCover.set(ExampleBook.create().files, 'OEBPS/images/cover.png', ['OEBPS/images/cover.png']).entries;
        const books = [[BookTemplate.create().files, {}], [ExampleBook.create().files, {}], [Object.assign(withCover, { 'notes.txt': 'left out' }), { 'OEBPS/images/cover.png': png }]];
        for (const [files, binaries] of books) {
            const r = epubcheckBytes(oracle.jar, (await BookExport.pack(files, binaries)).bytes);
            assert.deepEqual(r.messages.map((m) => m.severity + ' ' + m.ID), [], describeMessages(r));
        }
    });

    test('epubcheck: a book exported, imported, and exported again still passes EPUBCheck with no messages (P5-02)', async () => {
        const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));
        const files = BookCover.set(ExampleBook.create().files, 'OEBPS/images/cover.png', ['OEBPS/images/cover.png']).entries;
        const back = await Epub.read((await BookExport.pack(files, { 'OEBPS/images/cover.png': png })).bytes);
        Object.keys(files).forEach((p) => assert.equal(back.entries[p], files[p], p));
        const r = epubcheckBytes(oracle.jar, (await BookExport.pack(back.entries, back.binaries)).bytes);
        assert.deepEqual(r.messages.map((m) => m.severity + ' ' + m.ID), [], describeMessages(r));
    });

    test('epubcheck: a book with chapters imported from Markdown and plain text passes EPUBCheck with no messages (P5-03)', () => {
        const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));
        const md = 'Before.\n\n# One\n\nText *em* with a note[^n] and a [link](https://example.org).\n\n![A map](map.png "Caption")\n\n> Quote\n\n1. a\n2. b\n\n---\n\n```\ncode\n```\n\n[^n]: The note.\n\n# Two\n\n## Part\n\n- x\n  - y\n';
        ['footnotes', 'endnotes'].forEach((mode) => {
            const r = MarkdownImport.importInto(ExampleBook.create().files, [{ name: 'draft.md', text: md }, { name: 'plain.txt', text: 'One.\n\n"Two."' }], null, { assets: ['OEBPS/images/map.png'], notes: mode });
            const files = Object.assign({}, r.entries, { 'OEBPS/images/map.png': png });
            const c = epubcheck(oracle.jar, files);
            assert.deepEqual(c.messages.map((m) => m.severity + ' ' + m.ID), [], mode + ': ' + describeMessages(c));
        });
    });

    test('epubcheck: a book whose mimetype is not first, has an extra field, or holds more than the media type fails, so the container rule is checked (P5-01)', () => {
        const files = ExampleBook.create().files;
        const order = Object.keys(files).filter((p) => p !== 'mimetype');
        const build = (first) => Zip.build([{ path: 'mimetype', data: first }].concat(order.map((p) => ({ path: p, data: files[p] }))));
        const late = Zip.build(order.slice(0, 1).concat('mimetype', order.slice(1)).map((p) => ({ path: p, data: files[p] })));
        // An extra field on the first local header: 4 bytes spliced in after the name, and every later offset moved.
        const plain = build(files.mimetype), extra = new Uint8Array(plain.length + 4);
        extra.set(plain.subarray(0, 38), 0);
        extra.set([0xFE, 0xCA, 0, 0], 38);
        extra.set(plain.subarray(38), 42);
        const view = new DataView(extra.buffer);
        view.setUint16(28, 4, true);
        const end = extra.length - 22, count = view.getUint16(end + 10, true);
        let at = view.getUint32(end + 16, true) + 4;
        view.setUint32(end + 16, at, true);
        for (let k = 0; k < count; k++) {
            if (k > 0) view.setUint32(at + 42, view.getUint32(at + 42, true) + 4, true);
            at += 46 + view.getUint16(at + 28, true) + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
        }
        [['not first', late, 'PKG-006'], ['extra field', extra, 'PKG-005'], ['a trailing newline', build('application/epub+zip\n'), 'PKG-007']].forEach(([why, bytes, id]) => {
            const r = epubcheckBytes(oracle.jar, bytes);
            assert.deepEqual(r.messages.map((m) => m.severity + ' ' + m.ID), ['ERROR ' + id], why + ': ' + describeMessages(r));
        });
        // EPUBCheck 5.4.0 reports nothing for a deflated mimetype (observed 2026-11-04); test/book-export.test.js checks that rule at the byte level.
    });

    test('epubcheck: a template with the modified date removed fails, so the oracle is really checking', () => {
        const files = BookTemplate.create().files;
        files['OEBPS/content.opf'] = files['OEBPS/content.opf'].replace(/ *<meta property="dcterms:modified">[^<]*<\/meta>\n/, '');
        const r = epubcheck(oracle.jar, files);
        assert.ok(r.messages.some((m) => m.severity === 'ERROR'), 'expected an error, got ' + describeMessages(r));
    });

    // The same broken books as test/book-check.test.js: BookCheck's errors are EPUBCheck's (P5-04, D-040).
    test('epubcheck: agrees with BookCheck on each broken book (P5-04)', () => {
        const cases = require('./book-check-cases.js').BOOK_CHECK_CASES;
        cases.forEach((c) => {
            const files = BookTemplate.create({ title: 'Check' }).files;
            c.change(files);
            const r = epubcheck(oracle.jar, files);
            // EPUBCheck writes HTM_054 with an underscore.
            const ids = Array.from(new Set(r.messages.map((m) => m.ID.replace('_', '-')))).sort();
            assert.deepEqual(ids, c.epubcheck.slice().sort(), c.name + ': ' + describeMessages(r));
            // Every row EpubcheckReport makes from the real report points inside its file, on the line EPUBCheck named (P5-05).
            EpubcheckReport.read(r, files).problems.forEach((p) => {
                if (typeof files[p.file] !== 'string' || !p.line) return;
                assert.ok(p.start <= p.end && p.end <= files[p.file].length, c.name + ' ' + p.code);
                assert.equal(files[p.file].slice(0, p.start).split('\n').length, p.line, c.name + ' ' + p.code);
            });
        });
    });

    test('epubcheck: an exported book keeps its linked ONIX record, as Standard Ebooks books have (P5-06)', async () => {
        const files = BookTemplate.create({ title: 'Record' }).files;
        files['OEBPS/content.opf'] = files['OEBPS/content.opf'].replace('</metadata>', '  <link href="onix.xml" media-type="application/xml" properties="onix" rel="record"/>\n  </metadata>');
        files['OEBPS/onix.xml'] = '<?xml version="1.0" encoding="UTF-8"?>\n<ONIXMessage release="3.0" xmlns="http://ns.editeur.org/onix/3.0/reference"/>\n';
        const r = epubcheckBytes(oracle.jar, (await BookExport.pack(files, {})).bytes);
        assert.deepEqual(r.messages.map((m) => m.severity + ' ' + m.ID), [], describeMessages(r));
        // Without the record, EPUBCheck warns, which is how the corpus found the bug.
        delete files['OEBPS/onix.xml'];
        const gone = epubcheckBytes(oracle.jar, (await BookExport.pack(files, {})).bytes);
        assert.deepEqual(gone.messages.map((m) => m.severity + ' ' + m.ID), ['WARNING RSC-007w']);
    });

    test('epubcheck: books with the NCX Scribe writes pass with no messages, nested, with pages, and with the contents page in the spine (P7-04)', () => {
        const rich = ncRich();
        rich['OEBPS/nav.xhtml'] = rich['OEBPS/nav.xhtml'].replace('text/chapter-3.xhtml#none', 'text/chapter-3.xhtml');
        const inSpine = BookNcx.refresh(BookChapters.setNavInReading(BookNcx.enable(ExampleBook.create({}).files, []).entries, true).entries, []);
        [BookNcx.enable(BookTemplate.create({ title: 'Ink & <Ash>', language: 'fr-CA' }).files, []).entries, BookNcx.enable(rich, []).entries, inSpine].forEach((files, i) => {
            const r = epubcheck(oracle.jar, files);
            assert.deepEqual(r.messages.map((m) => m.severity + ' ' + m.ID), [], 'book ' + i + ': ' + describeMessages(r));
            assert.deepEqual(BookNcx.rows(files, Book.read(files).model), []);
        });
    });

    test('epubcheck: agrees with BookNcx on each broken NCX: an error row exactly when EPUBCheck reports the matching ID (P7-04)', () => {
        const base = BookNcx.enable(ExampleBook.create({ uuid: '0f3c2a1e-6b7d-4e2a-9c1b-8a5d4f3e2b10' }).files, []).entries;
        const cases = [
            ['uid', (t) => t.replace('urn:uuid:0f3c', 'urn:uuid:ffff'), ['NCX-001']],
            ['no uid', (t) => t.replace(/\n    <meta name="dtb:uid"[^>]*\/>/, ''), []],
            ['no 1', (t) => t.replace('playOrder="1"', 'playOrder="4"'), ['RSC-005']],
            ['gap', (t) => t.replace('playOrder="3"', 'playOrder="5"'), ['RSC-005']],
            ['shared number', (t) => t.replace('playOrder="2"', 'playOrder="1"'), ['RSC-005']],
            ['shared src', (t) => t.replace('src="text/chapter-2.xhtml"', 'src="text/chapter-1.xhtml"'), ['RSC-005']],
            ['id', (t) => t.replace('id="navpoint-2"', 'id="navpoint-1"'), ['RSC-005']],
            ['missing', (t) => t.replace('text/chapter-3.xhtml', 'text/chapter-9.xhtml'), ['RSC-007']],
            ['fragment', (t) => t.replace('text/chapter-3.xhtml', 'text/chapter-3.xhtml#nowhere'), ['RSC-012']],
            ['unlisted', (t) => t.replace('text/chapter-3.xhtml', 'extra.xhtml'), ['RSC-008']],
            ['remote', (t) => t.replace('text/chapter-3.xhtml', 'https://example.com/'), []],
            ['label', (t) => t.replace('<text>Chapters and Contents</text>', '<text> </text>'), []],
            ['empty', (t) => t.replace(/<navPoint[\s\S]*<\/navPoint>\n/, ''), ['RSC-005']],
            ['page value', (t) => t.replace('</navMap>', '</navMap>\n  <pageList><pageTarget type="normal" value="3" playOrder="1"><navLabel><text>3</text></navLabel><content src="text/chapter-1.xhtml"/></pageTarget><pageTarget type="normal" value="3" playOrder="2"><navLabel><text>3</text></navLabel><content src="text/chapter-2.xhtml"/></pageTarget></pageList>'), ['RSC-005']],
            ['not well-formed', (t) => t.replace('</ncx>', ''), ['RSC-016']]
        ];
        cases.forEach(([name, edit, ids]) => {
            const files = Object.assign({}, base, { 'OEBPS/toc.ncx': edit(base['OEBPS/toc.ncx']) });
            if (name === 'unlisted') files['OEBPS/extra.xhtml'] = base['OEBPS/text/chapter-3.xhtml'];
            const r = epubcheck(oracle.jar, files);
            assert.deepEqual(Array.from(new Set(r.messages.filter((m) => m.severity === 'ERROR' || m.severity === 'FATAL').map((m) => m.ID))), ids, name + ': ' + describeMessages(r));
            const errors = BookNcx.rows(files, Book.read(files).model).filter((p) => p.severity === 'error');
            assert.equal(errors.length > 0, ids.length > 0, name + ': ' + errors.map((p) => p.code).join(', '));
        });
        const mt = Object.assign({}, base, { 'OEBPS/content.opf': base['OEBPS/content.opf'].replace('application/x-dtbncx+xml', 'application/xml') });
        assert.ok(epubcheck(oracle.jar, mt).messages.some((m) => m.ID === 'OPF-050'));
        assert.equal(BookNcx.rows(mt, Book.read(mt).model)[0].code, 'ncx-media-type');
    });

    test('epubcheck: the desktop run reports HTML content-model errors that BookCheck leaves to it (P5-05)', () => {
        const files = BookTemplate.create({ title: 'Check' }).files;
        const chapter = 'OEBPS/text/chapter-1.xhtml';
        files[chapter] = files[chapter].replace('<p>Begin', '<p><div>block</div></p><ul><p>x</p></ul><p>Begin');
        assert.deepEqual(BookCheck.check(files).problems.map((p) => p.code), ['cover-missing'], 'BookCheck does not judge the content model');
        const rows = EpubcheckReport.read(epubcheck(oracle.jar, files), files).problems;
        assert.deepEqual(rows.map((p) => p.code + ' ' + p.severity), ['RSC-005 error', 'RSC-005 error'], describeMessages({ messages: rows.map((p) => ({ severity: p.severity, ID: p.code, message: p.message })) }));
        assert.deepEqual(rows.map((p) => files[chapter].slice(p.start, p.end)), ['<div>', '<p>']);
        assert.ok(rows.every((p) => p.file === chapter && p.category === 'epubcheck'));
    });
}

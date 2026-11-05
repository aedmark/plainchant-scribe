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
    const dir = ecFs.mkdtempSync(ecPath.join(ecOs.tmpdir(), 'scribe-epubcheck-'));
    try {
        const epub = ecPath.join(dir, 'book.epub');
        const report = ecPath.join(dir, 'report.json');
        ecFs.writeFileSync(epub, Zip.build(Object.keys(files).map((p) => ({ path: p, data: files[p] }))));
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

    test('epubcheck: a template with the modified date removed fails, so the oracle is really checking', () => {
        const files = BookTemplate.create().files;
        files['OEBPS/content.opf'] = files['OEBPS/content.opf'].replace(/ *<meta property="dcterms:modified">[^<]*<\/meta>\n/, '');
        const r = epubcheck(oracle.jar, files);
        assert.ok(r.messages.some((m) => m.severity === 'ERROR'), 'expected an error, got ' + describeMessages(r));
    });
}

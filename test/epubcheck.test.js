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

    test('epubcheck: a template with the modified date removed fails, so the oracle is really checking', () => {
        const files = BookTemplate.create().files;
        files['OEBPS/content.opf'] = files['OEBPS/content.opf'].replace(/ *<meta property="dcterms:modified">[^<]*<\/meta>\n/, '');
        const r = epubcheck(oracle.jar, files);
        assert.ok(r.messages.some((m) => m.severity === 'ERROR'), 'expected an error, got ' + describeMessages(r));
    });
}

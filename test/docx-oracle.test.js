/*
 * LibreOffice as the .docx oracle (P7-03, D-048): test/fixtures/docx/manuscript.fodt is converted to .docx by a real
 * word processor, imported as a new book, and the book is checked, with EPUBCheck when it is there. Runs only when
 * soffice is on the PATH (or SOFFICE names it); SCRIBE_SKIP_SOFFICE=1 skips it. A private profile folder keeps it
 * apart from a LibreOffice the maintainer has open.
 */
const loFs = require('fs');
const loPath = require('path');
const loOs = require('os');
const loChild = require('child_process');

function findSoffice() {
    if (process.env.SCRIBE_SKIP_SOFFICE === '1') return { reason: 'SCRIBE_SKIP_SOFFICE=1' };
    const named = process.env.SOFFICE;
    if (named) return loFs.existsSync(named) ? { bin: named } : { reason: 'SOFFICE does not exist' };
    try { return { bin: loChild.execFileSync('which', ['soffice'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() }; } catch (e) { return { reason: 'soffice is not on the PATH' }; }
}

const loOracle = findSoffice();

if (!loOracle.bin) {
    console.log('  skip libreoffice: oracle not run (' + loOracle.reason + ')');
} else {
    test('libreoffice: a manuscript saved as .docx by LibreOffice imports as a book with its structure, and passes EPUBCheck (oracle)', async () => {
        const dir = loFs.mkdtempSync(loPath.join(loOs.tmpdir(), 'scribe-lo-'));
        try {
            loChild.execFileSync(loOracle.bin, ['-env:UserInstallation=' + require('url').pathToFileURL(loPath.join(dir, 'profile')).href, '--headless', '--convert-to', 'docx', '--outdir', dir,
                loPath.join(__dirname, 'fixtures', 'docx', 'manuscript.fodt')], { stdio: 'ignore', timeout: 120000 });
            const doc = await Docx.read(loFs.readFileSync(loPath.join(dir, 'manuscript.docx')));
            assert.deepEqual([doc.title, doc.creator, doc.language], ['The Oracle Manuscript', 'Ora Cle', 'en-GB']);
            assert.deepEqual(doc.blocks.map((b) => b.type), ['heading', 'para', 'heading', 'item', 'item', 'item', 'quote', 'break', 'table', 'figure', 'heading', 'para', 'item', 'item']);
            const r = DocxImport.newBook(doc, { name: 'manuscript.docx' });
            assert.deepEqual(BookChapters.list(r.entries).map((c) => c.title), ['The First Chapter', 'The Second Chapter', 'Notes'], 'the endnote made a Notes chapter');
            const one = r.entries['OEBPS/text/the-first-chapter.xhtml'], two = r.entries['OEBPS/text/the-second-chapter.xhtml'];
            ['<strong>bold</strong>', '<em>italic</em>', '<span class="small-caps">small caps</span>', '<a href="https://example.org/">link</a>', 'The first footnote.', '<h2>A Section</h2>',
                '<li>Bullet one\n        <ol>', '<blockquote>', '<hr/>', '<th>Name</th>', '<img src="../images/image1.png" alt="A red dot"/>'].forEach((s) => assert.includes(one, s));
            assert.includes(two, 'endref-1');
            assert.includes(r.entries['OEBPS/text/notes.xhtml'], 'The endnote.');
            const jar = process.env.EPUBCHECK_JAR || (loFs.existsSync(loPath.join(__dirname, '..', '.tools')) ? loFs.readdirSync(loPath.join(__dirname, '..', '.tools')).filter((d) => /^epubcheck-/.test(d)).map((d) => loPath.join(__dirname, '..', '.tools', d, 'epubcheck.jar')).find((p) => loFs.existsSync(p)) : null);
            if (!jar) { console.log('  note libreoffice: EPUBCheck not run on the imported book (no jar)'); return; }
            const epub = loPath.join(dir, 'book.epub'), report = loPath.join(dir, 'report.json');
            loFs.writeFileSync(epub, (await BookExport.pack(r.entries, r.binaries)).bytes);
            try { loChild.execFileSync('java', ['-jar', jar, epub, '--json', report], { stdio: 'ignore' }); } catch (e) { /* non-zero when the book has errors */ }
            const messages = JSON.parse(loFs.readFileSync(report, 'utf8')).messages.map((m) => m.severity + ' ' + m.ID + ': ' + m.message);
            assert.deepEqual(messages, [], 'EPUBCheck on the imported book');
        } finally {
            loFs.rmSync(dir, { recursive: true, force: true });
        }
    });
}

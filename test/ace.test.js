/*
 * DAISY Ace as the accessibility oracle (P6-01, D-044). Runs only when Ace is installed in .tools/ace/ (or ACE_CLI
 * names its ace-cli) and a Chrome is found (PUPPETEER_EXECUTABLE_PATH, google-chrome-stable, google-chrome, chromium,
 * or puppeteer's own download). Otherwise it prints "not run" and registers no test. SCRIBE_SKIP_ACE=1 skips it.
 * Ace checks a whole book; this oracle holds Scribe to its metadata rules (metadata-*), the part P6-01 writes.
 */
const aceFs = require('fs');
const acePath = require('path');
const aceOs = require('os');
const aceChild = require('child_process');

function findAce() {
    if (process.env.SCRIBE_SKIP_ACE === '1') return { reason: 'SCRIBE_SKIP_ACE=1' };
    const cli = process.env.ACE_CLI || acePath.join(__dirname, '..', '.tools', 'ace', 'node_modules', '.bin', 'ace-cli');
    if (!aceFs.existsSync(cli)) return { reason: 'no ace-cli in .tools/ace/ or ACE_CLI' };
    let chrome = process.env.PUPPETEER_EXECUTABLE_PATH || null;
    if (!chrome) {
        for (const name of ['google-chrome-stable', 'google-chrome', 'chromium', 'chromium-browser']) {
            try { chrome = aceChild.execFileSync('which', [name], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); break; } catch (e) { /* try the next */ }
        }
    }
    const puppeteerCache = acePath.join(aceOs.homedir(), '.cache', 'puppeteer');
    if (!chrome && !aceFs.existsSync(puppeteerCache)) return { reason: 'no Chrome or Chromium found for Ace' };
    return { cli: cli, chrome: chrome };
}

// Ace's report on an .epub's bytes: the outcome and the metadata rules that failed.
function aceRun(ace, bytes) {
    const dir = aceFs.mkdtempSync(acePath.join(aceOs.tmpdir(), 'scribe-ace-'));
    try {
        const epub = acePath.join(dir, 'book.epub');
        aceFs.writeFileSync(epub, bytes);
        const env = Object.assign({}, process.env, ace.chrome ? { PUPPETEER_EXECUTABLE_PATH: ace.chrome } : {});
        aceChild.execFileSync(ace.cli, ['-s', '-o', acePath.join(dir, 'out'), epub], { stdio: 'ignore', env: env, timeout: 180000 });
        const r = JSON.parse(aceFs.readFileSync(acePath.join(dir, 'out', 'report.json'), 'utf8'));
        const failed = [];
        (r.assertions || []).forEach((doc) => (doc.assertions || []).forEach((a) => {
            if (a['earl:result']['earl:outcome'] === 'fail') failed.push(a['earl:test']['dct:title']);
        }));
        return { version: r['earl:assertedBy']['doap:release']['doap:revision'], failed: failed, metadata: r['a11y-metadata'] };
    } finally {
        aceFs.rmSync(dir, { recursive: true, force: true });
    }
}

const aceOracle = findAce();

if (!aceOracle.cli) {
    console.log('  skip ace: oracle not run (' + aceOracle.reason + ')');
} else {
    test('ace: a book without accessibility metadata fails Ace\'s metadata rules, and passes them once BookA11y writes it (oracle)', async () => {
        let files = ExampleBook.create().files;
        const before = aceRun(aceOracle, (await BookExport.pack(files, {})).bytes);
        const meta = (r) => r.failed.filter((t) => /^metadata-/.test(t)).sort();
        assert.deepEqual(meta(before), ['metadata-accessibilityfeature', 'metadata-accessibilityhazard', 'metadata-accessibilitysummary', 'metadata-accessmode', 'metadata-accessmodesufficient']);
        const s = BookA11y.suggest(files, []);
        s.state.conformance = { wcag: '2.2', level: 'AA', certifiedBy: 'Small Press', credential: 'Self-evaluated' };
        BookA11y.ops(s.state).forEach((op) => { files = Object.assign({}, files, { 'OEBPS/content.opf': XmlAst.applyEdits(files['OEBPS/content.opf'], op(Book.read(files).model)) }); });
        const after = aceRun(aceOracle, (await BookExport.pack(files, {})).bytes);
        assert.deepEqual(meta(after), [], 'Ace ' + after.version + ' finds no metadata problem');
        ['schema:accessMode', 'schema:accessibilityFeature', 'schema:accessibilityHazard', 'schema:accessibilitySummary', 'schema:accessModeSufficient', 'dcterms:conformsTo', 'a11y:certifiedBy', 'a11y:certifierCredential']
            .forEach((p) => assert.ok(after.metadata.present.indexOf(p) !== -1, p + ' is present for Ace'));
    });

    test('ace: the books Scribe writes give no epub-type-has-matching-role failures (P6-02 oracle)', async () => {
        const files = ExampleBook.create().files;
        files['OEBPS/text/chapter-1.xhtml'] = BookPages.insertAt(files['OEBPS/text/chapter-1.xhtml'], files['OEBPS/text/chapter-1.xhtml'].indexOf('<p>'), '1').text;
        const withList = BookPages.buildPageList(files, Book.read(files).model).entries;
        const r = aceRun(aceOracle, (await BookExport.pack(withList, {})).bytes);
        assert.deepEqual(r.failed.filter((t) => t === 'epub-type-has-matching-role'), []);
    });

    test('ace: front and back matter pages add no Ace failures to the book (P3-07 oracle)', async () => {
        const base = ExampleBook.create().files;
        let files = base;
        BookMatter.KINDS.forEach((k) => { files = BookMatter.add(files, { kind: k.key }, new Date('2026-11-06')).entries; });
        const before = new Set(aceRun(aceOracle, (await BookExport.pack(base, {})).bytes).failed);
        const after = aceRun(aceOracle, (await BookExport.pack(files, {})).bytes);
        assert.deepEqual(Array.from(new Set(after.failed)).filter((t) => !before.has(t)), [], 'Ace ' + after.version);
    });
}

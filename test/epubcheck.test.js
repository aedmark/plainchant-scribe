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

    test('epubcheck: a template with the modified date removed fails, so the oracle is really checking', () => {
        const files = BookTemplate.create().files;
        files['OEBPS/content.opf'] = files['OEBPS/content.opf'].replace(/ *<meta property="dcterms:modified">[^<]*<\/meta>\n/, '');
        const r = epubcheck(oracle.jar, files);
        assert.ok(r.messages.some((m) => m.severity === 'ERROR'), 'expected an error, got ' + describeMessages(r));
    });
}

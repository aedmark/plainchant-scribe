/* EpubcheckReport: EPUBCheck's JSON report as Problems-tab rows (P5-05, D-041). */
const erFs = require('fs');
const erPath = require('path');
const erRead = (p) => erFs.readFileSync(erPath.join(__dirname, '..', p), 'utf8');

const ER_CHAPTER = 'OEBPS/text/chapter-1.xhtml';
// A report trimmed from EPUBCheck 5.4.0's output on a chapter with a <div> inside <p> and a broken fragment (2026-11-06).
function erReport() {
    return {
        checker: { checkerVersion: '5.4.0', nFatal: 0, nError: 2, nWarning: 1 },
        messages: [
            { ID: 'RSC-005', severity: 'ERROR', message: 'Error while parsing file: element "div" not allowed here', locations: [{ path: ER_CHAPTER, line: 11, column: 13 }], suggestion: null },
            { ID: 'RSC-012', severity: 'ERROR', message: 'Fragment identifier is not defined.', locations: [{ path: ER_CHAPTER, line: 11, column: 40 }] },
            { ID: 'PKG-010', severity: 'WARNING', message: 'Filename contains spaces.', locations: [{ path: 'OEBPS/a b.png', line: -1, column: -1 }], suggestion: 'Rename it.' },
            { ID: 'ACC-008', severity: 'USAGE', message: 'Advice.', locations: [] }
        ]
    };
}

function erEntries() {
    const files = BookTemplate.create({ title: 'Check' }).files;
    files[ER_CHAPTER] = files[ER_CHAPTER].replace('<p>Begin', '<p><div>block</div><a href="#nope">x</a></p><p>Begin');
    return files;
}

test('epubcheck-report: rows select the tag EPUBCheck points at', () => {
    const entries = erEntries();
    const r = EpubcheckReport.read(erReport(), entries);
    const text = (p) => entries[p.file].slice(p.start, p.end);
    assert.equal(r.version, '5.4.0');
    assert.equal(r.errors, 2);
    assert.deepEqual(r.problems.map((p) => p.code), ['RSC-005', 'RSC-012', 'PKG-010', 'ACC-008']);
    assert.deepEqual(r.problems.map((p) => p.severity), ['error', 'error', 'warning', 'info']);
    assert.ok(r.problems.every((p) => p.category === 'epubcheck'));
    assert.equal(text(r.problems[0]), '<div>');
    assert.equal(text(r.problems[1]), '<a href="#nope">');
    assert.equal(r.problems[0].line, 11);
    assert.ok(/^RSC-005: Error while parsing file/.test(r.problems[0].message));
    assert.equal(r.problems[2].message, 'PKG-010: Filename contains spaces. Rename it.');
    assert.equal(r.problems[2].line, 0);
    assert.deepEqual([r.problems[3].file, r.problems[3].line], ['', 0]);
});

test('epubcheck-report: odd reports and locations do not throw', () => {
    assert.deepEqual(EpubcheckReport.read(null).problems, []);
    assert.deepEqual(EpubcheckReport.read({ messages: 'x' }).problems, []);
    const text = 'a\n<p>b</p>\nc';
    assert.deepEqual(EpubcheckReport.rangeAt(text, 2, 0), { start: 2, end: 10 }, 'no column: the whole line');
    assert.deepEqual(EpubcheckReport.rangeAt(text, 2, 4), { start: 2, end: 5 }, 'just past a tag: the tag');
    assert.deepEqual(EpubcheckReport.rangeAt(text, 2, 5), { start: 6, end: 10 }, 'inside text: the rest of the line');
    assert.deepEqual(EpubcheckReport.rangeAt(text, 2, 99), { start: 6, end: 10 }, 'past the line end: the tag it ends with');
    assert.deepEqual(EpubcheckReport.rangeAt(text, 9, 1), { start: 0, end: 0 }, 'past the last line');
    assert.deepEqual(EpubcheckReport.rangeAt(undefined, 1, 1), { start: 0, end: 0 }, 'a file the Studio does not hold as text');
    const many = { messages: [{ ID: 'X', severity: 'ERROR', message: 'm', locations: Array.from({ length: 30 }, () => ({ path: 'a', line: 1, column: 1 })) }] };
    assert.equal(EpubcheckReport.read(many, {}).problems.length, EpubcheckReport.LOCATION_LIMIT);
    assert.equal(EpubcheckReport.read({ messages: [{ ID: 'Y', severity: 'ODD', message: 'm' }] }).problems[0].severity, 'warning');
});

test('epubcheck-report: the desktop run is wired up and runs Java without a shell (P5-05)', () => {
    const ui = erRead('src/app/epubcheck-ui.js');
    const main = erRead('src-tauri/src/main.rs');
    const rust = erRead('src-tauri/src/epubcheck.rs');
    ['epubcheck_run', 'epubcheck_pick_jar', 'epubcheck_env_jar'].forEach((cmd) => {
        assert.includes(ui, "'" + cmd + "'");
        assert.includes(main, 'epubcheck::' + cmd);
        assert.ok(new RegExp('pub (async )?fn ' + cmd + '[(]').test(rust), cmd);
    });
    assert.ok(!/"(sh|bash|cmd)"|"\/C"|"-c"/.test(rust), 'no shell between the app and Java');
    assert.includes(rust, 'Command::new(java)');
    assert.includes(rust, 'remove_dir_all(&dir)');
    // The run checks the book as Export packs it, and does not change dcterms:modified.
    assert.includes(ui, 'packOpenBook()');
    assert.ok(!/touchModified/.test(ui));
    const listed = Array.from(erRead('app.html').matchAll(/<script src="([^"]+)"><\/script>/g)).map((m) => m[1]);
    assert.ok(listed.indexOf('src/app/epubcheck-ui.js') > listed.indexOf('src/app/epub-export-ui.js'), 'epubcheck-ui.js loads after epub-export-ui.js (it uses packOpenBook)');
});

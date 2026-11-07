/* BookA11y: accessibility metadata (P6-01, D-044), from EPUB Accessibility 1.1 and the Accessibility Vocabulary 1.1. */

const A11Y_OPF = 'OEBPS/content.opf';

function a11yBook() {
    return BookTemplate.create({ title: 'Seen and Heard', uuid: '3c8bee06-354b-4d4b-8ba6-3b91273750fd', now: Date.UTC(2026, 10, 6) }).files;
}

// Applies ops one at a time, each on a fresh read, as applyBookOps does in the app.
function a11yApply(entries, ops) {
    let files = Object.assign({}, entries);
    ops.forEach((op) => {
        const model = Book.read(files).model;
        files = Object.assign({}, files, { [A11Y_OPF]: XmlAst.applyEdits(files[A11Y_OPF], op(model)) });
    });
    return files;
}

const a11yModel = (entries) => Book.read(entries).model;
const a11yCodes = (entries) => BookA11y.check(a11yModel(entries)).map((p) => p.code);

const A11Y_FULL = {
    modes: ['textual', 'visual'], sufficient: ['textual,visual', 'textual'], features: ['tableOfContents', 'alternativeText'],
    hazards: { flashing: 'no', motionSimulation: 'no', sound: 'no' }, summary: '  All images   are described. ',
    conformance: { wcag: '2.2', level: 'AA', certifiedBy: 'Acme Press', credential: 'DAISY Ace' }
};

test('book-a11y: a new book says it lacks the required metadata', () => {
    const e = a11yBook();
    const r = BookA11y.read(a11yModel(e));
    assert.deepEqual([r.modes, r.features, r.sufficient, r.summary, r.conformance], [[], [], [], '', null]);
    const p = BookA11y.check(a11yModel(e));
    assert.equal(p.length, 1);
    assert.equal(p[0].code, 'a11y-metadata-missing');
    assert.equal(p[0].severity, 'warning');
    assert.includes(p[0].message, 'access modes, accessibility features, hazards');
    assert.includes(p[0].message, '§2.2');
});

test('book-a11y: writing a state splices only metas, reads back, and repeats as no change', () => {
    const before = a11yBook();
    const after = a11yApply(before, BookA11y.ops(A11Y_FULL));
    const opf = after[A11Y_OPF];
    ['<meta property="schema:accessMode">textual</meta>', '<meta property="schema:accessMode">visual</meta>',
        '<meta property="schema:accessModeSufficient">textual,visual</meta>', '<meta property="schema:accessModeSufficient">textual</meta>',
        '<meta property="schema:accessibilityFeature">tableOfContents</meta>', '<meta property="schema:accessibilityHazard">none</meta>',
        '<meta property="schema:accessibilitySummary">All images are described.</meta>',
        '<meta property="dcterms:conformsTo" id="conf">EPUB Accessibility 1.1 - WCAG 2.2 Level AA</meta>',
        '<meta refines="#conf" property="a11y:certifiedBy" id="certifier">Acme Press</meta>', '<meta refines="#certifier" property="a11y:certifierCredential">DAISY Ace</meta>'].forEach((s) => assert.includes(opf, s));
    assert.ok(!/xmlns:schema|prefix=/.test(opf), 'schema, a11y, and dcterms are reserved prefixes (EPUB 3.3 §D.1.3)');
    assert.equal(opf.replace(/\n\s*<meta (property="(schema|dcterms:conformsTo|a11y)|refines="#(conf|certifier))[^\n]*/g, ''), before[A11Y_OPF], 'nothing else in content.opf changed');
    const r = BookA11y.read(a11yModel(after));
    assert.deepEqual(r.modes, ['textual', 'visual']);
    assert.deepEqual(r.sufficient, ['textual,visual', 'textual']);
    assert.deepEqual(r.hazards, { flashing: 'no', motionSimulation: 'no', sound: 'no' });
    assert.deepEqual(r.conformance, { value: 'EPUB Accessibility 1.1 - WCAG 2.2 Level AA', wcag: '2.2', level: 'AA', certifiedBy: 'Acme Press', credential: 'DAISY Ace' });
    assert.deepEqual(BookA11y.check(a11yModel(after)), []);
    assert.deepEqual(Book.read(after).problems.filter((p) => p.severity !== 'info'), []);
    assert.equal(a11yApply(after, BookA11y.ops(r))[A11Y_OPF], opf, 'writing what was read changes nothing');
});

test('book-a11y: a change adds and removes only what changed, and keeps values Scribe does not offer', () => {
    const one = a11yApply(a11yBook(), BookA11y.ops(A11Y_FULL));
    const withOdd = Object.assign({}, one, { [A11Y_OPF]: one[A11Y_OPF].replace('</metadata>', '<meta property="schema:accessibilityFeature">futureFeature</meta></metadata>') });
    const state = BookA11y.read(a11yModel(withOdd));
    state.features = ['tableOfContents', 'MathML'];
    state.hazards = { flashing: 'yes', motionSimulation: 'no', sound: 'unknown' };
    state.conformance = null;
    state.summary = '';
    const doubled = Object.assign({}, one, { [A11Y_OPF]: one[A11Y_OPF].replace('</metadata>', '<meta property="schema:accessMode">textual</meta></metadata>') });
    assert.equal((a11yApply(doubled, BookA11y.ops(A11Y_FULL))[A11Y_OPF].match(/schema:accessMode">textual/g) || []).length, 1, 'a repeated value is written once');
    const two = a11yApply(withOdd, BookA11y.ops(state));
    const r = BookA11y.read(a11yModel(two));
    assert.deepEqual(r.features, ['tableOfContents', 'futureFeature', 'MathML'], 'futureFeature stays; alternativeText goes; MathML is appended');
    assert.deepEqual(r.hazardTerms, ['flashing', 'noMotionSimulationHazard', 'unknownSoundHazard']);
    assert.equal(r.conformance, null);
    assert.ok(!/a11y:certifiedBy|a11y:certifierCredential|dcterms:conformsTo|accessibilitySummary/.test(two[A11Y_OPF]), 'the claim goes with its refinements');
    assert.ok(two[A11Y_OPF].indexOf('tableOfContents') === one[A11Y_OPF].indexOf('tableOfContents'), 'a kept value stays in place');
    assert.deepEqual(a11yCodes(two), ['a11y-summary-missing', 'a11y-unknown-value']);
});

test('book-a11y: rows point at content.opf with a line, for the Problems tab', () => {
    const e = a11yBook();
    const rows = BookA11y.rows(a11yModel(e));
    assert.equal(rows.length, 1);
    assert.deepEqual([rows[0].file, rows[0].line, rows[0].category, e[A11Y_OPF].slice(rows[0].start, rows[0].end)], [A11Y_OPF, 3, 'accessibility', '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">']);
});

test('book-a11y: hazard terms follow the vocabulary\'s none and unknown rules', () => {
    assert.deepEqual(BookA11y.hazardTerms({ flashing: 'no', motionSimulation: 'no', sound: 'no' }), ['none']);
    assert.deepEqual(BookA11y.hazardTerms({ flashing: 'unknown', motionSimulation: 'unknown', sound: 'unknown' }), ['unknown']);
    assert.deepEqual(BookA11y.hazardTerms({ flashing: 'yes', motionSimulation: '', sound: 'no' }), ['flashing', 'noSoundHazard']);
    assert.deepEqual(BookA11y.hazardTerms({}), []);
});

test('book-a11y: a conformance claim needs its evaluator, and other conformsTo statements stay', () => {
    const e = a11yBook();
    const other = Object.assign({}, e, { [A11Y_OPF]: e[A11Y_OPF].replace('</metadata>', '<meta property="dcterms:conformsTo">https://example.org/other-standard</meta></metadata>') });
    assert.throws(() => a11yApply(other, BookA11y.ops(Object.assign({}, A11Y_FULL, { conformance: { wcag: '2.2', level: 'AA', certifiedBy: ' ' } }))), /§3\.5\.3\.1/);
    assert.throws(() => a11yApply(other, BookA11y.ops(Object.assign({}, A11Y_FULL, { conformance: { wcag: '3.0', level: 'AA', certifiedBy: 'X' } }))), /WCAG version/);
    const claimed = a11yApply(other, BookA11y.ops(A11Y_FULL));
    const dropped = a11yApply(claimed, BookA11y.ops(Object.assign({}, A11Y_FULL, { conformance: null })));
    assert.includes(dropped[A11Y_OPF], 'https://example.org/other-standard');
    const changed = a11yApply(claimed, BookA11y.ops(Object.assign({}, A11Y_FULL, { conformance: { wcag: '2.1', level: 'A', certifiedBy: 'Jane Doe', credential: '' } })));
    const r = BookA11y.read(a11yModel(changed));
    assert.deepEqual([r.conformance.value, r.conformance.certifiedBy, r.conformance.credential], ['EPUB Accessibility 1.1 - WCAG 2.1 Level A', 'Jane Doe', '']);
    assert.equal(BookA11y.conformanceValue({ wcag: '2.0', level: 'AAA' }), 'EPUB Accessibility 1.1 - WCAG 2.0 Level AAA');
    assert.includes(changed[A11Y_OPF], '<meta refines="#conf" property="a11y:certifiedBy" id="certifier">Jane Doe</meta>', 'the id it got for the credential stays');
    const plain = a11yApply(other, BookA11y.ops(Object.assign({}, A11Y_FULL, { conformance: { wcag: '2.2', level: 'AA', certifiedBy: 'Jane Doe' } })));
    assert.includes(plain[A11Y_OPF], '<meta refines="#conf" property="a11y:certifiedBy">Jane Doe</meta>', 'no credential, no id on the evaluator');
});

test('book-a11y: suggest proposes values from the book, with reasons, and writes nothing', () => {
    const e = a11yBook();
    const ch = 'OEBPS/text/chapter-1.xhtml';
    e[ch] = e[ch].replace('</section>', '<figure><img src="../images/a.png" alt="A map"/></figure><img src="../images/b.png"/><math xmlns="http://www.w3.org/1998/Math/MathML" alttext="x squared"><msup><mi>x</mi><mn>2</mn></msup></math><span epub:type="pagebreak" role="doc-pagebreak" id="p1" aria-label="1"/></section>');
    const before = e[A11Y_OPF];
    const s = BookA11y.suggest(e, ['OEBPS/images/a.png', 'OEBPS/images/b.png']);
    assert.equal(e[A11Y_OPF], before);
    assert.deepEqual(s.state.modes, ['textual', 'visual']);
    assert.deepEqual(s.state.sufficient, ['textual,visual'], 'one image has no alt text, so text alone is not enough');
    assert.deepEqual(s.state.features, ['tableOfContents', 'structuralNavigation', 'MathML', 'describedMath', 'pageBreakMarkers']);
    assert.ok(s.state.features.indexOf('alternativeText') === -1);
    assert.deepEqual(s.state.hazards, { flashing: 'no', motionSimulation: 'no', sound: 'no' });
    assert.includes(s.reasons.visual, '2 images');
    assert.includes(s.reasons.hazards, 'Make sure no image flashes');
    assert.includes(s.state.summary, 'a table of contents, headings for navigation, mathematics in MathML, descriptions of its mathematics and page-break markers');
    assert.includes(s.state.summary, 'Some images are not described in text.');
    e[ch] = e[ch].replace('<img src="../images/b.png"/>', '<img src="../images/b.png" alt=""/>');
    const all = BookA11y.suggest(e, ['OEBPS/images/a.png', 'OEBPS/images/b.png', 'OEBPS/images/spin.gif']);
    assert.deepEqual(all.state.sufficient, ['textual,visual', 'textual']);
    assert.ok(all.state.features.indexOf('alternativeText') !== -1);
    assert.equal(all.state.hazards.flashing, 'unknown', 'a GIF might flash');
    assert.includes(all.state.summary, 'It can be read in text alone');
    assert.equal(BookA11y.suggest({ 'OEBPS/content.opf': '<nope' }, []), null);
});

test('book-a11y: check flags deprecated, unknown, and contradictory values, and a malformed claim', () => {
    const e = a11yApply(a11yBook(), BookA11y.ops(Object.assign({}, A11Y_FULL, { conformance: null })));
    const add = (xml) => Object.assign({}, e, { [A11Y_OPF]: e[A11Y_OPF].replace('</metadata>', xml + '</metadata>') });
    assert.deepEqual(a11yCodes(add('<meta property="schema:accessibilityFeature">captions</meta>')), ['a11y-deprecated']);
    assert.includes(BookA11y.check(a11yModel(add('<meta property="schema:accessibilityFeature">printPageNumbers</meta>')))[0].message, 'use pageBreakMarkers');
    assert.deepEqual(a11yCodes(add('<meta property="schema:accessMode">smell</meta>')), ['a11y-unknown-value']);
    assert.deepEqual(a11yCodes(add('<meta property="schema:accessModeSufficient">textual,smell</meta>')), ['a11y-unknown-value']);
    assert.deepEqual(a11yCodes(add('<meta property="schema:accessibilityFeature">none</meta>')), ['a11y-feature-alone']);
    const alone = a11yApply(a11yBook(), BookA11y.ops(Object.assign({}, A11Y_FULL, { features: ['none'], conformance: null })));
    assert.deepEqual(a11yCodes(alone), [], 'none on its own is fine');
    assert.deepEqual(a11yCodes(add('<meta property="schema:accessibilityHazard">flashing</meta>')), ['a11y-hazard-conflict']);
    assert.deepEqual(a11yCodes(add('<meta property="schema:accessibilityHazard">unknownSoundHazard</meta><meta property="schema:accessibilityHazard">noSoundHazard</meta>')), ['a11y-hazard-conflict']);
    assert.deepEqual(a11yCodes(add('<meta property="dcterms:conformsTo">EPUB Accessibility 1.1 - WCAG 2.2 level AA</meta>')), ['a11y-conformance-format', 'a11y-certifier-missing']);
    assert.deepEqual(a11yCodes(add('<meta property="dcterms:conformsTo">EPUB Accessibility 1.1 - WCAG 2.2 Level AA</meta><meta property="a11y:certifiedBy">Acme</meta>')), [], 'a book-level certifier also names the evaluator');
});

test('book-a11y: the Book tab section and the Problems rows are wired in (P6-01)', () => {
    const fsA = require('fs'), pathA = require('path');
    const read = (p) => fsA.readFileSync(pathA.join(__dirname, '..', p), 'utf8');
    const html = read('app.html');
    ['id="a11yHeading"', 'id="a11ySuggestBtn"', 'id="a11yDraftBtn"', 'id="a11yModes"', 'id="a11ySufficient"', 'id="a11yFeatures"', 'id="a11yHazards"', 'id="a11ySummary"', 'id="a11yClaim"', 'id="a11yCertifiedBy"']
        .forEach((n) => assert.includes(html, n));
    const order = Array.from(html.matchAll(/<script src="([^"]+)"><\/script>/g)).map((m) => m[1]);
    assert.ok(order.indexOf('src/app/a11y-ui.js') > order.indexOf('src/app/book-ui.js'), 'a11y-ui.js loads after book-ui.js (it uses applyBookOps)');
    assert.includes(read('src/app/book-ui.js'), 'refreshA11y(r.model)');
    assert.includes(read('src/app/problems-ui.js'), 'BookA11y.rows(model)');
    const ui = read('src/app/a11y-ui.js');
    assert.includes(ui, 'askConfirm(');
    assert.ok(/BookA11y\.suggest[\s\S]*askConfirm[\s\S]*applyBookOps/.test(ui), 'suggestions are written only after the author confirms');
});

// The Book tab's Accessibility section (P6-01, D-044): the schema.org accessibility metadata EPUB Accessibility 1.1
// requires, and an optional conformance claim. Each change writes BookA11y ops to content.opf as one undo step.
// Suggest from the book only adds what Scribe can see, after the author confirms; the metadata is their claim.

const a11yModesBox = document.getElementById('a11yModes');
const a11ySufficientBox = document.getElementById('a11ySufficient');
const a11yFeaturesBox = document.getElementById('a11yFeatures');
const a11yHazardsBox = document.getElementById('a11yHazards');
const a11ySummaryInput = document.getElementById('a11ySummary');
const a11yClaim = document.getElementById('a11yClaim');
const a11yClaimFields = document.getElementById('a11yClaimFields');

// Plain words for each term; the term itself is shown beside them, as stores and libraries display it.
const A11Y_WORDS = {
    textual: 'Text', visual: 'Images', auditory: 'Sound', tactile: 'Touch (braille, tactile)',
    textOnVisual: 'Text in images', chartOnVisual: 'Charts', chemOnVisual: 'Chemistry in images', diagramOnVisual: 'Diagrams', mathOnVisual: 'Maths in images', musicOnVisual: 'Music notation', colorDependent: 'Meaning carried by colour',
    tableOfContents: 'Table of contents', structuralNavigation: 'Headings follow the outline', readingOrder: 'Reading order matches the layout', pageBreakMarkers: 'Page-break markers', pageNavigation: 'Page list', index: 'Index', ARIA: 'ARIA roles', taggedPDF: 'Tagged PDF',
    alternativeText: 'Alt text for images', longDescription: 'Long descriptions', describedMath: 'Maths described in text', transcript: 'Transcripts', audioDescription: 'Audio description', closedCaptions: 'Closed captions', openCaptions: 'Open captions', signLanguage: 'Sign language',
    displayTransformability: 'Readers can restyle the text', synchronizedAudioText: 'Synchronized audio and text', timingControl: 'Timing can be controlled', unlocked: 'No DRM',
    MathML: 'MathML', 'MathML-chemistry': 'Chemistry in MathML', ChemML: 'ChemML', latex: 'LaTeX', 'latex-chemistry': 'Chemistry in LaTeX', ttsMarkup: 'Text-to-speech hints',
    highContrastAudio: 'High-contrast audio', highContrastDisplay: 'High-contrast display', largePrint: 'Large print', braille: 'Braille', tactileGraphic: 'Tactile graphics', tactileObject: 'Tactile objects',
    rubyAnnotations: 'Ruby annotations', fullRubyAnnotations: 'Full ruby annotations', horizontalWriting: 'Horizontal writing', verticalWriting: 'Vertical writing', withAdditionalWordSegmentation: 'Extra word spacing', withoutAdditionalWordSegmentation: 'No extra word spacing',
    none: 'No accessibility features', unknown: 'Not yet checked'
};
const A11Y_SETS = ['textual', 'textual,visual', 'visual', 'auditory', 'textual,auditory', 'tactile'];
const A11Y_HAZARD_WORDS = { flashing: 'Flashing', motionSimulation: 'Motion simulation', sound: 'Sound' };
let a11yLast = null;

function a11yCheck(term, checked, label) {
    const wrap = document.createElement('label');
    wrap.className = 'a11y-check';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.value = term;
    box.checked = checked;
    box.addEventListener('change', saveA11y);
    const words = document.createElement('span');
    words.textContent = label || A11Y_WORDS[term] || term;
    const code = document.createElement('code');
    code.textContent = term;
    words.appendChild(code);
    wrap.append(box, words);
    return wrap;
}

const a11yTicked = (box) => Array.from(box.querySelectorAll('input[type=checkbox]:checked')).map((b) => b.value);

function a11yGroup(title, terms, ticked, open) {
    const d = document.createElement('details');
    d.className = 'a11y-group';
    d.open = open || terms.some((t) => ticked.indexOf(t) !== -1);
    const s = document.createElement('summary');
    s.textContent = title;
    const box = document.createElement('div');
    box.className = 'a11y-checks';
    terms.forEach((t) => box.appendChild(a11yCheck(t, ticked.indexOf(t) !== -1)));
    d.append(s, box);
    return d;
}

function refreshA11y(model) {
    const r = BookA11y.read(model);
    a11yLast = r;
    a11yModesBox.textContent = '';
    BookA11y.MODES.forEach((m) => a11yModesBox.appendChild(a11yCheck(m, r.modes.indexOf(m) !== -1)));
    const visual = a11yGroup('More about the images', BookA11y.VISUAL_MODES, r.modes);
    visual.style.gridColumn = '1 / -1';
    a11yModesBox.appendChild(visual);
    a11ySufficientBox.textContent = '';
    Array.from(new Set(A11Y_SETS.concat(r.sufficient))).forEach((set) => {
        a11ySufficientBox.appendChild(a11yCheck(set, r.sufficient.indexOf(set) !== -1, set.split(',').map((m) => A11Y_WORDS[m] || m).join(' and ')));
    });
    a11yFeaturesBox.textContent = '';
    BookA11y.FEATURES.forEach(([title, terms], i) => a11yFeaturesBox.appendChild(a11yGroup(title, terms, r.features, i < 2)));
    a11yFeaturesBox.appendChild(a11yGroup('Neither', ['none', 'unknown'], r.features));
    a11yHazardsBox.textContent = '';
    BookA11y.HAZARDS.forEach((h) => {
        const wrap = document.createElement('label');
        wrap.className = 'insp-field';
        const span = document.createElement('span');
        span.textContent = A11Y_HAZARD_WORDS[h];
        const sel = document.createElement('select');
        sel.dataset.hazard = h;
        [['', 'Not stated'], ['no', 'None'], ['yes', 'Present'], ['unknown', 'Unknown']].forEach(([v, label]) => {
            const o = document.createElement('option'); o.value = v; o.textContent = label; sel.appendChild(o);
        });
        sel.value = r.hazards[h];
        sel.addEventListener('change', saveA11y);
        wrap.append(span, sel);
        a11yHazardsBox.appendChild(wrap);
    });
    if (document.activeElement !== a11ySummaryInput) a11ySummaryInput.value = r.summary;
    const offered = new Set(Object.keys(A11Y_WORDS));
    const other = r.features.concat(r.modes).filter((t) => !offered.has(t));
    const other2 = document.getElementById('a11yOther');
    other2.hidden = !other.length;
    other2.textContent = other.length ? 'Also in content.opf, kept as written: ' + other.join(', ') + '.' : '';
    a11yClaim.checked = Boolean(r.conformance);
    a11yClaimFields.hidden = !r.conformance;
    const wcag = document.getElementById('a11yWcag'), level = document.getElementById('a11yLevel');
    if (!wcag.options.length) {
        BookA11y.WCAG.versions.forEach((v) => { const o = document.createElement('option'); o.value = v; o.textContent = 'WCAG ' + v; wcag.appendChild(o); });
        BookA11y.WCAG.levels.forEach((v) => { const o = document.createElement('option'); o.value = v; o.textContent = 'Level ' + v; level.appendChild(o); });
    }
    wcag.value = (r.conformance && r.conformance.wcag) || '2.2';
    level.value = (r.conformance && r.conformance.level) || 'AA';
    document.getElementById('a11yCertifiedBy').value = (r.conformance && r.conformance.certifiedBy) || '';
    document.getElementById('a11yCredential').value = (r.conformance && r.conformance.credential) || '';
}

// The state the form shows, for BookA11y.ops.
function a11yFormState() {
    const hazards = {};
    a11yHazardsBox.querySelectorAll('select').forEach((s) => { hazards[s.dataset.hazard] = s.value; });
    const keep = (list, shown) => list.filter((t) => !shown.has(t));
    const shownModes = new Set(BookA11y.MODES.concat(BookA11y.VISUAL_MODES));
    return {
        modes: a11yTicked(a11yModesBox).concat(keep(a11yLast ? a11yLast.modes : [], shownModes)),
        sufficient: a11yTicked(a11ySufficientBox),
        features: a11yTicked(a11yFeaturesBox),
        hazards: hazards,
        summary: a11ySummaryInput.value,
        conformance: a11yClaim.checked ? {
            wcag: document.getElementById('a11yWcag').value, level: document.getElementById('a11yLevel').value,
            certifiedBy: document.getElementById('a11yCertifiedBy').value, credential: document.getElementById('a11yCredential').value
        } : null
    };
}

function saveA11y() {
    if (a11yClaim.checked && !document.getElementById('a11yCertifiedBy').value.trim()) {
        // A claim must name its evaluator (EPUB Accessibility 1.1 §3.5.3.1): start from the publisher or the first creator.
        const f = BookMeta.fields(bookRead().model);
        document.getElementById('a11yCertifiedBy').value = f.publisher || (f.creators[0] && f.creators[0].name) || '';
        a11yClaimFields.hidden = false;
        if (!document.getElementById('a11yCertifiedBy').value) { document.getElementById('a11yCertifiedBy').focus(); showNotice('Say who checked the book, then the claim is written.'); return; }
    }
    applyBookOps(BookA11y.ops(a11yFormState()));
}

async function suggestA11y() {
    syncBufferFromEditor();
    const s = BookA11y.suggest(projectFiles.entries, Object.keys(projectAssets || {}));
    if (!s) { showNotice('content.opf cannot be read, so nothing can be suggested.', true); return; }
    const now = a11yFormState();
    const add = (have, more) => have.concat(more.filter((t) => have.indexOf(t) === -1));
    const next = Object.assign({}, now, {
        modes: add(now.modes, s.state.modes), sufficient: add(now.sufficient, s.state.sufficient), features: add(now.features, s.state.features),
        hazards: Object.assign({}, s.state.hazards, Object.keys(now.hazards).reduce((o, k) => { if (now.hazards[k]) o[k] = now.hazards[k]; return o; }, {})),
        summary: now.summary.trim() ? now.summary : s.state.summary
    });
    const lines = [];
    const words = (t) => (A11Y_WORDS[t] || t);
    const why = (t) => (s.reasons[t] ? '. ' + s.reasons[t] : '');
    next.modes.filter((m) => now.modes.indexOf(m) === -1).forEach((m) => lines.push('Perceived through: ' + words(m) + why(m)));
    next.features.filter((f) => now.features.indexOf(f) === -1).forEach((f) => lines.push('Feature: ' + words(f) + why(f)));
    next.sufficient.filter((x) => now.sufficient.indexOf(x) === -1).forEach((x) => lines.push('Enough on its own: ' + x.split(',').map(words).join(' and ')));
    BookA11y.HAZARDS.filter((h) => !now.hazards[h]).forEach((h) => lines.push(A11Y_HAZARD_WORDS[h] + ' hazard: ' + ({ no: 'none', unknown: 'unknown', yes: 'present' }[next.hazards[h]])));
    if (!now.summary.trim() && next.summary) lines.push('Summary: ' + next.summary);
    if (!lines.length) { showNotice('Nothing to add: the form already says everything Scribe can see in the book.'); return; }
    if (s.reasons.hazards && BookA11y.HAZARDS.some((h) => !now.hazards[h])) lines.push('', s.reasons.hazards);
    if (!await askConfirm({ title: 'Add these accessibility details?', text: lines.join('\n') + '\n\nNothing is removed. Check each claim against the book.', confirm: 'Add them' })) return;
    applyBookOps(BookA11y.ops(next));
}

document.getElementById('a11ySuggestBtn').addEventListener('click', () => { suggestA11y().catch((err) => showNotice('Could not suggest: ' + (err && err.message || err), true)); });
document.getElementById('a11yDraftBtn').addEventListener('click', () => {
    const text = BookA11y.summary(a11yFormState());
    if (!text) { showNotice('Tick some features or hazards first; the draft is made from them.'); return; }
    a11ySummaryInput.value = text;
    saveA11y();
});
a11ySummaryInput.addEventListener('change', saveA11y);
a11yClaim.addEventListener('change', () => { a11yClaimFields.hidden = !a11yClaim.checked; saveA11y(); });
['a11yWcag', 'a11yLevel', 'a11yCertifiedBy', 'a11yCredential'].forEach((id) => document.getElementById(id).addEventListener('change', saveA11y));

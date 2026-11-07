const inspProblemsPane = document.getElementById('inspProblemsPane');
const problemsList = document.getElementById('problemsList');
const problemsSummary = document.getElementById('problemsSummary');
const problemsCountBadge = document.getElementById('problemsCountBadge');
const linkChecker = Links.createChecker();
const hintChecker = Hints.createChecker();
const problemsFilterButtons = Array.from(document.querySelectorAll('.problems-filter-btn'));
let problemsTimer = null;
const cssLintChecker = CssLint.createChecker();
// A book's problems come from BookCheck (P5-04, D-040); images' first bytes are read once, for their media type.
const bookChecker = BookCheck.createChecker();
const assetHeads = new Map();
// The last EPUBCheck run (P5-05, D-041): its rows, the book it ran on, and the files as they were then.
let epubcheckRun = null;
let problemsResult = { problems: [], errors: 0, warnings: 0 };
let problemsFilter = settings.problemsFilter;

function knownProjectPaths() {
    const tree = Array.isArray(projectFiles.tree) ? projectFiles.tree.filter((i) => i.kind === 'file').map((i) => i.path) : [];
    return tree.concat(Object.keys(typeof projectAssets === 'object' ? projectAssets : {}));
}

function problemEntries() {
    ensureEntries();
    const entries = Object.assign({}, projectFiles.entries);
    if (activeFile in entries) entries[activeFile] = editor.value;
    return entries;
}

// Reads the first bytes of image assets not read yet, then checks again.
function loadAssetHeads() {
    const assets = typeof projectAssets === 'object' ? projectAssets : {};
    const wanted = Object.keys(assets).filter((p) => /\.(png|jpe?g|gif|webp)$/i.test(p) && assets[p] instanceof Blob && (!assetHeads.has(p) || assetHeads.get(p).blob !== assets[p]));
    if (!wanted.length) return;
    Promise.all(wanted.map((p) => assets[p].slice(0, 16).arrayBuffer().then((b) => assetHeads.set(p, { blob: assets[p], bytes: new Uint8Array(b) }))))
        .then(() => { if (isBookProject()) runProblemsCheck(); }, () => {});
}

// Every problem BookCheck finds in the open book, with the stylesheet lint.
function bookProblems(entries) {
    const e = entries || problemEntries();
    const heads = {};
    assetHeads.forEach((v, p) => { if (projectAssets && projectAssets[p] === v.blob) heads[p] = v.bytes; });
    const assets = Object.keys(projectAssets || {});
    // The accessibility metadata rules (P6-01) join BookCheck's accessibility category.
    const model = Book.read(e, { assets: assets }).model;
    const docs = model ? model.manifest.items.filter((i) => i.mediaType === 'application/xhtml+xml' && i.path && typeof e[i.path] === 'string').map((i) => i.path) : [];
    // P6-02: roles, page numbers, language tags, and reading order join the accessibility category.
    const more = model ? [].concat(BookA11y.rows(model), BookRoles.rows(e, docs), BookPages.rows(e, model), BookLang.rows(e, docs), BookOrder.rows(e, model), BookMatter.rows(e, model), BookNcx.rows(e, model)) : [];
    // An NCX the author switched on in the Chapters tab is not worth the legacy note (P7-04).
    const ncxOwned = BookNcx.state(e, assets).owned;
    return bookChecker.check(e, { assets: assets, heads: heads }).problems.filter((p) => !(ncxOwned && p.code === 'legacy-ncx')).concat(cssLintChecker.check(e).problems, more);
}

function runProblemsCheck() {
    clearTimeout(problemsTimer);
    problemsTimer = null;
    const entries = problemEntries();
    let problems;
    if (isBookProject()) {
        loadAssetHeads();
        problems = bookProblems(entries);
        if (epubcheckRun && epubcheckRun.book === currentScriptId) problems = problems.concat(epubcheckRun.problems);
    } else {
        const links = linkChecker.check(entries, knownProjectPaths());
        const hints = hintChecker.check(entries);
        const order = Object.keys(entries);
        problems = links.problems.map((p) => Object.assign({ category: 'links' }, p)).concat(hints.problems)
            .sort((a, b) => (order.indexOf(a.file) - order.indexOf(b.file)) || (a.start - b.start));
    }
    problemsResult = { problems: problems, epubcheckStale: epubcheckChanged(entries) };
    renderProblems();
}

// True when the book's files differ from those EPUBCheck last checked.
function epubcheckChanged(entries) {
    if (!epubcheckRun || epubcheckRun.book !== currentScriptId) return false;
    const was = epubcheckRun.entries;
    const keys = Object.keys(entries);
    return keys.length !== Object.keys(was).length || keys.some((k) => was[k] !== entries[k]);
}

function scheduleProblemsCheck() {
    clearTimeout(problemsTimer);
    problemsTimer = setTimeout(runProblemsCheck, 500);
}

function jumpToProblem(problem) {
    if (panesShown() === 'preview') setPanes('both');
    openFileInEditor(problem.file);
    editor.focus({ preventScroll: true });
    editor.setSelectionRange(problem.start, problem.end);
    editor.scrollTop = Math.max(0, textTopIn(editor.value, problem.start) - editor.clientHeight / 3);
    shadeLayer.scrollTop = editor.scrollTop;
}

function renderProblems() {
    const book = isBookProject();
    if (typeof refreshEpubcheckButton === 'function') refreshEpubcheckButton();
    // Package and Stylesheets are book categories; EPUBCheck runs only in the desktop app.
    const shown = (f) => f === 'epubcheck' ? book && hasTauri() : book || (f !== 'package' && f !== 'stylesheets');
    const filter = shown(problemsFilter) ? problemsFilter : 'all';
    const problems = problemsResult.problems.filter((p) => filter === 'all' || p.category === filter);
    const errors = problems.filter((p) => p.severity === 'error').length;
    const notes = problems.filter((p) => p.severity === 'info').length;
    const warnings = problems.length - errors - notes;
    problemsFilterButtons.forEach((btn) => {
        btn.hidden = !shown(btn.dataset.filter);
        const count = problemsResult.problems.filter((p) => btn.dataset.filter === 'all' || p.category === btn.dataset.filter).length;
        btn.setAttribute('aria-pressed', String(btn.dataset.filter === filter));
        btn.textContent = btn.dataset.filter.charAt(0).toUpperCase() + btn.dataset.filter.slice(1) + (count ? ' ' + count : '');
    });
    problemsCountBadge.hidden = problems.length === 0;
    problemsCountBadge.textContent = String(problems.length);
    problemsCountBadge.classList.toggle('has-error', errors > 0);
    if (inspProblemsPane.hidden) return;
    problemsSummary.textContent = problems.length
        ? errors + (errors === 1 ? ' error' : ' errors') + ', ' + warnings + (warnings === 1 ? ' warning' : ' warnings') + (notes ? ', ' + notes + (notes === 1 ? ' note' : ' notes') : '')
        : (filter === 'all' ? 'No problems found.' : filter === 'epubcheck' && !(epubcheckRun && epubcheckRun.book === currentScriptId) ? 'EPUBCheck has not been run on this book.' : 'Nothing found in this category.');
    if (filter === 'epubcheck' && epubcheckRun && epubcheckRun.book === currentScriptId) {
        problemsSummary.textContent = problemsSummary.textContent.replace(/\.?$/, '. ') + 'From EPUBCheck ' + epubcheckRun.version + (problemsResult.epubcheckStale ? ', on an earlier version of the book: run it again.' : '.');
    }
    problemsList.textContent = '';
    problems.forEach((p) => {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'list-row problem-row problem-' + p.severity + ' problem-cat-' + p.category;
        const level = document.createElement('span');
        level.className = 'list-level';
        level.textContent = p.severity === 'error' ? 'error' : p.severity === 'info' ? 'note' : 'warn';
        const msg = document.createElement('span');
        msg.className = 'list-msg';
        msg.textContent = p.message;
        const where = document.createElement('span');
        where.className = 'list-src';
        where.textContent = (p.file || 'book') + (p.line ? ':' + p.line : '');
        row.append(level, msg, where);
        // Images and missing files have no text to open.
        if (typeof projectFiles.entries[p.file] === 'string') {
            row.title = 'Jump to ' + p.file + (p.line ? ' line ' + p.line : '');
            row.addEventListener('click', () => jumpToProblem(p));
        } else {
            row.classList.add('problem-static');
            row.title = p.file || 'The whole book';
        }
        problemsList.appendChild(row);
    });
}

document.getElementById('problemsRecheckBtn').addEventListener('click', runProblemsCheck);

problemsFilterButtons.forEach((btn) => btn.addEventListener('click', () => {
    problemsFilter = btn.dataset.filter;
    setSetting('problemsFilter', problemsFilter);
    renderProblems();
}));

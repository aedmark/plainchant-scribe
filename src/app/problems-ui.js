const inspProblemsPane = document.getElementById('inspProblemsPane');
const problemsList = document.getElementById('problemsList');
const problemsSummary = document.getElementById('problemsSummary');
const problemsCountBadge = document.getElementById('problemsCountBadge');
const linkChecker = Links.createChecker();
const hintChecker = Hints.createChecker();
const problemsFilterButtons = Array.from(document.querySelectorAll('.problems-filter-btn'));
let problemsTimer = null;
const cssLintChecker = CssLint.createChecker();
let problemsResult = { problems: [], errors: 0, warnings: 0 };
let problemsFilter = settings.problemsFilter;

function knownProjectPaths() {
    const tree = Array.isArray(projectFiles.tree) ? projectFiles.tree.filter((i) => i.kind === 'file').map((i) => i.path) : [];
    return tree.concat(Object.keys(typeof projectAssets === 'object' ? projectAssets : {}));
}

function runProblemsCheck() {
    clearTimeout(problemsTimer);
    problemsTimer = null;
    ensureEntries();
    const entries = Object.assign({}, projectFiles.entries);
    if (activeFile in entries) entries[activeFile] = editor.value;
    const links = linkChecker.check(entries, knownProjectPaths());
    const hints = hintChecker.check(entries);
    // Book stylesheets and style attributes get the ebook CSS lint (P4-06, D-036).
    const lint = isBookProject() ? cssLintChecker.check(entries).problems : [];
    const order = Object.keys(entries);
    const problems = links.problems.map((p) => Object.assign({ category: 'links' }, p)).concat(hints.problems, lint)
        .sort((a, b) => (order.indexOf(a.file) - order.indexOf(b.file)) || (a.start - b.start));
    problemsResult = { problems: problems };
    renderProblems();
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
    const problems = problemsResult.problems.filter((p) => problemsFilter === 'all' || p.category === problemsFilter);
    const errors = problems.filter((p) => p.severity === 'error').length;
    const warnings = problems.length - errors;
    problemsFilterButtons.forEach((btn) => {
        const count = problemsResult.problems.filter((p) => btn.dataset.filter === 'all' || p.category === btn.dataset.filter).length;
        btn.setAttribute('aria-pressed', String(btn.dataset.filter === problemsFilter));
        btn.textContent = btn.dataset.filter.charAt(0).toUpperCase() + btn.dataset.filter.slice(1) + (count ? ' ' + count : '');
    });
    problemsCountBadge.hidden = problems.length === 0;
    problemsCountBadge.textContent = String(problems.length);
    problemsCountBadge.classList.toggle('has-error', errors > 0);
    if (inspProblemsPane.hidden) return;
    problemsSummary.textContent = problems.length
        ? errors + (errors === 1 ? ' error' : ' errors') + ', ' + warnings + (warnings === 1 ? ' warning' : ' warnings')
        : (problemsFilter === 'all' ? 'No problems found.' : 'Nothing found in this category.');
    problemsList.textContent = '';
    problems.forEach((p) => {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'console-row problem-row problem-' + p.severity + ' problem-cat-' + p.category;
        const level = document.createElement('span');
        level.className = 'console-level';
        level.textContent = p.severity === 'error' ? 'error' : 'warn';
        const msg = document.createElement('span');
        msg.className = 'console-msg';
        msg.textContent = p.message;
        const where = document.createElement('span');
        where.className = 'console-src';
        where.textContent = p.file + ':' + p.line;
        row.title = 'Jump to ' + p.file + ' line ' + p.line;
        row.append(level, msg, where);
        row.addEventListener('click', () => jumpToProblem(p));
        problemsList.appendChild(row);
    });
}

document.getElementById('problemsRecheckBtn').addEventListener('click', runProblemsCheck);

problemsFilterButtons.forEach((btn) => btn.addEventListener('click', () => {
    problemsFilter = btn.dataset.filter;
    setSetting('problemsFilter', problemsFilter);
    renderProblems();
}));

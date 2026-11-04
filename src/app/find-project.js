const findScopeBtn = document.getElementById('findScopeBtn');
const findResults = document.getElementById('findResults');
const findResultsSummary = document.getElementById('findResultsSummary');
const findResultsList = document.getElementById('findResultsList');
const replaceAllBtn = document.getElementById('replaceAllBtn');
const FIND_RESULT_ROW_LIMIT = 300;

let projectFindTimer = null;
let projectFindResult = { files: [], total: 0 };
let projectFindQuery = '';
const projectFindSkipped = new Set();

function findOptions() {
    return { caseSensitive: findCaseBtn.getAttribute('aria-pressed') === 'true' };
}

function projectSearchEntries() {
    ensureEntries();
    const entries = Object.assign({}, projectFiles.entries);
    if (activeFile in entries) entries[activeFile] = editor.value;
    return entries;
}

function includedProjectFiles() {
    return projectFindResult.files.filter((f) => !projectFindSkipped.has(f.path));
}

function paintProjectResults() {
    findResultsList.textContent = '';
    const { files, total } = projectFindResult;
    const chosen = includedProjectFiles();
    const chosenCount = chosen.reduce((n, f) => n + f.matches.length, 0);
    replaceAllBtn.textContent = findProject ? 'Replace All in Project' : 'Replace All';
    replaceAllBtn.title = findProject ? 'Replace every match in the checked files' : 'Replace every match in this file';
    replaceAllBtn.disabled = findProject && chosenCount === 0;
    if (!findInput.value) findResultsSummary.textContent = 'Type to search every file in the project.';
    else if (!total) findResultsSummary.textContent = 'No results in any file.';
    else findResultsSummary.textContent = total + (total === 1 ? ' match' : ' matches') + ' in ' + files.length + (files.length === 1 ? ' file' : ' files') +
        (chosen.length !== files.length ? ' (' + chosenCount + ' selected to replace)' : '');
    let rows = 0;
    files.forEach((file) => {
        const head = document.createElement('label');
        head.className = 'fr-file';
        const box = document.createElement('input');
        box.type = 'checkbox';
        box.checked = !projectFindSkipped.has(file.path);
        box.title = 'Include ' + file.path + ' in Replace All';
        box.addEventListener('change', () => {
            if (box.checked) projectFindSkipped.delete(file.path); else projectFindSkipped.add(file.path);
            paintProjectResults();
        });
        const name = document.createElement('span');
        name.textContent = file.path + ' (' + file.matches.length + ')';
        head.append(box, name);
        findResultsList.appendChild(head);
        file.matches.forEach((m) => {
            if (rows++ >= FIND_RESULT_ROW_LIMIT) return;
            const row = document.createElement('button');
            row.type = 'button';
            row.className = 'fr-row';
            row.title = 'Jump to ' + file.path + ' line ' + m.line;
            const line = document.createElement('span');
            line.className = 'fr-line';
            line.textContent = String(m.line);
            const text = document.createElement('span');
            text.className = 'fr-text';
            const mark = document.createElement('mark');
            mark.textContent = m.hit;
            text.append(document.createTextNode(m.before), mark, document.createTextNode(m.after));
            row.append(line, text);
            row.addEventListener('click', () => jumpToProjectMatch(file.path, m));
            findResultsList.appendChild(row);
        });
    });
    if (rows > FIND_RESULT_ROW_LIMIT) {
        const more = document.createElement('div');
        more.className = 'fr-more';
        more.textContent = (rows - FIND_RESULT_ROW_LIMIT) + ' more matches are not listed but are still replaced.';
        findResultsList.appendChild(more);
    }
}

function runProjectSearch() {
    clearTimeout(projectFindTimer);
    projectFindTimer = null;
    if (!findProject) return;
    projectFindResult = Finding.findInFiles(projectSearchEntries(), findInput.value, findOptions());
    paintProjectResults();
}

function onFindChanged(queryChanged) {
    if (!findProject || findBar.hidden) return;
    if (queryChanged && findInput.value !== projectFindQuery) {
        projectFindQuery = findInput.value;
        projectFindSkipped.clear();
    }
    clearTimeout(projectFindTimer);
    projectFindTimer = setTimeout(runProjectSearch, queryChanged ? 120 : 400);
}

function setFindProject(on) {
    findProject = Boolean(on);
    findScopeBtn.setAttribute('aria-pressed', String(findProject));
    findResults.hidden = !findProject || findBar.hidden;
    projectFindQuery = findInput.value;
    projectFindSkipped.clear();
    if (findProject) runProjectSearch();
    else paintProjectResults();
}

function hideFindResults() {
    findResults.hidden = true;
}

function jumpToProjectMatch(path, match) {
    if (panesShown() === 'preview') setPanes('both');
    openFileInEditor(path);
    const at = Math.min(match.start, editor.value.length);
    editor.setSelectionRange(at, Math.min(match.end, editor.value.length));
    editor.scrollTop = Math.max(0, textTopIn(editor.value, at) - editor.clientHeight / 3);
    shadeLayer.scrollTop = editor.scrollTop;
    recomputeFind(at);
}

function replaceAcrossProject() {
    const chosen = includedProjectFiles().map((f) => f.path);
    if (!chosen.length) return;
    const res = Finding.replaceInFiles(projectSearchEntries(), findInput.value, replaceInput.value, Object.assign(findOptions(), { paths: chosen }));
    if (!res.count) return;
    commitPartEntries(res.entries);
    runProjectSearch();
    showNotice('Replaced ' + res.count + (res.count === 1 ? ' match' : ' matches') + ' in ' + res.files.length + (res.files.length === 1 ? ' file' : ' files') + '. Press Ctrl/Cmd+Z to undo.');
}

findScopeBtn.addEventListener('click', () => {
    setFindProject(!findProject);
    findResults.hidden = !findProject;
    findInput.focus();
});

const fileMenu = document.getElementById('fileMenu');
const fileMenuLabel = document.getElementById('fileMenuLabel');

let savedFileEntries = {};
let fileMenuPath = null;

function markFilesSaved(entries) {
    ensureEntries();
    savedFileEntries = Object.assign({}, entries || projectFiles.entries);
    if (!entries && activeFile in projectFiles.entries) savedFileEntries[activeFile] = editor.value;
    refreshDirtyMarks();
}

function dirtyFileSet() {
    ensureEntries();
    const now = Object.assign({}, projectFiles.entries);
    if (activeFile in now) now[activeFile] = editor.value;
    return new Set(FileSync.dirtyPaths(now, savedFileEntries));
}

function refreshDirtyMarks() {
    if (!fileTabsBox || !explorerTree) return;
    const dirty = dirtyFileSet();
    fileTabsBox.querySelectorAll('.file-tab').forEach((tab) => {
        const isDirty = dirty.has(tab.dataset.file);
        tab.classList.toggle('dirty', isDirty);
        tab.title = tab.dataset.file + (isDirty ? ' (unsaved changes)' : '');
    });
    explorerTree.querySelectorAll('.explorer-row').forEach((row) => {
        const isDirty = dirty.has(row.dataset.path);
        row.classList.toggle('dirty', isDirty);
        row.querySelector('.explorer-item').title = row.dataset.path + (isDirty ? ' (unsaved changes)' : '');
    });
}

function knownTreePaths() {
    return Array.isArray(projectFiles.tree) ? projectFiles.tree.filter((i) => i.kind === 'file').map((i) => i.path) : [];
}

function commitFileChange(next, change) {
    // P7-04, D-049: Scribe's own toc.ncx follows the contents in the same undo step.
    if (isBookProject()) next = BookNcx.refresh(next, Object.keys(projectAssets || {}));
    currentSnapshot = captureSnapshot();
    pushUndoState();
    projectFiles.entries = next;
    if (typeof change.apply === 'function') change.apply();
    if (change.tree !== undefined) projectFiles.tree = change.tree;
    openTabs = change.openTabs;
    if (change.activeHtmlFile !== activeHtmlFile) selectedPcId = null;
    activeFile = change.activeFile;
    activeHtmlFile = change.activeHtmlFile;
    activeTab = langForFile(activeFile);
    syncMirrors();
    editor.value = next[activeFile] != null ? next[activeFile] : '';
    renderFileTabs();
    renderExplorer();
    render(false);
    scheduleAutoSave();
    if (typeof syncLatestHistoryState === 'function') syncLatestHistoryState();
}

async function renameProjectFile(path) {
    const answer = await askText({
        title: 'Rename file',
        hint: 'New path for ' + path + '. Include folders to move it. Links to the file are updated.',
        value: path, confirm: 'Rename', validate: (text) => (text ? '' : 'Enter a name.')
    });
    if (answer == null || Project.normalizeFilePath(answer) === path) return;
    moveProjectFileTo(path, answer);
}

function moveProjectFileTo(path, answer) {
    ensureEntries();
    syncBufferFromEditor();
    const res = Project.renameFile(projectFiles.entries, path, answer, { known: knownTreePaths() });
    if (res.error) { showNotice(res.error, true); return false; }
    const swap = (p) => (p === path ? res.path : p);
    expandExplorerTo(res.path);
    commitFileChange(res.entries, {
        tree: Project.treeAfter(projectFiles.tree, { type: 'rename', from: path, to: res.path }),
        openTabs: openTabs.map(swap), activeFile: swap(activeFile), activeHtmlFile: swap(activeHtmlFile)
    });
    showNotice('Renamed to ' + res.path + (res.refsUpdated ? ' and updated links in ' + res.refsUpdated + (res.refsUpdated === 1 ? ' file.' : ' files.') : '.'));
    return true;
}

function duplicateProjectFile(path) {
    ensureEntries();
    syncBufferFromEditor();
    const res = Project.duplicateFile(projectFiles.entries, path);
    if (res.error) { showNotice(res.error, true); return; }
    commitFileChange(res.entries, {
        tree: Project.treeAfter(projectFiles.tree, { type: 'duplicate', from: path, to: res.path }),
        openTabs: openTabs.concat(res.path), activeFile: res.path,
        activeHtmlFile: isPagePath(res.path) ? res.path : activeHtmlFile
    });
    showNotice('Created ' + res.path);
}

function deleteProjectFile(path) {
    ensureEntries();
    syncBufferFromEditor();
    const res = Project.deleteFile(projectFiles.entries, path);
    if (res.error) { showNotice(res.error, true); return; }
    const remaining = Object.keys(res.entries);
    const tabs = openTabs.filter((p) => p !== path);
    const active = activeFile === path ? (tabs[Math.max(0, openTabs.indexOf(path) - 1)] || remaining[0]) : activeFile;
    if (!tabs.includes(active)) tabs.push(active);
    const html = activeHtmlFile === path
        ? (isPagePath(active) ? active : remaining.find((p) => isPagePath(p)))
        : activeHtmlFile;
    commitFileChange(res.entries, { tree: Project.treeAfter(projectFiles.tree, { type: 'delete', path: path }), openTabs: tabs, activeFile: active, activeHtmlFile: html });
    showNotice('Deleted ' + path + '. Press Ctrl/Cmd+Z to undo.');
}

function closeFileMenu() {
    fileMenu.hidden = true;
    fileMenuPath = null;
}

function openFileMenu(path, x, y) {
    fileMenuPath = path;
    fileMenuLabel.textContent = path;
    fileMenu.hidden = false;
    fileMenu.style.left = Math.max(8, Math.min(x, window.innerWidth - fileMenu.offsetWidth - 8)) + 'px';
    fileMenu.style.top = Math.max(8, Math.min(y, window.innerHeight - fileMenu.offsetHeight - 8)) + 'px';
    const first = fileMenu.querySelector('[data-file-cmd]');
    if (first) first.focus();
}

function runFileCommand(cmd, path) {
    if (cmd === 'rename') renameProjectFile(path);
    else if (cmd === 'duplicate') duplicateProjectFile(path);
    else if (cmd === 'delete') deleteProjectFile(path);
}

function decorateExplorerRow(row, editable) {
    if (!editable) return;
    const path = row.dataset.path;
    const actions = document.createElement('span');
    actions.className = 'explorer-actions';
    [['rename', '✎', 'Rename ' + path], ['duplicate', '⧉', 'Duplicate ' + path], ['delete', '✕', 'Delete ' + path]].forEach(([cmd, glyph, title]) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'explorer-act' + (cmd === 'delete' ? ' danger' : '');
        btn.textContent = glyph;
        btn.title = title;
        btn.setAttribute('aria-label', title);
        btn.addEventListener('click', (e) => { e.stopPropagation(); runFileCommand(cmd, path); });
        actions.appendChild(btn);
    });
    row.appendChild(actions);
    row.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        openFileMenu(path, e.clientX, e.clientY);
    });
}

fileMenu.addEventListener('click', (e) => {
    const item = e.target.closest('[data-file-cmd]');
    if (!item || !fileMenuPath) return;
    const path = fileMenuPath;
    closeFileMenu();
    runFileCommand(item.dataset.fileCmd, path);
});
fileMenu.addEventListener('keydown', (e) => {
    const items = Array.from(fileMenu.querySelectorAll('[data-file-cmd]'));
    const at = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        items[(at + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus();
    } else if (e.key === 'Escape') {
        e.preventDefault();
        closeFileMenu();
    }
});
document.addEventListener('click', (e) => { if (!fileMenu.hidden && !fileMenu.contains(e.target)) closeFileMenu(); });
document.addEventListener('contextmenu', (e) => { if (!fileMenu.hidden && !e.target.closest('.explorer-row')) closeFileMenu(); });
window.addEventListener('resize', closeFileMenu);
explorerTree.addEventListener('scroll', closeFileMenu);

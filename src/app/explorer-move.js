const newFolderBtn = document.getElementById('newFolderBtn');
const MOVE_DRAG_PX = 6;

let moveDrag = null;
let tabDrag = null;
let suppressExplorerClick = false;

const baseName = (path) => path.split('/').pop();
const parentOf = (path) => path.split('/').slice(0, -1).join('/');
const joinPath = (dir, name) => (dir ? dir + '/' + name : name);

function projectFilePaths() {
    ensureEntries();
    const paths = new Set(Object.keys(projectFiles.entries).concat(Object.keys(projectAssets)));
    (projectFiles.tree || []).forEach((item) => { if (item.kind === 'file') paths.add(item.path); });
    return Array.from(paths);
}

function projectDirPaths() {
    const dirs = new Set((projectFiles.tree || []).filter((item) => item.kind === 'dir').map((item) => item.path));
    projectFilePaths().forEach((p) => { for (let at = parentOf(p); at; at = parentOf(at)) dirs.add(at); });
    return Array.from(dirs);
}

function ensureProjectTree() {
    return Project.deriveTree(projectFiles.entries, projectFiles.tree, Object.keys(projectAssets));
}

function newProjectFolder() {
    ensureEntries();
    syncBufferFromEditor();
    const answer = window.prompt('New folder (e.g. images or assets/fonts):', 'new-folder');
    if (answer == null) return;
    const check = Project.validateFolderPath(projectFilePaths(), projectDirPaths(), answer, '');
    if (!check.ok) { showNotice(check.error, true); return; }
    expandExplorerTo(check.path);
    beginAssetChange();
    projectFiles.tree = Project.treeAfter(ensureProjectTree(), { type: 'mkdir', path: check.path });
    finishAssetChange();
    showNotice('Created folder ' + check.path + '. Empty folders are created on disk when you export.');
}

function deleteProjectFolder(dir) {
    if (Project.pathsUnder(projectFilePaths(), dir).length) {
        showNotice(dir + ' is not empty. Move or delete its files first.', true);
        return;
    }
    explorerCollapsed.delete(dir);
    beginAssetChange();
    projectFiles.tree = ensureProjectTree().filter((item) => item.path !== dir && item.path.indexOf(dir + '/') !== 0);
    finishAssetChange();
    showNotice('Deleted empty folder ' + dir + '. Press Ctrl/Cmd+Z to undo.');
}

async function moveProjectFolderTo(src, to) {
    ensureEntries();
    syncBufferFromEditor();
    const files = projectFilePaths();
    const diskOnly = Project.pathsUnder(files, src).filter((p) => !(p in projectFiles.entries) && !(p in projectAssets));
    for (const p of diskOnly) {
        if (!ImageLib.isImage(p) || !(await adoptDiskImage({ path: p, source: 'file' }))) {
            showNotice('Cannot move ' + src + ': ' + p + ' exists only on disk and cannot be loaded into the studio.', true);
            return false;
        }
    }
    const res = Project.moveFolder(projectFiles.entries, src, to, { known: projectFilePaths() });
    if (res.error) { showNotice(res.error, true); return false; }
    if (res.path === src) return false;
    expandExplorerTo(res.path);
    const renamed = new Map(res.moves.map((m) => [m.from, m.to]));
    const swap = (p) => renamed.get(p) || p;
    commitFileChange(res.entries, {
        tree: Array.isArray(projectFiles.tree) ? Project.treeAfter(projectFiles.tree, { type: 'moveDir', from: src, to: res.path }) : projectFiles.tree,
        openTabs: openTabs.map(swap), activeFile: swap(activeFile), activeHtmlFile: swap(activeHtmlFile),
        apply: () => res.moves.forEach((m) => { if (m.from in projectAssets) moveProjectAsset(m.from, m.to); })
    });
    showNotice('Moved ' + src + ' to ' + res.path + ' (' + res.moves.length + (res.moves.length === 1 ? ' file' : ' files') + (res.refsUpdated ? ', links updated in ' + res.refsUpdated + ' of them' : '') + ').' + diskNote());
    return true;
}

async function moveProjectPath(src, destDir) {
    const to = joinPath(destDir, baseName(src));
    if (to === src) return;
    expandExplorerTo(to);
    if (projectDirPaths().indexOf(src) !== -1) {
        await moveProjectFolderTo(src, to);
    } else if (src in projectFiles.entries) {
        if (moveProjectFileTo(src, to)) showNotice('Moved ' + src + ' to ' + to + '.' + diskNote());
    } else if (await moveAssetTo({ path: src, source: src in projectAssets ? 'asset' : 'file', name: baseName(src) }, to)) {
        showNotice('Moved ' + src + ' to ' + to + '.' + diskNote());
    }
}

function renameProjectFolder(dir) {
    const answer = window.prompt('Rename folder ' + dir + '\n(Include parent folders to move it. Links to its files are updated.)', dir);
    if (answer == null || Project.normalizeFilePath(answer).replace(/\/+$/, '') === dir) return;
    moveProjectFolderTo(dir, answer);
}

function decorateExplorerDir(row) {
    const path = row.dataset.path;
    const actions = document.createElement('span');
    actions.className = 'explorer-actions';
    [['✎', 'Rename or move folder ' + path, () => renameProjectFolder(path), ''], ['✕', 'Delete empty folder ' + path, () => deleteProjectFolder(path), ' danger']].forEach(([glyph, title, run, extra]) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'explorer-act' + extra;
        btn.textContent = glyph;
        btn.title = title;
        btn.setAttribute('aria-label', title);
        btn.addEventListener('click', (e) => { e.stopPropagation(); run(); });
        actions.appendChild(btn);
    });
    row.appendChild(actions);
}

function dropDirFor(target) {
    const row = target && target.closest ? target.closest('.explorer-dir, .explorer-row') : null;
    if (row) return row.classList.contains('explorer-dir') ? row.dataset.path : parentOf(row.dataset.path);
    return target === explorerTree || (target && target.closest && target.closest('.explorer-empty')) ? '' : null;
}

function validDrop(src, dir) {
    if (dir === null || dir === parentOf(src)) return false;
    return !(dir === src || dir.indexOf(src + '/') === 0);
}

function clearDropMarks() {
    explorerTree.classList.remove('drop-root');
    explorerTree.querySelectorAll('.drop-into').forEach((n) => n.classList.remove('drop-into'));
}

function markDrop(dir) {
    clearDropMarks();
    if (dir === '') { explorerTree.classList.add('drop-root'); return; }
    const row = explorerTree.querySelector('.explorer-dir[data-path="' + dir.replace(/"/g, '\\"') + '"]');
    if (row) row.classList.add('drop-into');
}

function endMoveDrag() {
    if (!moveDrag) return;
    if (moveDrag.ghost) moveDrag.ghost.remove();
    document.body.classList.remove('explorer-dragging');
    clearDropMarks();
    moveDrag = null;
}

explorerTree.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('.explorer-act')) return;
    const row = e.target.closest('.explorer-dir, .explorer-row');
    if (!row || !row.dataset.path) return;
    moveDrag = { path: row.dataset.path, x: e.clientX, y: e.clientY, active: false, ghost: null, dir: null };
});

document.addEventListener('pointermove', (e) => {
    if (!moveDrag) return;
    if (!moveDrag.active) {
        if (Math.hypot(e.clientX - moveDrag.x, e.clientY - moveDrag.y) < MOVE_DRAG_PX) return;
        moveDrag.active = true;
        moveDrag.ghost = document.createElement('div');
        moveDrag.ghost.className = 'explorer-ghost';
        moveDrag.ghost.textContent = baseName(moveDrag.path);
        document.body.appendChild(moveDrag.ghost);
        document.body.classList.add('explorer-dragging');
    }
    moveDrag.ghost.style.left = (e.clientX + 12) + 'px';
    moveDrag.ghost.style.top = (e.clientY + 8) + 'px';
    const dir = dropDirFor(document.elementFromPoint(e.clientX, e.clientY));
    moveDrag.dir = validDrop(moveDrag.path, dir) ? dir : null;
    if (moveDrag.dir === null) clearDropMarks(); else markDrop(moveDrag.dir);
});

document.addEventListener('pointerup', () => {
    if (!moveDrag) return;
    const done = moveDrag;
    endMoveDrag();
    if (!done.active) return;
    suppressExplorerClick = true;
    setTimeout(() => { suppressExplorerClick = false; }, 0);
    if (done.dir !== null) moveProjectPath(done.path, done.dir);
});

document.addEventListener('pointercancel', endMoveDrag);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { endMoveDrag(); endTabDrag(); } });
explorerTree.addEventListener('click', (e) => {
    if (!suppressExplorerClick) return;
    e.stopPropagation();
    e.preventDefault();
}, true);

function tabInsertIndex(x) {
    const tabs = Array.from(fileTabsBox.querySelectorAll('.file-tab'));
    for (let i = 0; i < tabs.length; i++) {
        const r = tabs[i].getBoundingClientRect();
        if (x < r.left + r.width / 2) return i;
    }
    return tabs.length;
}

function endTabDrag() {
    if (!tabDrag) return;
    fileTabsBox.querySelectorAll('.tab-drop-before, .tab-drop-after, .tab-dragging').forEach((n) => n.classList.remove('tab-drop-before', 'tab-drop-after', 'tab-dragging'));
    tabDrag = null;
}

fileTabsBox.addEventListener('pointerdown', (e) => {
    const tab = e.target.closest('.file-tab');
    if (e.button !== 0 || !tab || e.target.closest('.tab-close')) return;
    tabDrag = { file: tab.dataset.file, x: e.clientX, active: false, index: null };
});

document.addEventListener('pointermove', (e) => {
    if (!tabDrag) return;
    if (!tabDrag.active) {
        if (Math.abs(e.clientX - tabDrag.x) < MOVE_DRAG_PX) return;
        tabDrag.active = true;
        const dragged = fileTabsBox.querySelector('.file-tab[data-file="' + tabDrag.file.replace(/"/g, '\\"') + '"]');
        if (dragged) dragged.classList.add('tab-dragging');
    }
    tabDrag.index = tabInsertIndex(e.clientX);
    const tabs = Array.from(fileTabsBox.querySelectorAll('.file-tab'));
    tabs.forEach((t) => t.classList.remove('tab-drop-before', 'tab-drop-after'));
    if (tabDrag.index < tabs.length) tabs[tabDrag.index].classList.add('tab-drop-before');
    else if (tabs.length) tabs[tabs.length - 1].classList.add('tab-drop-after');
});

document.addEventListener('pointerup', () => {
    if (!tabDrag) return;
    const done = tabDrag;
    endTabDrag();
    if (!done.active || done.index === null) return;
    suppressExplorerClick = true;
    setTimeout(() => { suppressExplorerClick = false; }, 0);
    const from = openTabs.indexOf(done.file);
    if (from === -1) return;
    const next = openTabs.slice();
    next.splice(from, 1);
    next.splice(done.index > from ? done.index - 1 : done.index, 0, done.file);
    if (next.join('\n') === openTabs.join('\n')) return;
    openTabs = next;
    renderFileTabs();
    scheduleAutoSave();
});

fileTabsBox.addEventListener('click', (e) => {
    if (!suppressExplorerClick) return;
    e.stopPropagation();
    e.preventDefault();
}, true);

newFolderBtn.addEventListener('click', newProjectFolder);

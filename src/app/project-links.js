const fileReloadBtn = document.getElementById('fileReloadBtn');

let projectLinks = {};
let pendingDisk = null;

function persistLink(link) {
    projectLinks[link.scriptId] = link;
    if (storageMode === 'idb') Store.putLink(scriptDb, link).catch(() => {});
}

function saveProjectLink(meta, entries) {
    persistLink({
        scriptId: currentScriptId, kind: meta.kind, name: meta.name, path: meta.path || '',
        handle: meta.handle || null, synced: ProjectLink.hashEntries(entries || projectFiles.entries)
    });
}

function markLinkSynced() {
    const link = projectLinks[currentScriptId];
    if (link) persistLink(Object.assign({}, link, { synced: ProjectLink.hashEntries(projectFiles.entries) }));
    pendingDisk = null;
    renderDiskPending();
}

async function folderOwner(meta, exceptId) {
    if (meta.path) return ProjectLink.findByPath(projectLinks, getScripts(), meta.path, exceptId);
    if (!meta.handle) return null;
    for (const id of Object.keys(projectLinks)) {
        const link = projectLinks[id];
        const script = getScripts()[id];
        if (id === exceptId || !link.handle || !script || script.deletedAt) continue;
        try { if (await link.handle.isSameEntry(meta.handle)) return id; } catch (e) {}
    }
    return null;
}

async function adoptExportFolder(meta) {
    if (linkedFolder) return;
    const owner = await folderOwner(meta, currentScriptId);
    if (owner) {
        showNotice('That folder already belongs to the project "' + getScripts()[owner].title + '", so this project was not linked to it. One folder is one project.', true);
        return;
    }
    linkedFolder = meta;
    saveProjectLink(meta);
    updateFolderBar();
}

function detachProjectFolder() {
    delete projectLinks[currentScriptId];
    if (storageMode === 'idb') Store.removeLink(scriptDb, currentScriptId).catch(() => {});
    clearLinkedFolder();
}

async function restoreProjectLink(id) {
    await null;
    const link = projectLinks[id];
    if (!link || id !== currentScriptId) return;
    if (link.kind === 'Tauri disk' && hasTauri()) {
        try {
            const baseUrl = await tauriInvoke('use_project_folder', { path: link.path });
            if (id !== currentScriptId) return;
            linkedFolder = { kind: link.kind, name: link.name, path: link.path, baseUrl: baseUrl };
            projectBaseUrl = baseUrl;
            drawStageNow();
        } catch (err) {
            if (id === currentScriptId) showNotice('The folder for this project is no longer at ' + link.path + '. Export to a folder to link it again.', true);
            return;
        }
    } else if (link.handle) {
        linkedFolder = { kind: 'Browser Directory', name: link.name, handle: link.handle };
    } else return;
    updateFolderBar();
}

function renderDiskPending() {
    const show = Boolean(pendingDisk && pendingDisk.id === currentScriptId);
    fileReloadBtn.hidden = !show;
    if (show) fileReloadBtn.textContent = 'Reload ' + pendingDisk.diff.count + (pendingDisk.diff.count === 1 ? ' changed file' : ' changed files') + ' from disk';
}

async function openExistingFolderProject(id, meta, disk) {
    flushSave();
    const script = getScripts()[id];
    currentScriptId = id;
    selectedPcId = null;
    linkedFolder = meta;
    loadProjectIntoEditor(script.content, { baseUrl: meta.baseUrl || '' });
    if (fileExplorer) {
        fileExplorer.hidden = false;
        if (toggleExplorerBtn) toggleExplorerBtn.setAttribute('aria-pressed', 'true');
    }
    const link = Object.assign({}, projectLinks[id], { name: meta.name, path: meta.path || projectLinks[id].path, handle: meta.handle || projectLinks[id].handle });
    persistLink(link);
    updateFolderBar();
    rememberCurrent();
    render(false);
    const diff = ProjectLink.changedOnDisk(link.synced, disk.files);
    pendingDisk = diff.count ? { id: id, files: disk.files, tree: disk.tree, diff: diff } : null;
    renderDiskPending();
    showNotice('"' + (script.title || meta.name) + '" is already a project, so it was opened instead of creating a copy.' +
        (diff.count ? ' ' + diff.count + (diff.count === 1 ? ' file' : ' files') + ' changed on disk since the last export; your Studio copy was kept. Use Reload from disk to take the disk version.' : ''));
}

function reloadFolderFromDisk() {
    if (!pendingDisk || pendingDisk.id !== currentScriptId) return;
    ensureEntries();
    syncBufferFromEditor();
    const next = Object.assign({}, pendingDisk.files);
    const tabs = openTabs.filter((p) => p in next);
    const names = Object.keys(next);
    const active = activeFile in next ? activeFile : (tabs[0] || names[0] || 'index.html');
    const page = activeHtmlFile in next ? activeHtmlFile : (names.find((p) => /\.html?$/i.test(p)) || 'index.html');
    if (!tabs.includes(active)) tabs.push(active);
    const count = pendingDisk.diff.count;
    commitFileChange(next, { tree: pendingDisk.tree, openTabs: tabs, activeFile: active, activeHtmlFile: page });
    markLinkSynced();
    showNotice('Reloaded ' + count + (count === 1 ? ' file' : ' files') + ' from disk. Press Ctrl/Cmd+Z to undo.');
}

fileReloadBtn.addEventListener('click', reloadFolderFromDisk);

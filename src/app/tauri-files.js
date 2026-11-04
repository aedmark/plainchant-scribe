const folderBtn = document.getElementById('folderBtn');
const exportFolderBtn = document.getElementById('exportFolderBtn');
const exportNewFolderBtn = document.getElementById('exportNewFolderBtn');
const fileBar = document.getElementById('file-bar');
const fileBarText = document.getElementById('fileBarText');
const fileSyncNowBtn = document.getElementById('fileSyncNowBtn');
const fileUnlinkBtn = document.getElementById('fileUnlinkBtn');

let linkedFolder = null;

function hasTauri() {
    return Boolean(window.__TAURI_INTERNALS__ || window.__TAURI__);
}

function tauriInvoke(cmd, args) {
    if (window.__TAURI__ && window.__TAURI__.core && typeof window.__TAURI__.core.invoke === 'function') {
        return window.__TAURI__.core.invoke(cmd, args);
    }
    if (window.__TAURI_INTERNALS__ && typeof window.__TAURI_INTERNALS__.invoke === 'function') {
        return window.__TAURI_INTERNALS__.invoke(cmd, args);
    }
    return Promise.reject(new Error('Tauri runtime not available'));
}

function clearLinkedFolder() {
    linkedFolder = null;
    projectBaseUrl = '';
    pendingDisk = null;
    renderDiskPending();
    updateFolderBar();
    restoreProjectLink(currentScriptId);
}

function updateFolderBar() {
    if (!linkedFolder) {
        fileBar.hidden = true;
        if (explorerTitle) explorerTitle.textContent = 'Project Files';
        return;
    }
    fileBar.hidden = false;
    const shortName = String(linkedFolder.name || '').split(/[\\/]/).filter(Boolean).pop() || linkedFolder.name;
    const count = Object.keys(projectFiles.entries || {}).length;
    if (explorerTitle) explorerTitle.textContent = shortName;
    fileBarText.textContent =
        'Project Environment: ' + shortName + ' (' + count + ' files) — Working copy in studio; local disk is not modified until you Export.';
}

async function scanBrowserDir(dirHandle, prefix, files, tree, depth, assets) {
    if (depth > 5) return;
    const IGNORED = new Set(['.git', 'node_modules', 'target', '.venv', 'venv', '.idea', '.vscode', 'dist']);
    const entries = [];
    for await (const [name, handle] of dirHandle.entries()) {
        if (name.startsWith('.') || IGNORED.has(name)) continue;
        entries.push([name, handle]);
    }
    entries.sort((a, b) => a[0].localeCompare(b[0]));
    for (const [name, handle] of entries) {
        const relPath = prefix ? prefix + '/' + name : name;
        if (handle.kind === 'directory') {
            tree.push({ path: relPath, kind: 'dir', is_text: false });
            await scanBrowserDir(handle, relPath, files, tree, depth + 1, assets);
        } else if (handle.kind === 'file') {
            const isText = Importing.accept(name) || /\.(svg|md|xml|webmanifest)$/i.test(name);
            if (isText) {
                try {
                    const file = await handle.getFile();
                    if (file.size <= 2 * 1024 * 1024) {
                        files[relPath] = await file.text();
                    }
                } catch (e) {
                }
            }
            if (!isText && assets) await collectBrowserAsset(handle, relPath, assets);
            tree.push({ path: relPath, kind: 'file', is_text: isText });
        }
    }
}

async function collectBrowserAsset(handle, relPath, assets) {
    try {
        const file = await handle.getFile();
        if (file.size > ASSET_MAX_FILE_BYTES || assets.bytes + file.size > ASSET_MAX_TOTAL_BYTES) {
            assets.skipped.push(relPath);
            return;
        }
        assets.files[relPath] = file;
        assets.bytes += file.size;
    } catch (e) {
        assets.skipped.push(relPath);
    }
}

async function writeBrowserDirEntries(rootHandle, entriesMap, assetMap, dirList) {
    for (const dirPath of dirList || []) {
        let dir = rootHandle;
        for (const part of String(dirPath).split('/').filter(Boolean)) dir = await dir.getDirectoryHandle(part, { create: true });
    }
    for (const [relPath, content] of Object.entries(entriesMap || {})) {
        const parts = String(relPath || '').split('/').filter(Boolean);
        if (!parts.length) continue;
        let dir = rootHandle;
        for (let i = 0; i < parts.length - 1; i++) {
            dir = await dir.getDirectoryHandle(parts[i], { create: true });
        }
        const fileName = parts[parts.length - 1];
        const fh = await dir.getFileHandle(fileName, { create: true });
        const writable = await fh.createWritable();
        await writable.write(content || '');
        await writable.close();
    }
    for (const [relPath, blob] of Object.entries(assetMap || {})) {
        const parts = String(relPath || '').split('/').filter(Boolean);
        let dir = rootHandle;
        for (let i = 0; i < parts.length - 1; i++) {
            dir = await dir.getDirectoryHandle(parts[i], { create: true });
        }
        const fileName = parts[parts.length - 1];
        let existing = null;
        try { existing = await (await dir.getFileHandle(fileName)).getFile(); } catch (e) { existing = null; }
        if (existing && existing.size === blob.size) continue;
        const writable = await (await dir.getFileHandle(fileName, { create: true })).createWritable();
        await writable.write(blob);
        await writable.close();
    }
}

function activateImportedFolderProject(folderMeta, payload, baseUrl, assets) {
    flushSave();
    currentScriptId = newId();
    selectedPcId = null;
    linkedFolder = folderMeta;
    loadProjectIntoEditor(payload, { baseUrl: baseUrl || '', assets: assets ? assets.files : undefined });
    if (fileExplorer) {
        fileExplorer.hidden = false;
        if (toggleExplorerBtn) toggleExplorerBtn.setAttribute('aria-pressed', 'true');
    }
    updateFolderBar();
    rememberCurrent();
    saveScript(true);
    saveProjectLink(folderMeta, payload.entries);
    saveProjectAssets();
    render(false);
    const shortName = String(folderMeta.name || '').split(/[\\/]/).filter(Boolean).pop() || folderMeta.name;
    const skipped = assets && assets.skipped.length ? ' ' + assets.skipped.length + ' large file(s) were not loaded for preview.' : '';
    showNotice('Created new project environment from "' + shortName + '". Changes stay in Studio until exported to disk.' + skipped);
}

function projectFolderPaths() {
    return (projectFiles.tree || []).filter((item) => item.kind === 'dir').map((item) => item.path);
}

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

async function encodeProjectAssets() {
    const out = {};
    for (const path of Object.keys(projectAssets)) out[path] = await blobToBase64(projectAssets[path]);
    return out;
}

async function openProjectFolder() {
    if (hasTauri()) {
        try {
            const res = await tauriInvoke('open_project_folder', {});
            if (!res || !res.path) return;
            const meta = { kind: 'Tauri disk', name: res.path, path: res.path, baseUrl: res.base_url || '' };
            const owner = await folderOwner(meta, null);
            if (owner) { await openExistingFolderProject(owner, meta, { files: res.files || {}, tree: res.tree || [] }); return; }
            activateImportedFolderProject(meta, { entries: res.files || {}, tree: res.tree || [] }, res.base_url || '');
        } catch (err) {
            showNotice('Folder open failed: ' + (err.message || err), true);
        }
        return;
    }

    if (typeof window.showDirectoryPicker === 'function') {
        try {
            const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
            const files = {};
            const tree = [];
            const assets = { files: {}, bytes: 0, skipped: [] };
            await scanBrowserDir(dirHandle, '', files, tree, 0, assets);
            const meta = { kind: 'Browser Directory', name: dirHandle.name, handle: dirHandle };
            const owner = await folderOwner(meta, null);
            if (owner) { await openExistingFolderProject(owner, meta, { files: files, tree: tree }); return; }
            activateImportedFolderProject(meta, { entries: files, tree: tree }, '', assets);
        } catch (err) {
            if (err && err.name !== 'AbortError') {
                showNotice('Could not open folder: ' + err.message, true);
            }
        }
        return;
    }

    showNotice('Direct folder access requires the Tauri Desktop app or a Chromium browser.', true);
}

async function exportProjectToFolder(forceNewFolder = false) {
    ensureEntries();
    syncBufferFromEditor();
    const fileCount = Object.keys(projectFiles.entries || {}).length;

    if (hasTauri()) {
        try {
            const targetPath = (!forceNewFolder && linkedFolder && linkedFolder.path) ? linkedFolder.path : null;
            const savedPath = await tauriInvoke('save_project_folder', {
                path: targetPath,
                files: projectFiles.entries,
                assets: await encodeProjectAssets(),
                dirs: projectFolderPaths()
            });
            if (!savedPath) return;
            await adoptExportFolder({ kind: 'Tauri disk', name: savedPath, path: savedPath, baseUrl: projectBaseUrl || '' });
            if (typeof refreshExportModal === 'function') refreshExportModal();
            markFilesSaved();
            if (linkedFolder) markLinkSynced();
            showNotice('Exported ' + fileCount + ' project files (retaining folder structure) to ' + savedPath);
        } catch (err) {
            showNotice('Disk export failed: ' + (err.message || err), true);
        }
        return;
    }

    if (typeof window.showDirectoryPicker === 'function') {
        try {
            let dirHandle = (!forceNewFolder && linkedFolder && linkedFolder.handle) ? linkedFolder.handle : null;
            if (!dirHandle) {
                dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
            }
            if (typeof dirHandle.requestPermission === 'function' && (await dirHandle.requestPermission({ mode: 'readwrite' })) !== 'granted') {
                throw new Error('Permission to write to the folder was not granted.');
            }
            await writeBrowserDirEntries(dirHandle, projectFiles.entries, projectAssets, projectFolderPaths());
            await adoptExportFolder({ kind: 'Browser Directory', name: dirHandle.name, handle: dirHandle });
            if (typeof refreshExportModal === 'function') refreshExportModal();
            markFilesSaved();
            if (linkedFolder) markLinkSynced();
            showNotice('Exported ' + fileCount + ' project files (retaining folder structure) to ' + dirHandle.name);
        } catch (err) {
            if (err && err.name !== 'AbortError') {
                showNotice('Could not export to folder: ' + err.message, true);
            }
        }
        return;
    }

    showNotice('Direct folder export requires the Tauri Desktop app or a Chromium browser.', true);
}

folderBtn.addEventListener('click', openProjectFolder);
exportFolderBtn.addEventListener('click', () => exportProjectToFolder(false));
if (exportNewFolderBtn) exportNewFolderBtn.addEventListener('click', () => exportProjectToFolder(true));
fileSyncNowBtn.addEventListener('click', openExportModal);
fileUnlinkBtn.addEventListener('click', () => {
    detachProjectFolder();
    render(false);
    showNotice('Detached source folder reference. Project files remain in your Studio workspace.');
});

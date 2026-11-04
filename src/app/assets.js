const ASSET_MAX_FILE_BYTES = 25 * 1024 * 1024;
const ASSET_MAX_TOTAL_BYTES = 200 * 1024 * 1024;

let projectAssets = {};
let projectAssetUrls = {};
let projectAssetsReady = true;

function releaseProjectAssets() {
    Object.keys(projectAssetUrls).forEach((p) => URL.revokeObjectURL(projectAssetUrls[p]));
    projectAssets = {};
    projectAssetUrls = {};
}

function setProjectAssets(files) {
    releaseProjectAssets();
    Object.keys(files || {}).forEach((path) => {
        const blob = files[path];
        const typed = blob.type ? blob : new Blob([blob], { type: Project.mimeFor(path) });
        projectAssets[path] = typed;
        projectAssetUrls[path] = URL.createObjectURL(typed);
    });
}

function adoptProjectAssets(provided) {
    if (provided) {
        setProjectAssets(provided);
        projectAssetsReady = true;
        return;
    }
    releaseProjectAssets();
    if (storageMode !== 'idb') { projectAssetsReady = true; return; }
    const id = currentScriptId;
    projectAssetsReady = false;
    Store.loadAssets(scriptDb, id).then((files) => {
        if (id !== currentScriptId) return;
        projectAssetsReady = true;
        if (!Object.keys(files).length) return;
        setProjectAssets(files);
        if (currentSnapshot) currentSnapshot.assets = Object.assign({}, projectAssets);
        drawStageNow();
        if (typeof scheduleProblemsCheck === 'function') scheduleProblemsCheck();
        if (typeof schedulePreviewPush === 'function') schedulePreviewPush();
    }).catch(() => { if (id === currentScriptId) projectAssetsReady = true; });
}

function saveProjectAssets() {
    if (storageMode !== 'idb') return;
    const files = projectAssets;
    track(Store.putAssets(scriptDb, currentScriptId, files).catch((e) => { console.error('Asset save error:', e); }));
}

function addProjectAsset(path, blob) {
    const typed = blob.type ? blob : new Blob([blob], { type: Project.mimeFor(path) });
    if (projectAssetUrls[path]) URL.revokeObjectURL(projectAssetUrls[path]);
    projectAssets[path] = typed;
    projectAssetUrls[path] = URL.createObjectURL(typed);
    if (storageMode === 'idb') track(Store.putAsset(scriptDb, currentScriptId, path, typed).catch((e) => { console.error('Asset save error:', e); }));
}

function removeProjectAsset(path) {
    if (projectAssetUrls[path]) URL.revokeObjectURL(projectAssetUrls[path]);
    delete projectAssets[path];
    delete projectAssetUrls[path];
    if (storageMode === 'idb') track(Store.deleteAsset(scriptDb, currentScriptId, path).catch((e) => { console.error('Asset delete error:', e); }));
}

function projectAssetBytes() {
    return Object.keys(projectAssets).reduce((n, p) => n + projectAssets[p].size, 0);
}

function assetsForSnapshot() {
    return projectAssetsReady ? Object.assign({}, projectAssets) : null;
}

function restoreProjectAssets(wanted) {
    if (!wanted) return;
    Object.keys(projectAssets).forEach((p) => { if (wanted[p] !== projectAssets[p]) removeProjectAsset(p); });
    Object.keys(wanted).forEach((p) => { if (!(p in projectAssets)) addProjectAsset(p, wanted[p]); });
}

function moveProjectAsset(from, to) {
    const blob = projectAssets[from];
    removeProjectAsset(from);
    addProjectAsset(to, blob);
}

function beginAssetChange() {
    ensureEntries();
    currentSnapshot = captureSnapshot();
    pushUndoState();
}

function finishAssetChange() {
    renderExplorer();
    drawStageNow();
    if (typeof scheduleProblemsCheck === 'function') scheduleProblemsCheck();
    if (typeof schedulePreviewPush === 'function') schedulePreviewPush();
    scheduleAutoSave();
    syncLatestHistoryState();
}

const EMERGENCY_KEY = 'plainchant_web_emergency';

const saveBtn = document.getElementById('saveBtn');
const newBtn = document.getElementById('newBtn');

let library = {};
let scriptDb = null;
let storageMode = null;
const pendingWrites = new Set();
const libraryChannel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('plainchant-web-library') : null;

function getScripts() {
    return library;
}

function readEmergency() {
    try {
        const data = JSON.parse(localStorage.getItem(EMERGENCY_KEY) || '{}');
        return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    } catch (e) { return {}; }
}

function writeEmergency(entries) {
    try {
        if (Object.keys(entries).length) localStorage.setItem(EMERGENCY_KEY, JSON.stringify(entries));
        else localStorage.removeItem(EMERGENCY_KEY);
    } catch (e) {
    }
}

function clearEmergency(id, upTo) {
    const entries = readEmergency();
    if (entries[id] && entries[id].updatedAt <= upTo) { delete entries[id]; writeEmergency(entries); }
}

function track(promise) {
    pendingWrites.add(promise);
    promise.then(() => pendingWrites.delete(promise));
    return promise;
}

async function whenSaved() {
    while (pendingWrites.size) await Promise.all(Array.from(pendingWrites));
}

function announce(change) {
    if (libraryChannel && ((change.put && change.put.length) || (change.remove && change.remove.length))) {
        try { libraryChannel.postMessage({ put: change.put || [], remove: change.remove || [] }); } catch (e) {
        }
    }
}

function persist(change) {
    if (storageMode !== 'idb') return Promise.resolve(false);
    let written;
    try { written = Store.write(scriptDb, change); } catch (e) { written = Promise.reject(e); }
    return track(written.then(() => { announce(change); return true; }, (e) => { console.error('Save error:', e); return false; }));
}

function putScripts(next) {
    const before = library;
    const change = Store.diff(before, next);
    library = next;
    return persist(change).then((ok) => {
        if (ok) return true;
        const back = Object.assign({}, library);
        change.put.forEach((s) => {
            if (library[s.id] !== s) return;
            if (before[s.id]) back[s.id] = before[s.id]; else delete back[s.id];
        });
        change.remove.forEach((id) => { if (!(id in library) && before[id]) back[id] = before[id]; });
        library = back;
        return false;
    });
}

function rememberCurrent() {
    persist({ meta: { currentScriptId: currentScriptId } });
}

function receiveLibraryChange(e) {
    const change = e.data || {};
    const next = Object.assign({}, library);
    (change.put || []).forEach((s) => { if (s && s.id) next[s.id] = s; });
    (change.remove || []).forEach((id) => { delete next[id]; });
    library = next;
}

async function openStorage(factory) {
    let pointer = null;
    try {
        const db = await Store.open(factory === undefined ? window.indexedDB : factory);
        const all = await Store.loadAll(db);
        scriptDb = db;
        storageMode = 'idb';
        library = all.scripts;
        projectLinks = await Store.loadLinks(db).catch(() => ({}));
        pointer = typeof all.meta.currentScriptId === 'string' ? all.meta.currentScriptId : null;
    } catch (e) {
        storageMode = 'none';
        library = {};
        return null;
    }
    if (libraryChannel) libraryChannel.onmessage = receiveLibraryChange;

    const buffered = readEmergency();
    const found = Store.reconcile(library, Object.values(buffered), newId);
    if (found.restored.length) {
        if (!(await putScripts(found.scripts))) return pointer;
        pointer = found.currentId;
        await persist({ meta: { currentScriptId: pointer } });
    }
    const left = readEmergency();
    Object.keys(buffered).forEach((id) => { if (!left[id] || !buffered[id] || left[id].updatedAt === buffered[id].updatedAt) delete left[id]; });
    writeEmergency(left);
    return pointer;
}

async function restoreLastScript(factory) {
    const pointer = await openStorage(factory);
    purgeTrash();
    const scripts = getScripts();

    let script = pointer ? scripts[pointer] : null;
    const pointerDeleted = !!(script && script.deletedAt);
    if (pointerDeleted) script = null;
    if (!pointer) script = Library.active(scripts)[0] || null;

    if (script) {
        currentScriptId = script.id;
        loadProjectIntoEditor(script.content);
    } else {
        loadProjectIntoEditor(Project.starter());
    }
    rememberCurrent();
    restoreProjectLink(currentScriptId);
}

function purgeTrash() {
    const result = Library.purgeExpired(getScripts(), Date.now());
    if (result.removed.length) putScripts(result.scripts);
}

function startNewScript() {
    flushSave();
    currentScriptId = newId();
    selectedPcId = null;
    if (typeof clearLinkedFolder === 'function') clearLinkedFolder();
    loadProjectIntoEditor(Project.blank());
    rememberCurrent();
    render(false);
    syncElementState();
}

function loadStarterProject() {
    flushSave();
    currentScriptId = newId();
    selectedPcId = null;
    if (typeof clearLinkedFolder === 'function') clearLinkedFolder();
    loadProjectIntoEditor(Project.starter());
    saveScript(true);
    render(false);
    syncElementState();
}

function flushSave() {
    clearTimeout(autoSaveTimer);
    syncBufferFromEditor();
    if (projectFiles.html.trim() || projectFiles.css.trim() || projectFiles.js.trim()) {
        saveScript(true);
    }
}

function saveScript(isAuto = false) {
    syncBufferFromEditor();
    const packed = Project.pack(projectFiles);
    const savedCopy = Object.assign({}, projectFiles.entries);
    if (!storageMode) return;
    const title = Project.extractTitle(projectFiles);

    const originalText = saveBtn.innerText;
    if (!isAuto) saveBtn.innerText = 'Saving...';
    const finish = (ok) => {
        if (isAuto) return;
        saveBtn.innerText = ok ? 'Saved!' : 'Error';
        if (ok) saveBtn.classList.add('success');
        setTimeout(() => {
            saveBtn.innerText = originalText;
            saveBtn.classList.remove('success');
        }, 1800);
    };

    if (storageMode === 'none') { finish(false); return; }

    const scripts = getScripts();
    if (scripts[currentScriptId] && scripts[currentScriptId].deletedAt) currentScriptId = newId();
    const record = Object.assign({}, scripts[currentScriptId], {
        id: currentScriptId,
        title: title,
        content: packed,
        updatedAt: Date.now()
    });
    library = Object.assign({}, scripts, { [record.id]: record });

    const entries = readEmergency();
    entries[record.id] = { id: record.id, title: record.title, content: record.content, updatedAt: record.updatedAt };
    writeEmergency(entries);

    let written;
    const versions = { rules: Versions, now: record.updatedAt, makeId: newId };
    try { written = Store.saveScript(scriptDb, record, newId(), versions); } catch (e) { written = Promise.reject(e); }
    track(written.then(({ record: stored, deleted }) => {
        clearEmergency(record.id, record.updatedAt);
        if (deleted) {
            library = Object.assign({}, library, { [deleted.id]: deleted, [stored.id]: stored });
            if (currentScriptId === record.id) currentScriptId = stored.id;
        }
        announce({ put: [stored] });
        if (!isAuto && typeof markFilesSaved === 'function') markFilesSaved(savedCopy);
        finish(true);
        if (!isAuto) {
            showNotice(linkedFolder
                ? 'Saved to Studio workspace. Use Export to write changes to local disk.'
                : 'Saved to Studio workspace.');
        }
    }, () => {
        finish(false);
    }));
}

saveBtn.addEventListener('click', () => saveScript(false));
newBtn.addEventListener('click', startNewScript);
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveScript(false);
    }
});
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushSave();
});
window.addEventListener('pagehide', flushSave);

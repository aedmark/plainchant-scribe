const importInput = document.getElementById('importInput');
const libImport = document.getElementById('libImport');
const dropHint = document.getElementById('dropHint');

async function importFiles(fileList) {
    const dropped = Array.from(fileList || []);
    const images = dropped.filter((f) => ImageLib.isImage(f.name));
    if (images.length && typeof addImageFiles === 'function') addImageFiles(images);
    const files = dropped.filter((f) => Importing.accept(f.name) && !ImageLib.isImage(f.name));
    if (!files.length) {
        if (!images.length) showNotice('Please choose .html, .css, or .js files.', true);
        return;
    }
    const entries = {};
    for (const file of files) {
        const text = Importing.decode(new Uint8Array(await file.arrayBuffer()));
        if (Importing.kindOf(file.name) === 'html' && /^\s*\{|PLAINCHANT:FILE:/.test(text)) Object.assign(entries, Project.unpack(text).entries);
        else entries[file.name] = text;
    }
    flushSave();
    currentScriptId = newId();
    selectedPcId = null;
    clearLinkedFolder();
    loadProjectIntoEditor({ entries: entries });
    saveScript(true);
    saveProjectAssets();
    render(false);
    closeModal(libraryModal);
    showNotice('Opened ' + files.map((f) => f.name).join(', ') + ' as a new project.');
}

libImport.addEventListener('click', () => importInput.click());
document.getElementById('openFileBtn').addEventListener('click', () => importInput.click());
importInput.addEventListener('change', () => {
    if (importInput.files && importInput.files.length) importFiles(importInput.files);
    importInput.value = '';
});

let dragDepth = 0;
window.addEventListener('dragenter', (e) => {
    if (!e.dataTransfer || !Array.from(e.dataTransfer.types || []).includes('Files')) return;
    dragDepth++;
    dropHint.hidden = false;
});
window.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) dropHint.hidden = true;
});
window.addEventListener('dragover', (e) => {
    if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) e.preventDefault();
});
window.addEventListener('drop', (e) => {
    dragDepth = 0;
    dropHint.hidden = true;
    if (!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files.length) return;
    e.preventDefault();
    importFiles(e.dataTransfer.files);
});

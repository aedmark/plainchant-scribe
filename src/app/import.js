const importInput = document.getElementById('importInput');
const libImport = document.getElementById('libImport');
const dropHint = document.getElementById('dropHint');

// Import .epub (P5-02, D-038): Epub.read checks the untrusted archive before anything reaches the library; the book
// opens as a new project, its text files editable and its images, fonts, and media as assets.
async function importEpub(file) {
    if (file.size > Epub.LIMITS.total) { showNotice(file.name + ' is larger than ' + Math.round(Epub.LIMITS.total / 1048576) + ' MB, so it was not imported.', true); return; }
    let book;
    try { book = await Epub.read(new Uint8Array(await file.arrayBuffer())); } catch (e) { showNotice(e.message, true); return; }
    flushSave();
    currentScriptId = newId();
    selectedPcId = null;
    clearLinkedFolder();
    const assets = {};
    Object.keys(book.binaries).forEach((p) => { assets[p] = new Blob([book.binaries[p]], { type: Project.mimeFor(p) }); });
    loadProjectIntoEditor({ entries: book.entries, tree: Project.deriveTree(book.entries, null, Object.keys(assets)) }, { assets: assets });
    saveScript(true);
    saveProjectAssets();
    render(false);
    closeModal(libraryModal);
    const errors = book.problems.filter((x) => x.severity === 'error').length;
    const notes = book.warnings.slice(0, 2).concat(errors ? [errors + (errors === 1 ? ' problem needs' : ' problems need') + ' fixing; see the Problems panel.'] : []);
    showNotice('Opened ' + (book.title || file.name) + ' from ' + file.name + ' as a new book.' + (notes.length ? ' ' + notes.join(' ') : ''), errors > 0);
}

async function importFiles(fileList) {
    const dropped = Array.from(fileList || []);
    const epubs = dropped.filter((f) => /\.epub$/i.test(f.name));
    if (epubs.length) {
        if (dropped.length > 1) showNotice('Opening ' + epubs[0].name + ' only: import one .epub at a time.', true);
        await importEpub(epubs[0]);
        return;
    }
    const images = dropped.filter((f) => ImageLib.isImage(f.name));
    if (images.length && typeof addImageFiles === 'function') addImageFiles(images);
    const files = dropped.filter((f) => Importing.accept(f.name) && !ImageLib.isImage(f.name));
    if (!files.length) {
        if (!images.length) showNotice('Please choose an .epub book, or .html, .css, or .js files.', true);
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

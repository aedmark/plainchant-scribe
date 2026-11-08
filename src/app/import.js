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

// Import .docx as a new book (P7-03, D-048): the archive is checked as an .epub is, and the book takes the
// document's title, author, and language.
async function importDocx(file) {
    if (file.size > Epub.LIMITS.total) { showNotice(file.name + ' is larger than ' + Math.round(Epub.LIMITS.total / 1048576) + ' MB, so it was not imported.', true); return; }
    let made;
    try { made = DocxImport.newBook(await Docx.read(new Uint8Array(await file.arrayBuffer())), { name: file.name }); } catch (e) { showNotice(file.name + ': ' + e.message, true); return; }
    flushSave();
    currentScriptId = newId();
    selectedPcId = null;
    clearLinkedFolder();
    const assets = {};
    Object.keys(made.binaries).forEach((p) => { assets[p] = new Blob([made.binaries[p]], { type: Project.mimeFor(p) }); });
    loadProjectIntoEditor({ entries: made.entries, tree: Project.deriveTree(made.entries, null, Object.keys(assets)) }, { assets: assets });
    saveScript(true);
    saveProjectAssets();
    render(false);
    closeModal(libraryModal);
    const left = made.skipped.length ? ' Left out: ' + made.skipped.slice(0, 3).join(', ') + '.' : '';
    showNotice('Made ' + made.title + ' from ' + file.name + ': ' + made.added.length + (made.added.length === 1 ? ' chapter.' : ' chapters.') + left, made.skipped.length > 0);
}

async function importFiles(fileList) {
    const dropped = Array.from(fileList || []);
    const books = dropped.filter((f) => /\.(epub|docx)$/i.test(f.name));
    if (books.length) {
        if (dropped.length > 1) showNotice('Opening ' + books[0].name + ' only: open one .epub or .docx at a time.', true);
        await (/\.docx$/i.test(books[0].name) ? importDocx(books[0]) : importEpub(books[0]));
        return;
    }
    const images = dropped.filter((f) => ImageLib.isImage(f.name));
    if (images.length && typeof addImageFiles === 'function') addImageFiles(images);
    const files = dropped.filter((f) => Importing.accept(f.name) && !ImageLib.isImage(f.name));
    if (!files.length) {
        if (!images.length) showNotice('Please choose an .epub book, a .docx document, or .html, .css, or .js files.', true);
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

// Books opened from the desktop (P7-05, D-050): an .epub double-clicked or opened with Scribe arrives in the shell,
// which keeps the path until it is taken here. Each opens as a new book, as Open file… does.
async function openDesktopBooks() {
    let paths;
    try { paths = await tauriInvoke('take_opened_books'); } catch (e) { return; }
    for (const path of paths) {
        const name = String(path).split(/[\\/]/).pop();
        let bytes;
        try { bytes = await tauriInvoke('read_opened_book', { path: path }); } catch (e) { showNotice(String(e), true); continue; }
        await importEpub(new File([bytes], name, { type: 'application/epub+zip' }));
    }
}

function listenForDesktopBooks() {
    if (!hasTauri()) return;
    const events = window.__TAURI__ && window.__TAURI__.event;
    if (events && typeof events.listen === 'function') events.listen('books-opened', () => { whenReady().then(openDesktopBooks); });
    openDesktopBooks();
}

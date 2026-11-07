// Export as .epub (P5-01, D-037): the Export dialog's first section in a book. It warns before exporting a book with
// errors, sets dcterms:modified to now in the working copy (one undo step), packs the book with BookExport, and then
// downloads it, or in the desktop app asks where to save it.

const epubExportSection = document.getElementById('epubExportSection');
const exportEpubBtn = document.getElementById('exportEpubBtn');

function refreshEpubExport() {
    const book = isBookProject();
    epubExportSection.hidden = !book;
    document.getElementById('bundleExportSection').hidden = book;
    exportEpubBtn.textContent = hasTauri() ? 'Save .epub…' : 'Download .epub';
}

// The open book packed as Export writes it: the working copy's text files and its binary assets (P5-01, P5-05).
// when: the date stamped on the zip entries (default now); send to reader keeps one, so the same book packs the same bytes.
async function packOpenBook(when) {
    const binaries = {};
    for (const path of Object.keys(projectAssets || {})) if (!(path in projectFiles.entries)) binaries[path] = new Uint8Array(await projectAssets[path].arrayBuffer());
    return BookExport.pack(projectFiles.entries, binaries, when ? { when: when } : undefined);
}

async function exportEpub() {
    ensureEntries();
    syncBufferFromEditor();
    const assets = Object.keys(projectAssets || {});
    const read = Book.read(projectFiles.entries, { assets: assets });
    if (!read.model) { showNotice('content.opf cannot be read, so the book cannot be exported. Fix it in the code editor.', true); return; }
    const errors = bookProblems().filter((p) => p.severity === 'error');
    if (errors.length && !await askConfirm({
        title: 'Export a book with errors?',
        text: 'This book has ' + errors.length + (errors.length === 1 ? ' error' : ' errors') + ', for example: ' + errors[0].message + ' Reading apps and stores may refuse it. Fix them first, or export anyway to test.',
        confirm: 'Export anyway'
    })) return;
    if (!applyBookOps(BookMeta.touchModified(Date.now()))) return;
    const res = await packOpenBook();
    const name = BookExport.fileName(read.model.metadata.title);
    let where = name;
    if (hasTauri()) {
        const saved = await tauriInvoke('save_book_file', { name: name, data: await blobToBase64(new Blob([res.bytes])) });
        if (!saved) { showNotice('Export cancelled. The last-modified date was still updated; undo puts it back.'); return; }
        where = saved;
    } else {
        downloadFile(name, res.bytes, 'application/epub+zip');
    }
    const notes = [];
    if (res.left.length) notes.push('Left out, as content.opf does not list them: ' + res.left.slice(0, 5).join(', ') + (res.left.length > 5 ? ', and ' + (res.left.length - 5) + ' more' : '') + '.');
    if (res.missing.length) notes.push('Listed but missing: ' + res.missing.join(', ') + '.');
    showNotice('Exported ' + where + ' (' + res.order.length + ' files, ' + Math.max(1, Math.round(res.bytes.length / 1024)) + ' KB).' + (notes.length ? ' ' + notes.join(' ') : ''), res.missing.length > 0);
}

exportEpubBtn.addEventListener('click', () => {
    exportEpubBtn.disabled = true;
    exportEpub().catch((err) => showNotice('Could not export the book: ' + (err && err.message || err), true)).finally(() => { exportEpubBtn.disabled = false; });
});

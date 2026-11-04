const exportModal = document.getElementById('export-modal');
const copyBtn = document.getElementById('copyBtn');
const folderExportNote = document.getElementById('folderExportNote');
const separateExportNote = document.getElementById('separateExportNote');
const bundleExportNote = document.getElementById('bundleExportNote');
const exportFilesList = document.getElementById('exportFilesList');

function slugifyTitle(title) {
    return String(title || 'project')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'project';
}

function mimeForPath(filePath) {
    const lower = String(filePath || '').toLowerCase();
    if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'text/html;charset=utf-8';
    if (lower.endsWith('.css')) return 'text/css;charset=utf-8';
    if (lower.endsWith('.js') || lower.endsWith('.mjs')) return 'text/javascript;charset=utf-8';
    if (lower.endsWith('.json')) return 'application/json;charset=utf-8';
    if (lower.endsWith('.svg')) return 'image/svg+xml;charset=utf-8';
    return 'text/plain;charset=utf-8';
}

function downloadFile(filename, content, mime) {
    const blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function copyText(text, label) {
    try {
        await navigator.clipboard.writeText(text);
        showNotice('Copied ' + (label || 'to clipboard') + '.');
        return true;
    } catch (e) {
        showNotice('Could not copy to clipboard.', true);
        return false;
    }
}

function isDefaultThreeFileScheme(entries) {
    const keys = Object.keys(entries || {}).sort();
    return keys.length === 3 &&
        keys[0] === 'index.html' &&
        keys[1] === 'script.js' &&
        keys[2] === 'styles.css';
}

function refreshExportModal() {
    ensureEntries();
    syncBufferFromEditor();
    const keys = Object.keys(projectFiles.entries || {}).sort();
    const isDefault = isDefaultThreeFileScheme(projectFiles.entries) && !linkedFolder;
    const previewList = keys.slice(0, 6).join(', ') + (keys.length > 6 ? ', +' + (keys.length - 6) + ' more' : '');

    if (folderExportNote) {
        if (linkedFolder) {
            folderExportNote.textContent =
                'Imported from "' + linkedFolder.name + '" (' + keys.length + ' editable files: ' + previewList + '). ' +
                'Edits stay in your Studio project environment until you export here. ' +
                'Saving to local disk retains your exact existing folder hierarchy, file names, and untouched binary assets.';
        } else if (!isDefault) {
            folderExportNote.textContent =
                'Custom project structure (' + keys.length + ' files: ' + previewList + '). ' +
                'Saving to a local folder retains all existing file names and relative subdirectory paths.';
        } else {
            folderExportNote.textContent =
                'Default project scheme (index.html, styles.css, script.js). ' +
                'Choose a local folder on disk to write these files directly.';
        }
    }

    if (exportFolderBtn && exportNewFolderBtn) {
        if (linkedFolder) {
            const shortName = String(linkedFolder.name || '').split(/[\\/]/).filter(Boolean).pop() || linkedFolder.name;
            exportFolderBtn.textContent = 'Save Changes to "' + shortName + '"';
            exportNewFolderBtn.hidden = false;
        } else {
            exportFolderBtn.textContent = 'Export to Local Folder…';
            exportNewFolderBtn.hidden = true;
        }
    }

    if (separateExportNote) {
        separateExportNote.textContent = 'Download any of the ' + keys.length + ' editable files in this project with its original filename:';
    }

    if (exportFilesList) {
        exportFilesList.textContent = '';
        keys.forEach((relPath) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn';
            btn.textContent = relPath;
            btn.title = 'Download ' + relPath;
            btn.addEventListener('click', () => {
                syncBufferFromEditor();
                const baseName = relPath.split('/').pop() || relPath;
                downloadFile(baseName, projectFiles.entries[relPath] || '', mimeForPath(relPath));
                showNotice('Downloaded ' + relPath);
            });
            exportFilesList.appendChild(btn);
        });
    }

    if (bundleExportNote) {
        const htmlName = activeHtmlFile || 'index.html';
        const cssName = activeCssFile || 'styles.css';
        bundleExportNote.textContent =
            'Inlines the active HTML page (' + htmlName + ') with its linked stylesheet (' + cssName + ') and JS into a single self-contained .html file.';
    }
}

function openExportModal() {
    refreshExportModal();
    openModal(exportModal);
}

document.getElementById('exportBtn').addEventListener('click', openExportModal);

document.getElementById('exportBundleBtn').addEventListener('click', () => {
    syncBufferFromEditor();
    const title = Project.extractTitle(projectFiles);
    const bundled = Project.exportSingleHtml(projectFiles);
    downloadFile(slugifyTitle(title) + '.html', bundled, 'text/html;charset=utf-8');
    showNotice('Downloaded standalone HTML.');
});

document.getElementById('copyBundleBtn').addEventListener('click', () => {
    syncBufferFromEditor();
    copyText(Project.exportSingleHtml(projectFiles), 'bundled HTML');
});

copyBtn.addEventListener('click', () => {
    syncBufferFromEditor();
    copyText(editor.value, activeFile + ' source');
});

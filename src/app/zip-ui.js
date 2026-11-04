const exportZipBtn = document.getElementById('exportZipBtn');
const zipExportSection = document.getElementById('zipExportSection');

if (hasTauri()) zipExportSection.hidden = true;

async function downloadProjectZip() {
    ensureEntries();
    syncBufferFromEditor();
    const files = Object.keys(projectFiles.entries).map((path) => ({ path: path, data: projectFiles.entries[path] }));
    const binaries = Object.keys(projectAssets).filter((path) => !(path in projectFiles.entries));
    for (const path of binaries) files.push({ path: path, data: new Uint8Array(await projectAssets[path].arrayBuffer()) });
    const bytes = Zip.build(files, new Date());
    const name = slugifyTitle(Project.extractTitle(projectFiles)) + '.zip';
    downloadFile(name, bytes, 'application/zip');
    showNotice('Downloaded ' + name + ' (' + files.length + (files.length === 1 ? ' file' : ' files') + ').');
}

exportZipBtn.addEventListener('click', () => {
    exportZipBtn.disabled = true;
    downloadProjectZip().catch((err) => showNotice('Could not create the zip file: ' + (err && err.message || err), true)).finally(() => { exportZipBtn.disabled = false; });
});

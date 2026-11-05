// Embedded fonts (P4-03, D-033): the Layout tab's Fonts section lists the book's fonts and imports or removes them.
// Import reads the file's details and embedding flag (FontInfo), refuses a restricted font, and asks the author to
// confirm the details and the licence. A font's file, manifest item, and @font-face rule change in one undo step.

const fontModal = document.getElementById('font-modal');
const fontFileInput = document.getElementById('fontFileInput');
let fontPending = null;

function showFonts(fonts) {
    const box = document.getElementById('fontList');
    box.textContent = '';
    if (!fonts.length) {
        const p = document.createElement('p');
        p.className = 'parts-help';
        p.textContent = 'No fonts embedded: readers use their own.';
        box.appendChild(p);
        return;
    }
    const sheet = layoutTarget();
    fonts.forEach((f) => {
        const row = document.createElement('div');
        row.className = 'font-item';
        const label = document.createElement('span');
        label.textContent = f.family + ' ' + f.weight + (f.style === 'italic' ? ' italic' : '') + ' ';
        const file = document.createElement('small');
        file.textContent = f.src.split('/').pop();
        label.appendChild(file);
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'mini';
        remove.textContent = 'Remove';
        remove.setAttribute('aria-label', 'Remove ' + f.family + ' ' + f.weight + ' ' + f.style);
        remove.addEventListener('click', () => removeFont(Book.resolveHref(sheet, f.src).path, f.family));
        row.append(label, remove);
        box.appendChild(row);
    });
}

function commitFont(res, change, notice) {
    let tree = projectFiles.tree;
    (change.added ? [change.added] : []).forEach((p) => { tree = Project.treeAfter(tree, { type: 'add', path: p, is_text: false }); });
    (change.removed ? [change.removed] : []).forEach((p) => { tree = Project.treeAfter(tree, { type: 'delete', path: p }); });
    commitFileChange(res.entries, {
        tree: tree, openTabs: openTabs, activeFile: activeFile, activeHtmlFile: activeHtmlFile,
        apply: () => { if (change.added) addProjectAsset(change.added, change.blob); if (change.removed && projectAssets[change.removed]) removeProjectAsset(change.removed); }
    });
    refreshLayout();
    showNotice(notice);
}

async function removeFont(path, family) {
    if (!await askConfirm({ title: 'Remove this font?', text: path.split('/').pop() + ' is deleted from the book with its manifest entry and @font-face rule. Text set in ' + family + ' falls back to the next font. Undo brings it back.', confirm: 'Remove font' })) return;
    syncBufferFromEditor();
    let res;
    try { res = BookFonts.remove(projectFiles.entries, Object.keys(projectAssets || {}), path); } catch (e) { showNotice(e.message, true); return; }
    commitFont(res, { removed: path }, 'Removed ' + path.split('/').pop() + '.');
}

async function chooseFont(file) {
    if (!FontInfo.mediaTypeFor(file.name)) { showNotice(file.name + ' is not a TTF, OTF, WOFF, or WOFF2 font.', true); return; }
    if (file.size > ASSET_MAX_FILE_BYTES) { showNotice(file.name + ' is too large to embed.', true); return; }
    const info = FontInfo.read(new Uint8Array(await file.arrayBuffer()), file.name);
    if (info.restricted) {
        showNotice(file.name + ' says its licence does not allow embedding (Restricted License, OpenType fsType), so it was not added. Use a font licensed for ebooks, such as one under the SIL Open Font License.', true);
        return;
    }
    fontPending = file;
    document.getElementById('fontFileName').textContent = file.name + (info.fromFile ? ' (details read from the font)' : ' (details guessed from the file name; check them)');
    document.getElementById('fontFamily').value = info.family;
    document.getElementById('fontWeight').value = String(info.weight);
    document.getElementById('fontStyle').value = info.italic ? 'italic' : 'normal';
    document.getElementById('fontLicence').checked = false;
    document.getElementById('fontError').hidden = true;
    openModal(fontModal, { focus: '#fontFamily', onClose: () => { fontPending = null; } });
}

document.getElementById('fontForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const err = document.getElementById('fontError');
    const family = document.getElementById('fontFamily').value.trim();
    if (!family) { err.textContent = 'Enter the font family name.'; err.hidden = false; return; }
    if (!document.getElementById('fontLicence').checked) { err.textContent = 'Confirm that the font’s licence allows embedding.'; err.hidden = false; return; }
    const file = fontPending;
    if (!file) return;
    syncBufferFromEditor();
    const taken = Object.keys(projectFiles.entries).concat(Object.keys(projectAssets || {}), (projectFiles.tree || []).map((t) => t.path));
    const path = ImageLib.uniquePath(taken, file.name, BookFonts.folder(projectFiles.entries));
    let res;
    try {
        res = BookFonts.add(projectFiles.entries, Object.keys(projectAssets || {}).concat(path), { path: path, family: family, weight: Number(document.getElementById('fontWeight').value), style: document.getElementById('fontStyle').value });
    } catch (x) { err.textContent = x.message; err.hidden = false; return; }
    closeModal(fontModal);
    commitFont(res, { added: path, blob: new Blob([file], { type: FontInfo.mediaTypeFor(file.name) }) }, 'Embedded ' + family + ' as ' + path + '. Choose it under Body text or Headings to use it.');
});
document.getElementById('fontImportBtn').addEventListener('click', () => fontFileInput.click());
fontFileInput.addEventListener('change', () => {
    if (fontFileInput.files && fontFileInput.files[0]) chooseFont(fontFileInput.files[0]);
    fontFileInput.value = '';
});

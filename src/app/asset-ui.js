const assetsModal = document.getElementById('assets-modal');
const assetsTitle = document.getElementById('assets-title');
const assetGrid = document.getElementById('assetGrid');
const assetSearch = document.getElementById('assetSearch');
const assetStatus = document.getElementById('assetStatus');
const assetAddBtn = document.getElementById('assetAddBtn');
const assetFileInput = document.getElementById('assetFileInput');
const SRC_IMAGE_TAGS = ['img', 'source'];

let assetPicker = null;
let assetTempUrls = [];

function releaseAssetTempUrls() {
    assetTempUrls.forEach((u) => URL.revokeObjectURL(u));
    assetTempUrls = [];
}

function assetThumbUrl(item) {
    if (item.source === 'asset') return projectAssetUrls[item.path] || '';
    if (item.source === 'text') {
        const url = URL.createObjectURL(new Blob([projectFiles.entries[item.path]], { type: 'image/svg+xml' }));
        assetTempUrls.push(url);
        return url;
    }
    return projectBaseUrl ? projectBaseUrl.replace(/\/?$/, '/') + item.path.split('/').map(encodeURIComponent).join('/') : '';
}

function assetByteSize(item) {
    if (item.source === 'asset') return projectAssets[item.path].size;
    if (item.source === 'text') return new Blob([projectFiles.entries[item.path]]).size;
    return null;
}

function selectedImageTarget() {
    const node = selectedPcId ? HtmlAst.findById(currentHtmlAst, selectedPcId) : null;
    return node && SRC_IMAGE_TAGS.indexOf(node.tag) !== -1 ? node : null;
}

function insertAssetImage(item) {
    // A book gets a figure with alt text and well-formed XHTML (P4-05, D-035).
    if (isBookProject()) { openBlockDialog('figure', { image: item.path }); return; }
    const rel = Project.relativePath(activeHtmlFile, item.path);
    const snippet = '<img src="' + HtmlAst.escapeAttr(rel) + '" alt="' + HtmlAst.escapeAttr(item.name.replace(/\.[^.]+$/, '')) + '" style="max-width: 100%; height: auto;">';
    const node = selectedPcId ? HtmlAst.findById(currentHtmlAst, selectedPcId) : null;
    const target = node && node.tag !== 'html' && node.tag !== 'head' ? node.id : null;
    const res = HtmlAst.insertElementAt(projectFiles.html, target, 'inside-end', snippet);
    applyHtmlTransform(res.html, res.id);
    showNotice('Inserted <img> for ' + item.path);
}

function useAssetOnSelected(item) {
    const node = selectedImageTarget();
    if (!node) return;
    applyHtmlTransform(HtmlAst.setAttr(projectFiles.html, node.id, 'src', Project.relativePath(activeHtmlFile, item.path)), node.id);
    showNotice('Set src to ' + item.path);
}

function diskNote() {
    return linkedFolder ? ' Files already on disk are never changed or deleted by export.' : '';
}

function deleteAssetItem(item, uses) {
    const message = 'Delete ' + item.path + '?' + (uses ? '\nIt is used in ' + uses + (uses === 1 ? ' place' : ' places') + ', and those links will break.' : '') + '\nYou can undo this with Ctrl/Cmd+Z.' + diskNote();
    if (!window.confirm(message)) return;
    if (item.source === 'text') { deleteProjectFile(item.path); renderAssets(); return; }
    beginAssetChange();
    removeProjectAsset(item.path);
    if (Array.isArray(projectFiles.tree)) projectFiles.tree = Project.treeAfter(projectFiles.tree, { type: 'delete', path: item.path });
    finishAssetChange();
    renderAssets();
    showNotice('Deleted ' + item.path + '. Press Ctrl/Cmd+Z to undo.');
}

async function adoptDiskImage(item) {
    if (item.source === 'asset') return true;
    if (item.source !== 'file' || !projectBaseUrl) return false;
    try {
        const res = await fetch(projectBaseUrl.replace(/\/?$/, '/') + item.path.split('/').map(encodeURIComponent).join('/'));
        if (!res.ok) return false;
        const blob = await res.blob();
        if (blob.size > ASSET_MAX_FILE_BYTES) return false;
        addProjectAsset(item.path, blob.type ? blob : new Blob([blob], { type: Project.mimeFor(item.path) }));
        return true;
    } catch (e) {
        return false;
    }
}

async function moveAssetTo(item, to) {
    ensureEntries();
    syncBufferFromEditor();
    const known = Object.keys(projectAssets).concat(knownTreePaths());
    const res = Project.renameAsset(projectFiles.entries, item.path, to, { known: known });
    if (res.error) { showNotice(res.error, true); return null; }
    if (!(await adoptDiskImage(item))) { showNotice('Could not read ' + item.path + ' to move it.', true); return null; }
    commitFileChange(res.entries, {
        tree: Array.isArray(projectFiles.tree) ? Project.treeAfter(projectFiles.tree, { type: 'rename', from: item.path, to: res.path }) : projectFiles.tree,
        openTabs: openTabs, activeFile: activeFile, activeHtmlFile: activeHtmlFile,
        apply: () => moveProjectAsset(item.path, res.path)
    });
    return res;
}

async function renameAssetItem(item) {
    if (item.source === 'text') { closeModal(assetsModal); renameProjectFile(item.path); return; }
    const answer = await askText({
        title: 'Rename image',
        hint: 'New path for ' + item.path + '. Include folders to move it. Links to the image are updated.',
        value: item.path, confirm: 'Rename', validate: (text) => (text ? '' : 'Enter a name.')
    });
    if (answer == null || Project.normalizeFilePath(answer) === item.path) return;
    const res = await moveAssetTo(item, answer);
    if (!res) return;
    renderAssets();
    showNotice('Renamed to ' + res.path + (res.refsUpdated ? ' and updated links in ' + res.refsUpdated + (res.refsUpdated === 1 ? ' file.' : ' files.') : '.') + diskNote());
}

function assetButton(label, title, fn, cls) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mini' + (cls ? ' ' + cls : '');
    btn.textContent = label;
    btn.title = title;
    btn.addEventListener('click', fn);
    return btn;
}

function renderAssets() {
    releaseAssetTempUrls();
    const query = assetSearch.value.trim().toLowerCase();
    const entries = Object.assign({}, projectFiles.entries);
    if (activeFile in entries) entries[activeFile] = editor.value;
    const used = Links.usage(entries);
    const items = ImageLib.list({ assets: projectAssets, tree: projectFiles.tree, entries: entries });
    const shown = items.filter((i) => !query || i.path.toLowerCase().includes(query));
    assetGrid.textContent = '';
    if (!shown.length) {
        const empty = document.createElement('p');
        empty.className = 'asset-empty';
        empty.textContent = items.length ? 'No images match "' + assetSearch.value.trim() + '".'
            : 'No images yet. Use Add images…, or drop image files onto the page.';
        assetGrid.appendChild(empty);
    }
    const target = selectedImageTarget();
    shown.forEach((item) => {
        const uses = (used[item.path] || []).length;
        const card = document.createElement('div');
        card.className = 'asset-card';
        const thumb = document.createElement('div');
        thumb.className = 'asset-thumb';
        const img = document.createElement('img');
        img.alt = item.name;
        img.loading = 'lazy';
        const meta = document.createElement('div');
        meta.className = 'asset-meta';
        const name = document.createElement('strong');
        name.textContent = item.name;
        name.title = item.path;
        const info = document.createElement('span');
        const size = ImageLib.formatBytes(assetByteSize(item));
        const base = [item.folder || '(project root)', size].filter(Boolean).join(' · ');
        const usage = uses ? 'used ' + uses + '×' : 'not used';
        info.textContent = base + ' · ' + usage;
        img.addEventListener('load', () => { info.textContent = [item.folder || '(project root)', img.naturalWidth + '×' + img.naturalHeight, size].filter(Boolean).join(' · ') + ' · ' + usage; });
        img.src = assetThumbUrl(item);
        thumb.appendChild(img);
        meta.append(name, info);
        const actions = document.createElement('div');
        actions.className = 'asset-actions';
        if (assetPicker) {
            actions.appendChild(assetButton('Use this image', 'Choose ' + item.path, () => { const pick = assetPicker; closeModal(assetsModal); pick.pick(item); }, 'primary'));
        } else {
            actions.appendChild(assetButton('Insert', 'Insert an <img> for this image into the page', () => { closeModal(assetsModal); insertAssetImage(item); }));
            if (target) actions.appendChild(assetButton('Use on <' + target.tag + '>', 'Set the selected <' + target.tag + '> src to this image', () => { closeModal(assetsModal); useAssetOnSelected(item); }));
            actions.appendChild(assetButton('Copy path', 'Copy this image\'s path as seen from the current page', () => copyText(Project.relativePath(activeHtmlFile, item.path), 'image path')));
        }
        if (!assetPicker) actions.appendChild(assetButton('Rename', 'Rename or move this image and update links to it', () => renameAssetItem(item)));
        if (item.source !== 'file') actions.appendChild(assetButton('Delete', 'Remove this image from the project (undoable)', () => deleteAssetItem(item, uses), 'danger-mini'));
        card.append(thumb, meta, actions);
        assetGrid.appendChild(card);
    });
    const bytes = projectAssetBytes();
    assetStatus.textContent = items.length + (items.length === 1 ? ' image' : ' images') + (bytes ? ' · ' + ImageLib.formatBytes(bytes) + ' added or loaded' : '');
    assetAddBtn.title = 'Add images to the project\'s images folder (you can also drop image files anywhere)';
}

function openAssetManager(options) {
    assetPicker = options && options.pick ? options : null;
    assetsTitle.textContent = assetPicker ? 'Choose an image' : 'Assets';
    assetSearch.value = '';
    renderAssets();
    openModal(assetsModal, { focus: '#assetSearch', onClose: () => { assetPicker = null; releaseAssetTempUrls(); } });
}

// A book keeps its images beside its package document (OEBPS/images); a web project uses images/ (P3-05, D-029).
function assetImageFolder() {
    if (!isBookProject()) return 'images';
    const model = Book.read(projectFiles.entries).model;
    return model ? model.opfPath.slice(0, model.opfPath.lastIndexOf('/') + 1) + 'images' : 'images';
}

function addImageFiles(files) {
    ensureEntries();
    const taken = Object.keys(projectFiles.entries).concat(Object.keys(projectAssets), (projectFiles.tree || []).map((t) => t.path));
    let total = projectAssetBytes();
    const added = [];
    const skipped = [];
    Array.from(files).forEach((file) => {
        if (!ImageLib.isImage(file.name)) { skipped.push(file.name); return; }
        if (file.size > ASSET_MAX_FILE_BYTES || total + file.size > ASSET_MAX_TOTAL_BYTES) { skipped.push(file.name + ' (too large)'); return; }
        const path = ImageLib.uniquePath(taken, file.name, assetImageFolder());
        taken.push(path);
        if (!added.length) beginAssetChange();
        addProjectAsset(path, file);
        total += file.size;
        if (Array.isArray(projectFiles.tree)) projectFiles.tree = Project.treeAfter(projectFiles.tree, { type: 'add', path: path, is_text: false });
        added.push(path);
    });
    if (added.length) {
        finishAssetChange();
        if (assetsModal.classList.contains('active')) renderAssets();
    }
    showNotice((added.length ? 'Added ' + added.join(', ') : 'No images added') + (skipped.length ? '. Skipped: ' + skipped.join(', ') + '.' : '.'), !added.length);
}

document.getElementById('assetsBtn').addEventListener('click', () => openAssetManager());
propSrcBrowseBtn.addEventListener('click', () => {
    if (!selectedPcId) return;
    const id = selectedPcId;
    openAssetManager({ pick: (item) => applyHtmlTransform(HtmlAst.setAttr(projectFiles.html, id, 'src', Project.relativePath(activeHtmlFile, item.path)), id) });
});
assetSearch.addEventListener('input', renderAssets);
assetAddBtn.addEventListener('click', () => assetFileInput.click());
assetFileInput.addEventListener('change', () => {
    if (assetFileInput.files && assetFileInput.files.length) addImageFiles(assetFileInput.files);
    assetFileInput.value = '';
});
document.getElementById('cssBgImageBrowseBtn').addEventListener('click', () => {
    if (!selectedPcId) { showNotice('Select an element first.', true); return; }
    openAssetManager({
        pick: (item) => {
            const value = 'url("' + Project.relativePath(activeCssFile || activeHtmlFile, item.path) + '")';
            cssInputs['background-image'].value = value;
            applyCssPropertyChange('background-image', value);
        }
    });
});

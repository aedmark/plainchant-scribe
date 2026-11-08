// The cover (P3-05, D-029): the Book tab's Cover section chooses an image from the Assets picker, generates a
// typographic PNG cover, or removes the cover. BookCover marks the image cover-image and keeps a cover page first in
// the spine; each change, including a new image, is one undo step.

const coverThumb = document.getElementById('coverThumb');
const coverStatus = document.getElementById('coverStatus');
const coverModal = document.getElementById('cover-modal');
const coverCanvas = document.getElementById('coverCanvas');
const coverPalette = document.getElementById('coverPalette');

const coverAssets = () => Object.keys(projectAssets || {});

function refreshCover() {
    if (!isBookProject()) return;
    let c = null;
    try { c = BookCover.current(projectFiles.entries, coverAssets()); } catch (e) { c = null; }
    const url = c && c.path ? projectAssetUrls[c.path] : null;
    coverThumb.hidden = !url;
    if (url) { coverThumb.src = url; coverThumb.alt = 'The cover, ' + c.path.split('/').pop(); }
    coverStatus.textContent = c && c.path ? c.path + (c.page ? ', shown on ' + c.page.split('/').pop() : '') : 'No cover yet.';
    document.getElementById('coverRemoveBtn').disabled = !(c && (c.path || c.page));
    document.getElementById('coverJpegBtn').disabled = !url;
}

// Commits a BookCover result as one undo step; `asset` is a new image { path, blob } to add with it.
function commitCover(res, asset, notice) {
    let tree = projectFiles.tree;
    const added = Object.keys(res.entries).filter((p) => !(p in projectFiles.entries)).concat(asset ? [asset.path] : []);
    added.forEach((p) => { tree = Project.treeAfter(tree, { type: 'add', path: p, is_text: !(asset && p === asset.path) }); });
    (res.removed || []).forEach((p) => { tree = Project.treeAfter(tree, { type: 'delete', path: p }); });
    const removed = new Set(res.removed || []);
    const tabs = openTabs.filter((p) => !removed.has(p));
    const active = removed.has(activeFile) ? tabs[0] : activeFile;
    const page = removed.has(activeHtmlFile) ? bookChapterFor(res.entries, null) : activeHtmlFile;
    commitFileChange(res.entries, { tree: tree, openTabs: tabs, activeFile: active, activeHtmlFile: page, apply: asset ? () => addProjectAsset(asset.path, asset.blob) : undefined });
    if (asset) saveProjectAssets();
    refreshCover();
    if (typeof refreshChapters === 'function') refreshChapters();
    showNotice(notice);
}

function coverAction(run, asset, notice) {
    syncBufferFromEditor();
    try { commitCover(run(), asset, notice); } catch (e) { showNotice(e.message, true); }
}

function drawCover(ctx, plan) {
    plan.steps.forEach((s) => {
        if (s.op === 'fill') { ctx.fillStyle = s.color; ctx.fillRect(0, 0, plan.width, plan.height); }
        if (s.op === 'rule') { ctx.strokeStyle = s.color; ctx.lineWidth = s.width; ctx.beginPath(); ctx.moveTo(s.x1, s.y); ctx.lineTo(s.x2, s.y); ctx.stroke(); }
        if (s.op === 'text') { ctx.fillStyle = s.color; ctx.font = s.weight + ' ' + s.size + 'px "EB Garamond", serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText(s.text, s.x, s.y); }
    });
}

function coverPlan() {
    const model = Book.read(projectFiles.entries).model;
    const title = model ? model.metadata.title : 'Untitled';
    const author = model && model.metadata.creators.length ? model.metadata.creators[0].value : '';
    const ctx = coverCanvas.getContext('2d');
    const measure = (text, size, weight) => { ctx.font = weight + ' ' + size + 'px "EB Garamond", serif'; return ctx.measureText(text).width; };
    return BookCover.layout(title, author, coverPalette.value, measure);
}

async function renderCoverPreview() {
    // The canvas only uses EB Garamond once the face is loaded.
    if (document.fonts && document.fonts.load) await Promise.all([document.fonts.load('600 100px "EB Garamond"'), document.fonts.load('400 100px "EB Garamond"')]).catch(() => {});
    drawCover(coverCanvas.getContext('2d'), coverPlan());
}

function openCoverDialog() {
    if (!coverPalette.options.length) {
        Object.keys(BookCover.PALETTES).forEach((k) => { const o = document.createElement('option'); o.value = k; o.textContent = BookCover.PALETTES[k].label; coverPalette.appendChild(o); });
    }
    renderCoverPreview();
    document.getElementById('coverForm').onsubmit = (e) => {
        e.preventDefault();
        coverCanvas.toBlob((blob) => {
            if (!blob) { showNotice('The cover could not be drawn.', true); return; }
            const taken = Object.keys(projectFiles.entries).concat(coverAssets(), (projectFiles.tree || []).map((t) => t.path));
            const path = ImageLib.uniquePath(taken, 'cover.png', assetImageFolder());
            closeModal(coverModal);
            coverAction(() => BookCover.set(projectFiles.entries, path, coverAssets().concat(path)), { path: path, blob: blob }, 'Generated the cover: ' + path + '.');
        }, 'image/png');
    };
    openModal(coverModal, { focus: '#coverPalette' });
}

coverPalette.addEventListener('change', renderCoverPreview);
document.getElementById('coverGenerateBtn').addEventListener('click', openCoverDialog);
document.getElementById('coverChooseBtn').addEventListener('click', () => {
    openAssetManager({
        pick: (item) => {
            if (!BookCover.mediaTypeFor(item.path)) { showNotice(item.path + ' cannot be a cover: use JPEG, PNG, GIF, WebP, or SVG.', true); return; }
            coverAction(() => BookCover.set(projectFiles.entries, item.path, coverAssets()), null, 'The cover is now ' + item.path + '.');
        }
    });
});
document.getElementById('coverRemoveBtn').addEventListener('click', async () => {
    if (!await askConfirm({ title: 'Remove the cover?', text: 'The image stops being the cover and the cover page is deleted. The image itself stays in the book. Undo brings it all back.', confirm: 'Remove cover' })) return;
    coverAction(() => BookCover.remove(projectFiles.entries, coverAssets()), null, 'Removed the cover.');
});

// Save as JPEG (P7-02, D-051): KDP's cover upload takes JPEG or TIFF, not PNG, so this saves a JPEG copy at the cover's
// own size, with any transparency made white as Kindle would. The book is not changed.
async function saveCoverJpeg() {
    let c = null;
    try { c = BookCover.current(projectFiles.entries, coverAssets()); } catch (e) { c = null; }
    const url = c && c.path ? projectAssetUrls[c.path] : null;
    if (!url) { showNotice('This book has no cover image to save.', true); return; }
    const img = new Image();
    try { img.src = url; await img.decode(); } catch (e) { showNotice(c.path + ' could not be drawn.', true); return; }
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    const blob = await new Promise((done) => canvas.toBlob(done, 'image/jpeg', 0.92));
    if (!blob) { showNotice('The cover could not be saved as JPEG.', true); return; }
    const model = Book.read(projectFiles.entries).model;
    const name = BookExport.fileName(model && model.metadata.title).replace(/\.epub$/, '') + '-cover.jpg';
    let where = name;
    if (hasTauri()) {
        try { where = await tauriInvoke('save_cover_file', { name: name, data: await blobToBase64(blob) }); } catch (e) { showNotice(String(e), true); return; }
        if (!where) return;
    } else downloadFile(name, blob, 'image/jpeg');
    showNotice('Saved the cover as ' + where + ' (' + canvas.width + ' × ' + canvas.height + ', ' + Math.max(1, Math.round(blob.size / 1024)) + ' KB), for a store\'s cover upload. The book still uses ' + c.path.split('/').pop() + '.');
}
document.getElementById('coverJpegBtn').addEventListener('click', saveCoverJpeg);

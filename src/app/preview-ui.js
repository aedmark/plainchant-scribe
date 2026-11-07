// The Send to reader dialog (P5-07, D-043, D-009), built on the network preview (P7-12, D-029). In the desktop app,
// Start sharing serves the open project read-only on the local network. For a book it serves what BookPage.share
// picks: a page with the cover, a Download .epub link, and the chapters, plus exactly the files Export packs, and
// the packed .epub itself, packed again a moment after each edit. A QR code carries the link to a phone or tablet.
const previewModal = document.getElementById('preview-modal');
const previewBtn = document.getElementById('previewBtn');
const previewToggleBtn = document.getElementById('previewToggleBtn');
const previewOpenBtn = document.getElementById('previewOpenBtn');
const previewUrlsBox = document.getElementById('previewUrls');
const previewQrBox = document.getElementById('previewQr');

let previewInfo = null;
let previewAssetSig = '';
let previewTimer = null;
let previewTabUrl = '';
// While sharing a book: the zip date it is packed with, and the last .epub bytes sent.
let previewWhen = null;
let previewBookBytes = null;
let previewPushing = false;
let previewPushAgain = false;

// What to serve: { files, entry, assetPaths, book }, book being { path, bytes } or null.
async function previewPayload() {
    ensureEntries();
    syncBufferFromEditor();
    const entries = projectFiles.entries;
    const assetPaths = Object.keys(projectAssets || {});
    if (!isBookProject()) return { files: Object.assign({}, entries), entry: Preview.entryFor(activeHtmlFile, entries), assetPaths: assetPaths, book: null };
    const packed = await packOpenBook(previewWhen || new Date());
    const share = BookPage.share(entries, assetPaths, { bytes: packed.bytes.length });
    const files = {};
    share.files.forEach((p) => { if (typeof entries[p] === 'string') files[p] = entries[p]; });
    files[share.page] = share.html;
    return { files: files, entry: share.page, assetPaths: share.files.filter((p) => !(p in files) && projectAssets[p]), book: { path: share.download, bytes: packed.bytes } };
}

function previewAssets(paths) {
    const out = {};
    paths.forEach((p) => { out[p] = projectAssets[p]; });
    return out;
}

async function encodePreviewAssets(paths) {
    const out = {};
    for (const p of paths) out[p] = await blobToBase64(projectAssets[p]);
    return out;
}

// The .epub to send: its bytes only when they changed since the last push (the server keeps the last ones).
async function previewBookShare(book, always) {
    if (!book) { previewBookBytes = null; return null; }
    const same = !always && Preview.sameBytes(book.bytes, previewBookBytes);
    previewBookBytes = book.bytes;
    return { path: book.path, data: same ? null : await blobToBase64(new Blob([book.bytes])) };
}

function previewUrlRow(label, url) {
    const row = document.createElement('div');
    row.className = 'preview-url';
    const name = document.createElement('label');
    name.textContent = label;
    const input = document.createElement('input');
    input.type = 'text';
    input.readOnly = true;
    input.value = url;
    input.setAttribute('aria-label', label);
    input.addEventListener('focus', () => input.select());
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'chip';
    copy.textContent = 'Copy';
    copy.addEventListener('click', () => copyText(url, 'preview link'));
    row.append(name, input, copy);
    return row;
}

function renderPreviewQr(url) {
    previewQrBox.textContent = '';
    previewQrBox.hidden = !url;
    if (!url) return;
    let svg;
    try { svg = Qr.svg(Qr.encode(url), 'QR code for ' + url); } catch (e) { previewQrBox.hidden = true; return; }
    const img = document.createElement('img');
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    img.alt = 'QR code for ' + url;
    const note = document.createElement('p');
    note.textContent = 'Point a phone or tablet camera here to open the link. On an e-reader, type the link into its browser.';
    previewQrBox.append(img, note);
}

function renderPreviewPanel() {
    const sharing = Boolean(previewInfo);
    const book = isBookProject();
    document.getElementById('preview-title').textContent = book ? 'Send to a Reader' : 'Preview in a Browser or on a Phone';
    document.getElementById('previewNetTitle').textContent = book ? 'Send to a phone, tablet, or e-reader on this network' : 'Live preview on this network';
    document.getElementById('previewBookNote').hidden = !book;
    document.getElementById('previewKindleNote').hidden = !book;
    document.getElementById('previewNetNote').hidden = book;
    previewToggleBtn.textContent = sharing ? 'Stop sharing' : 'Start sharing';
    previewToggleBtn.classList.toggle('primary', !sharing);
    previewOpenBtn.hidden = !sharing;
    previewUrlsBox.hidden = !sharing;
    previewBtn.classList.toggle('sharing', sharing);
    document.getElementById('fileMenuBtn').classList.toggle('sharing', sharing);
    previewBtn.title = sharing ? 'Sharing on your network - open to stop' : 'Send the book to a phone, tablet, or e-reader on your network, or preview a page in a real browser';
    previewUrlsBox.textContent = '';
    if (!sharing) { renderPreviewQr(''); return; }
    const urls = Preview.urls(previewInfo);
    renderPreviewQr(urls.lan[0] || '');
    urls.lan.forEach((url) => previewUrlsBox.appendChild(previewUrlRow('Phone or other device', url)));
    if (!urls.lan.length) {
        const none = document.createElement('p');
        none.textContent = 'No network address was found. This computer may be offline; the link below works on this computer only.';
        previewUrlsBox.appendChild(none);
    }
    previewUrlsBox.appendChild(previewUrlRow('This computer', urls.local));
}

async function startPreview() {
    previewWhen = new Date();
    const p = await previewPayload();
    const assets = await encodePreviewAssets(p.assetPaths);
    const book = await previewBookShare(p.book, true);
    previewInfo = await tauriInvoke('preview_start', { files: p.files, assets: assets, entry: p.entry, book: book });
    previewAssetSig = Preview.assetSignature(previewAssets(p.assetPaths));
}

async function stopPreview() {
    clearTimeout(previewTimer);
    previewInfo = null;
    previewBookBytes = null;
    await tauriInvoke('preview_stop', {});
}

async function pushPreview() {
    if (!previewInfo) return;
    // Packing a book takes a moment; an edit during a push runs one more push after it.
    if (previewPushing) { previewPushAgain = true; return; }
    previewPushing = true;
    try {
        const p = await previewPayload();
        const sig = Preview.assetSignature(previewAssets(p.assetPaths));
        const assets = sig === previewAssetSig ? null : await encodePreviewAssets(p.assetPaths);
        const book = await previewBookShare(p.book, false);
        previewAssetSig = sig;
        if (previewInfo) await tauriInvoke('preview_update', { files: p.files, assets: assets, entry: p.entry, book: book });
    } catch (err) {
        showNotice('Could not update what is shared on the network: ' + (err && err.message || err), true);
    } finally {
        previewPushing = false;
        if (previewPushAgain) { previewPushAgain = false; schedulePreviewPush(); }
    }
}

function schedulePreviewPush() {
    if (!previewInfo) return;
    clearTimeout(previewTimer);
    previewTimer = setTimeout(pushPreview, isBookProject() ? 1200 : 400);
}

function openPreviewTab() {
    ensureEntries();
    syncBufferFromEditor();
    const entry = Preview.entryFor(activeHtmlFile, projectFiles.entries);
    if (!entry) { showNotice('Add an HTML page to preview.', true); return; }
    const doc = Project.assemblePreview(projectFiles, { activeHtml: entry, assetUrls: projectAssetUrls, baseUrl: projectBaseUrl });
    if (previewTabUrl) URL.revokeObjectURL(previewTabUrl);
    previewTabUrl = URL.createObjectURL(new Blob([doc], { type: 'text/html' }));
    if (!window.open(previewTabUrl, '_blank')) showNotice('The browser blocked the new tab. Allow pop-ups for this page and try again.', true);
}

document.getElementById('previewTabSection').hidden = hasTauri();
document.getElementById('previewNetSection').hidden = !hasTauri();
document.getElementById('previewDesktopOnly').hidden = hasTauri();
previewBtn.addEventListener('click', () => { renderPreviewPanel(); openModal(previewModal); });
document.getElementById('previewTabBtn').addEventListener('click', openPreviewTab);
previewOpenBtn.addEventListener('click', () => {
    tauriInvoke('preview_open', {}).catch((err) => showNotice(String(err && err.message || err), true));
});
previewToggleBtn.addEventListener('click', () => {
    previewToggleBtn.disabled = true;
    (previewInfo ? stopPreview() : startPreview())
        .catch((err) => { previewInfo = null; showNotice('Sharing failed: ' + (err && err.message || err), true); })
        .finally(() => { previewToggleBtn.disabled = false; renderPreviewPanel(); });
});

const previewModal = document.getElementById('preview-modal');
const previewBtn = document.getElementById('previewBtn');
const previewToggleBtn = document.getElementById('previewToggleBtn');
const previewOpenBtn = document.getElementById('previewOpenBtn');
const previewUrlsBox = document.getElementById('previewUrls');

let previewInfo = null;
let previewAssetSig = '';
let previewTimer = null;
let previewTabUrl = '';

function previewPayload() {
    ensureEntries();
    syncBufferFromEditor();
    return { files: Object.assign({}, projectFiles.entries), entry: Preview.entryFor(activeHtmlFile, projectFiles.entries) };
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

function renderPreviewPanel() {
    const sharing = Boolean(previewInfo);
    previewToggleBtn.textContent = sharing ? 'Stop sharing' : 'Start sharing';
    previewToggleBtn.classList.toggle('primary', !sharing);
    previewOpenBtn.hidden = !sharing;
    previewUrlsBox.hidden = !sharing;
    previewBtn.classList.toggle('sharing', sharing);
    document.getElementById('fileMenuBtn').classList.toggle('sharing', sharing);
    previewBtn.title = sharing ? 'Previewing on your network - open to stop' : 'Preview the project in a real browser or on a phone';
    previewUrlsBox.textContent = '';
    if (!sharing) return;
    const urls = Preview.urls(previewInfo);
    urls.lan.forEach((url) => previewUrlsBox.appendChild(previewUrlRow('Phone or other device', url)));
    if (!urls.lan.length) {
        const none = document.createElement('p');
        none.textContent = 'No network address was found. This computer may be offline; the link below works on this computer only.';
        previewUrlsBox.appendChild(none);
    }
    previewUrlsBox.appendChild(previewUrlRow('This computer', urls.local));
}

async function startPreview() {
    const payload = previewPayload();
    const assets = await encodeProjectAssets();
    previewInfo = await tauriInvoke('preview_start', { files: payload.files, assets: assets, entry: payload.entry });
    previewAssetSig = Preview.assetSignature(projectAssets);
}

async function stopPreview() {
    clearTimeout(previewTimer);
    previewInfo = null;
    await tauriInvoke('preview_stop', {});
}

async function pushPreview() {
    if (!previewInfo) return;
    try {
        const payload = previewPayload();
        const sig = Preview.assetSignature(projectAssets);
        const assets = sig === previewAssetSig ? null : await encodeProjectAssets();
        previewAssetSig = sig;
        await tauriInvoke('preview_update', { files: payload.files, assets: assets, entry: payload.entry });
    } catch (err) {
        showNotice('Could not update the network preview: ' + (err && err.message || err), true);
    }
}

function schedulePreviewPush() {
    if (!previewInfo) return;
    clearTimeout(previewTimer);
    previewTimer = setTimeout(pushPreview, 400);
}

function openPreviewTab() {
    const payload = previewPayload();
    if (!payload.entry) { showNotice('Add an HTML page to preview.', true); return; }
    const doc = Project.assemblePreview(projectFiles, { activeHtml: payload.entry, assetUrls: projectAssetUrls, baseUrl: projectBaseUrl, liveJs: true });
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
        .catch((err) => showNotice('Preview failed: ' + (err && err.message || err), true))
        .finally(() => { previewToggleBtn.disabled = false; renderPreviewPanel(); });
});

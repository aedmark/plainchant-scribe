const versionsModal = document.getElementById('versions-modal');
const versionsList = document.getElementById('versions-list');
const versionsFor = document.getElementById('versionsFor');
const versionForm = document.getElementById('versionForm');
const versionName = document.getElementById('versionName');
const versionsStatus = document.getElementById('versions-status');

let versionScriptId = null;

async function openVersionsFor(scriptId) {
    versionScriptId = scriptId;
    const script = getScripts()[scriptId];
    versionsFor.textContent = script ? 'Snapshots for ' + (script.title || 'Untitled Page') : '';
    versionName.value = '';
    await renderVersions();
    openModal(versionsModal, { focus: '#versionName' });
}

async function renderVersions() {
    if (!scriptDb || !versionScriptId) {
        versionsList.innerHTML = '<p class="empty-msg">Snapshots require IndexedDB storage.</p>';
        return;
    }
    const list = await Store.loadVersions(scriptDb, versionScriptId);
    versionsList.textContent = '';
    if (!list.length) {
        const empty = document.createElement('p');
        empty.className = 'empty-msg';
        empty.textContent = 'No snapshots saved yet. Keep one above or Plainchant Scribe will save them periodically as you work.';
        versionsList.appendChild(empty);
        return;
    }
    const now = Date.now();
    list.forEach((v) => {
        const row = document.createElement('div');
        row.className = 'script-item';
        const info = document.createElement('div');
        info.className = 'script-info';
        const strong = document.createElement('strong');
        strong.textContent = v.name || Library.relativeTime(v.takenAt, now);
        const span = document.createElement('span');
        span.style.display = 'block';
        span.style.fontSize = '0.75rem';
        span.style.color = 'var(--text-void-muted)';
        span.textContent = (v.name ? Library.relativeTime(v.takenAt, now) + ' · ' : '') + (v.title || 'Untitled Page');
        info.append(strong, span);

        const actions = document.createElement('div');
        actions.className = 'script-actions';

        const restoreBtn = document.createElement('button');
        restoreBtn.type = 'button';
        restoreBtn.className = 'mini';
        restoreBtn.textContent = 'Restore';
        restoreBtn.addEventListener('click', () => {
            currentScriptId = versionScriptId;
            loadProjectIntoEditor(v.content);
            saveScript(false);
            render(false);
            closeModal(versionsModal);
            closeModal(libraryModal);
            showNotice('Restored snapshot.');
        });

        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'mini danger-mini';
        delBtn.textContent = 'Delete';
        delBtn.addEventListener('click', async () => {
            await Store.removeVersion(scriptDb, v.id);
            renderVersions();
        });

        actions.append(restoreBtn, delBtn);
        row.append(info, actions);
        versionsList.appendChild(row);
    });
}

versionForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!scriptDb || !versionScriptId) return;
    const script = getScripts()[versionScriptId];
    if (!script) return;
    const now = Date.now();
    const v = Versions.make(script, newId(), now, { name: versionName.value.trim() || 'Manual snapshot' });
    await Store.addVersion(scriptDb, v, Versions, now);
    versionName.value = '';
    versionsStatus.textContent = 'Snapshot saved.';
    renderVersions();
});

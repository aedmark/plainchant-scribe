const libraryModal = document.getElementById('library-modal');
const libraryList = document.getElementById('library-list');
const librarySearch = document.getElementById('librarySearch');
const libraryStatus = document.getElementById('library-status');
const libViewScripts = document.getElementById('libViewScripts');
const libViewTrash = document.getElementById('libViewTrash');
const libStarterBtn = document.getElementById('libStarterBtn');

let libraryView = 'active';
let renamingId = null;

function setLibraryView(view) {
    libraryView = view;
    renamingId = null;
    libViewScripts.setAttribute('aria-pressed', String(view === 'active'));
    libViewTrash.setAttribute('aria-pressed', String(view === 'trash'));
    renderLibrary();
}

function renderLibrary() {
    purgeTrash();
    const scripts = getScripts();
    const base = libraryView === 'trash' ? Library.trashed(scripts) : Library.active(scripts);
    const list = Library.search(base, librarySearch.value);
    const now = Date.now();

    libraryList.textContent = '';
    if (!list.length) {
        const empty = document.createElement('p');
        empty.className = 'empty-msg';
        empty.textContent = librarySearch.value.trim()
            ? 'No matching projects found.'
            : (libraryView === 'trash' ? 'Recently deleted is empty.' : 'No saved projects yet.');
        libraryList.appendChild(empty);
        return;
    }

    list.forEach((script) => {
        const row = document.createElement('div');
        row.className = 'script-item' + (script.id === currentScriptId ? ' current' : '');

        const info = document.createElement('div');
        info.className = 'script-info';

        if (renamingId === script.id) {
            const form = document.createElement('form');
            form.className = 'rename-form';
            const input = document.createElement('input');
            input.type = 'text';
            input.value = script.title || 'Untitled Page';
            input.maxLength = 80;
            const save = document.createElement('button');
            save.type = 'submit';
            save.className = 'mini';
            save.textContent = 'Save';
            const cancel = document.createElement('button');
            cancel.type = 'button';
            cancel.className = 'mini';
            cancel.textContent = 'Cancel';
            cancel.addEventListener('click', () => { renamingId = null; renderLibrary(); });
            form.append(input, save, cancel);
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                const res = Library.rename(getScripts(), script.id, input.value, Date.now());
                renamingId = null;
                if (res) {
                    putScripts(res.scripts);
                    if (script.id === currentScriptId) {
                        loadProjectIntoEditor(res.content);
                        render(false);
                    }
                }
                renderLibrary();
            });
            info.appendChild(form);
        } else {
            const titleBtn = document.createElement('button');
            titleBtn.type = 'button';
            titleBtn.className = 'script-open';
            const st = Project.stats(script.content);
            const meta = libraryView === 'trash'
                ? 'Deleted · ' + Library.daysLeft(script, now) + 'd left'
                : Library.relativeTime(script.updatedAt, now) + ' · ' + st.elements + ' el · ' + st.rules + ' rules';
            titleBtn.innerHTML = '<strong></strong><span></span>';
            titleBtn.querySelector('strong').textContent = script.title || 'Untitled Page';
            titleBtn.querySelector('span').textContent = meta;
            titleBtn.addEventListener('click', () => {
                if (libraryView === 'trash') return;
                flushSave();
                currentScriptId = script.id;
                selectedPcId = null;
                if (typeof clearLinkedFolder === 'function') clearLinkedFolder();
                loadProjectIntoEditor(script.content);
                rememberCurrent();
                render(false);
                closeModal(libraryModal);
            });
            info.appendChild(titleBtn);
        }

        const actions = document.createElement('div');
        actions.className = 'script-actions';

        if (libraryView === 'trash') {
            const restoreBtn = document.createElement('button');
            restoreBtn.type = 'button';
            restoreBtn.className = 'mini';
            restoreBtn.textContent = 'Restore';
            restoreBtn.addEventListener('click', () => {
                putScripts(Library.restore(getScripts(), script.id));
                libraryStatus.textContent = 'Restored ' + script.title;
                renderLibrary();
            });
            const purgeBtn = document.createElement('button');
            purgeBtn.type = 'button';
            purgeBtn.className = 'mini danger-mini';
            purgeBtn.textContent = 'Delete forever';
            purgeBtn.addEventListener('click', () => {
                putScripts(Library.removeForever(getScripts(), script.id));
                renderLibrary();
            });
            actions.append(restoreBtn, purgeBtn);
        } else {
            const renBtn = document.createElement('button');
            renBtn.type = 'button';
            renBtn.className = 'mini';
            renBtn.textContent = 'Rename';
            renBtn.addEventListener('click', () => { renamingId = script.id; renderLibrary(); });

            const verBtn = document.createElement('button');
            verBtn.type = 'button';
            verBtn.className = 'mini';
            verBtn.textContent = 'Snapshots';
            verBtn.addEventListener('click', () => openVersionsFor(script.id));

            const dupBtn = document.createElement('button');
            dupBtn.type = 'button';
            dupBtn.className = 'mini';
            dupBtn.textContent = 'Duplicate';
            dupBtn.addEventListener('click', () => {
                const res = Library.duplicate(getScripts(), script.id, newId(), Date.now());
                if (res) {
                    putScripts(res.scripts);
                    if (storageMode === 'idb') Store.copyAssets(scriptDb, script.id, res.id).catch(() => {});
                    renderLibrary();
                }
            });

            const delBtn = document.createElement('button');
            delBtn.type = 'button';
            delBtn.className = 'mini danger-mini';
            delBtn.textContent = 'Delete';
            delBtn.addEventListener('click', () => {
                putScripts(Library.softDelete(getScripts(), script.id, Date.now()));
                renderLibrary();
            });
            actions.append(renBtn, verBtn, dupBtn, delBtn);
        }

        row.append(info, actions);
        libraryList.appendChild(row);
    });
}

function openLibrary() {
    flushSave();
    librarySearch.value = '';
    setLibraryView('active');
    openModal(libraryModal, { focus: '#librarySearch' });
}

document.getElementById('libraryBtn').addEventListener('click', openLibrary);
librarySearch.addEventListener('input', renderLibrary);
libViewScripts.addEventListener('click', () => setLibraryView('active'));
libViewTrash.addEventListener('click', () => setLibraryView('trash'));
libStarterBtn.addEventListener('click', () => {
    loadStarterProject();
    closeModal(libraryModal);
});

// P3-07 (D-046): front and back matter. Scribe's pages and the author's library, added as chapters in one undo step.
// The library is a list of saved pages in this Studio's local storage; BookMatter checks it again on every read.

const MATTER_KEY = 'plainchant_scribe_matter';
const matterModal = document.getElementById('matter-modal');

function matterLibrary() {
    try { return BookMatter.readLibrary(localStorage.getItem(MATTER_KEY)); } catch (e) { return []; }
}

function storeMatterLibrary(list) {
    try { localStorage.setItem(MATTER_KEY, JSON.stringify(list)); return true; } catch (e) {
        showNotice('The library could not be saved: the browser\'s storage is full or blocked.', true);
        return false;
    }
}

function addMatter(source) {
    syncBufferFromEditor();
    let r;
    try { r = BookMatter.add(projectFiles.entries, source, new Date()); } catch (e) { showNotice(e.message, true); return; }
    closeModal(matterModal);
    const labels = { title: 'title', creators: 'author', publisher: 'publisher', isbn: 'ISBN', year: 'year', rights: 'rights' };
    const gap = r.missing.length ? ' The Book tab has no ' + r.missing.map((m) => labels[m]).join(', ') + ', so ' + (r.missing.length === 1 ? 'that field is' : 'those fields are') + ' empty.' : '';
    commitChapters({ entries: r.entries, path: r.path, removed: [] }, 'Added ' + r.path.split('/').pop() + '.' + gap);
}

function matterRow(label, note, actions) {
    const li = document.createElement('li');
    const text = document.createElement('span');
    text.textContent = label;
    const small = document.createElement('span');
    small.className = 'matter-note';
    small.textContent = note;
    li.append(text, small);
    actions.forEach((a) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mini';
        btn.textContent = a.text;
        btn.disabled = !!a.disabled;
        if (a.title) btn.title = a.title;
        btn.addEventListener('click', a.run);
        li.appendChild(btn);
    });
    return li;
}

function renderMatter() {
    const model = Book.read(projectFiles.entries).model;
    const present = model ? BookMatter.present(projectFiles.entries, model) : {};
    const builtIn = document.getElementById('matterBuiltIn');
    builtIn.textContent = '';
    BookMatter.KINDS.forEach((k) => {
        const there = present[k.key];
        builtIn.appendChild(matterRow(k.label, (k.place === 'front' ? 'Front' : 'Back') + (there ? ' · in the book: ' + there.split('/').pop() : ''),
            [{ text: 'Add', disabled: !model || !!there, run: () => addMatter({ kind: k.key }) }]));
    });
    const list = matterLibrary();
    const lib = document.getElementById('matterLibrary');
    lib.textContent = '';
    document.getElementById('matterLibraryEmpty').hidden = list.length > 0;
    list.forEach((p) => {
        const there = p.kind && present[p.kind];
        lib.appendChild(matterRow(p.name, (p.place === 'front' ? 'Front' : 'Back') + (p.saved && !isNaN(Date.parse(p.saved)) ? ' · saved ' + new Date(p.saved).toLocaleDateString() : '') + (there ? ' · this book has one' : ''), [
            { text: 'Add', disabled: !model || !!there, run: () => addMatter(p) },
            { text: 'Remove', title: 'Remove it from your library; books that have it keep their copy', run: async () => {
                // The question dialogs come earlier in the page than this one, so this one closes while they are open.
                closeModal(matterModal);
                if (await askConfirm({ title: 'Remove from your library?', text: '"' + p.name + '" leaves your library. Books that already have the page keep it.', confirm: 'Remove' })) storeMatterLibrary(matterLibrary().filter((x) => x.name !== p.name));
                renderMatter();
                openModal(matterModal);
            } }
        ]));
    });
}

document.getElementById('matterBtn').addEventListener('click', () => {
    syncBufferFromEditor();
    renderMatter();
    openModal(matterModal);
});

document.getElementById('matterSaveBtn').addEventListener('click', async () => {
    syncBufferFromEditor();
    const path = activeHtmlFile;
    if (!/\.xhtml?$/i.test(path || '') || typeof projectFiles.entries[path] !== 'string') { showNotice('Open the chapter to save on the Stage first.', true); return; }
    closeModal(matterModal);
    const name = await askText({ title: 'Save to my library', hint: 'A name for the page in your library. A page with the same name is replaced.', value: BookChapters.titleOf(projectFiles.entries[path], path), confirm: 'Save' });
    if (!name) { openModal(matterModal); return; }
    let page;
    try { page = BookMatter.save(projectFiles.entries[path], name); } catch (e) { showNotice(e.message, true); openModal(matterModal); return; }
    let list;
    try { list = BookMatter.putLibrary(matterLibrary(), page, new Date().toISOString()); } catch (e) { showNotice(e.message, true); openModal(matterModal); return; }
    if (storeMatterLibrary(list)) showNotice('Saved "' + page.name + '" to your library.');
    renderMatter();
    openModal(matterModal);
});

// The Book panel (P3-01, D-025): an Inspector tab for a book's title, creators, language, publisher, date,
// description, rights, ISBN, identifier, and modified date. Each change is a BookMeta list of OpfEdit splices applied
// to content.opf as one undo step; nothing else in the file changes (D-002).

const inspBookPane = document.getElementById('inspBookPane');
const bookTabBtn = document.getElementById('bookTabBtn');
const bookForm = document.getElementById('bookForm');
const bookUnreadable = document.getElementById('bookUnreadable');
const bookCreators = document.getElementById('bookCreators');

function bookRead() {
    return Book.read(projectFiles.entries, { assets: Object.keys(projectAssets || {}) });
}

function syncBookTab() {
    const book = isBookProject();
    bookTabBtn.hidden = !book;
    if (!book && activeInspectorTab === 'book') switchInspectorTab('props');
}

// Writes a file's new text as one undo step, as applyCssTransform does for the stylesheet.
function applyFileText(path, text) {
    syncBufferFromEditor();
    if (projectFiles.entries[path] === text) return;
    if (typeof pushUndoState === 'function') pushUndoState();
    projectFiles.entries[path] = text;
    syncMirrors();
    if (activeFile === path) {
        const edit = Editing.diffEdit(editor.value, text, editor.selectionStart, editor.selectionEnd);
        applyEdit(edit, { keepFocus: true, skipHistory: true });
    } else {
        render(false);
        scheduleAutoSave();
    }
    if (typeof syncLatestHistoryState === 'function') syncLatestHistoryState();
}

// Applies BookMeta ops one after another to fresh reads of the OPF, then commits once.
function applyBookOps(ops) {
    syncBufferFromEditor();
    const first = bookRead().model;
    if (!first) { showNotice('content.opf cannot be read, so the Book panel cannot change it. Fix it in the code editor.', true); return false; }
    const path = first.opfPath;
    let files = Object.assign({}, projectFiles.entries);
    try {
        ops.forEach((op) => {
            const model = Book.read(files).model;
            files = Object.assign({}, files, { [path]: XmlAst.applyEdits(files[path], op(model)) });
        });
    } catch (e) {
        showNotice('Not changed: ' + e.message, true);
        return false;
    }
    applyFileText(path, files[path]);
    refreshBookPanel(true);
    return true;
}

function showBookError(name, message) {
    const el = document.getElementById('bookErr-' + name);
    if (!el) { if (message) showNotice(message, true); return; }
    el.textContent = message || '';
    el.hidden = !message;
}

function roleOptions(select, current) {
    select.textContent = '';
    const add = (value, label) => { const o = document.createElement('option'); o.value = value; o.textContent = label; select.appendChild(o); };
    add('', 'No role');
    BookMeta.ROLES.forEach(([code, label]) => add(code, label));
    if (current && !BookMeta.ROLES.some(([code]) => code === current)) add(current, current + ' (MARC code)');
    select.value = current || '';
}

function creatorRow(c) {
    const row = document.createElement('div');
    row.className = 'book-creator';
    const field = (label, control) => {
        const wrap = document.createElement('label');
        wrap.className = 'insp-field';
        const span = document.createElement('span');
        span.textContent = label;
        wrap.append(span, control);
        return wrap;
    };
    const name = document.createElement('input');
    name.type = 'text';
    name.value = c.name;
    name.autocomplete = 'off';
    name.addEventListener('change', () => {
        const err = BookMeta.check('creator', name.value);
        if (err) { showNotice(err, true); name.value = c.name; return; }
        applyBookOps(BookMeta.setCreator(c.index, 'name', name.value));
    });
    const role = document.createElement('select');
    roleOptions(role, c.role);
    role.addEventListener('change', () => applyBookOps(BookMeta.setCreator(c.index, 'role', role.value)));
    const fileAs = document.createElement('input');
    fileAs.type = 'text';
    fileAs.value = c.fileAs;
    fileAs.placeholder = 'Sort name';
    fileAs.autocomplete = 'off';
    fileAs.addEventListener('change', () => applyBookOps(BookMeta.setCreator(c.index, 'fileAs', fileAs.value)));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'mini';
    remove.textContent = 'Remove';
    remove.setAttribute('aria-label', 'Remove ' + c.name);
    remove.addEventListener('click', () => applyBookOps(BookMeta.removeCreator(c.index)));
    row.append(field('Name', name), field('Role', role), field('Sort name', fileAs), remove);
    return row;
}

// force: redraw even while a field has focus (after the panel's own change, or when the tab opens).
function refreshBookPanel(force) {
    if (!isBookProject() || inspBookPane.hidden) return;
    if (!force && inspBookPane.contains(document.activeElement)) return;
    const r = bookRead();
    bookUnreadable.hidden = !!r.model;
    bookForm.hidden = !r.model;
    if (!r.model) {
        bookUnreadable.textContent = 'content.opf cannot be read (see the Problems tab), so the Book panel is off until it is fixed in the code editor.';
        return;
    }
    const f = BookMeta.fields(r.model);
    bookForm.querySelectorAll('[data-book-field]').forEach((input) => {
        if (input === document.activeElement && !force) return;
        input.value = f[input.dataset.bookField] || '';
        showBookError(input.dataset.bookField, '');
    });
    document.getElementById('bookIdentifier').textContent = f.identifier || '(none)';
    document.getElementById('bookModified').textContent = f.modified || '(none)';
    bookCreators.textContent = '';
    f.creators.forEach((c) => bookCreators.appendChild(creatorRow(c)));
    const newRole = document.getElementById('bookNewRole');
    if (!newRole.options.length) roleOptions(newRole, 'aut');
}

bookForm.addEventListener('submit', (e) => e.preventDefault());
bookForm.querySelectorAll('[data-book-field]').forEach((input) => {
    const commit = () => {
        const name = input.dataset.bookField;
        const current = BookMeta.fields(bookRead().model || { metadata: { dc: [], identifiers: [], creators: [] } })[name] || '';
        if (input.value.trim() === current) { showBookError(name, ''); return; }
        const err = BookMeta.check(name, input.value);
        showBookError(name, err);
        if (err) return;
        applyBookOps(name === 'isbn' ? BookMeta.setIsbn(input.value) : BookMeta.setField(name, input.value));
    };
    input.addEventListener('change', commit);
    if (input.tagName !== 'TEXTAREA') input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } });
});
document.getElementById('bookAddCreator').addEventListener('click', () => {
    const name = document.getElementById('bookNewName');
    const err = BookMeta.check('creator', name.value);
    showBookError('creator', err);
    if (err) { name.focus(); return; }
    const fileAs = document.getElementById('bookNewFileAs');
    if (applyBookOps(BookMeta.addCreator(name.value, document.getElementById('bookNewRole').value, fileAs.value))) {
        name.value = '';
        fileAs.value = '';
    }
});
document.getElementById('bookCopyId').addEventListener('click', () => {
    const id = document.getElementById('bookIdentifier').textContent;
    if (navigator.clipboard) navigator.clipboard.writeText(id).then(() => showNotice('Copied the identifier.'), () => showNotice('Could not copy.', true));
});
document.getElementById('bookTouch').addEventListener('click', () => applyBookOps(BookMeta.touchModified(Date.now())));

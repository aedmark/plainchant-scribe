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
    document.getElementById('chaptersTabBtn').hidden = !book;
    document.getElementById('layoutTabBtn').hidden = !book;
    if (!book && ['book', 'chapters', 'layout'].indexOf(activeInspectorTab) !== -1) switchInspectorTab('props');
    if (book && typeof refreshChapters === 'function') refreshChapters();
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

// One person (creator or contributor, P3-06) with name, role, sort name, and move and remove buttons.
function personRow(kind, c, count) {
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
    const input = (value, placeholder, part) => {
        const el = document.createElement('input');
        el.type = 'text';
        el.value = value;
        el.placeholder = placeholder;
        el.autocomplete = 'off';
        el.addEventListener('change', () => {
            if (part === 'name') {
                const err = BookMeta.check('creator', el.value);
                if (err) { showNotice(err, true); el.value = c.name; return; }
            }
            applyBookOps(BookMeta.setPerson(kind, c.index, part, el.value));
        });
        return el;
    };
    const role = document.createElement('select');
    roleOptions(role, c.role);
    role.addEventListener('change', () => applyBookOps(BookMeta.setPerson(kind, c.index, 'role', role.value)));
    const button = (text, label, fn, disabled) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'mini';
        b.textContent = text;
        b.title = label;
        b.setAttribute('aria-label', label + ': ' + c.name);
        b.disabled = !!disabled;
        b.addEventListener('click', fn);
        return b;
    };
    const actions = document.createElement('span');
    actions.className = 'book-creator-actions';
    actions.append(
        button('\u2191', 'Move up', () => applyBookOps(BookMeta.movePerson(kind, c.index, -1)), c.index === 0),
        button('\u2193', 'Move down', () => applyBookOps(BookMeta.movePerson(kind, c.index, 1)), c.index === count - 1),
        button('Remove', 'Remove', () => applyBookOps(BookMeta.removePerson(kind, c.index))));
    row.append(field('Name', input(c.name, '', 'name')), field('Role', role), field('Sort name', input(c.fileAs, 'Sort name', 'fileAs')), actions);
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
    f.creators.forEach((c) => bookCreators.appendChild(personRow('creator', c, f.creators.length)));
    const contributors = document.getElementById('bookContributors');
    contributors.textContent = '';
    f.contributors.forEach((c) => contributors.appendChild(personRow('contributor', c, f.contributors.length)));
    const newCRole = document.getElementById('bookNewCRole');
    if (!newCRole.options.length) roleOptions(newCRole, 'edt');
    if (typeof refreshCover === 'function') refreshCover();
    if (typeof refreshA11y === 'function') refreshA11y(r.model);
    const newRole = document.getElementById('bookNewRole');
    if (!newRole.options.length) roleOptions(newRole, 'aut');
}

bookForm.addEventListener('submit', (e) => e.preventDefault());
bookForm.querySelectorAll('[data-book-field]').forEach((input) => {
    const commit = () => {
        const name = input.dataset.bookField;
        const model = bookRead().model;
        if (!model) return;
        const current = BookMeta.fields(model)[name] || '';
        if (input.value.trim() === current) { showBookError(name, ''); return; }
        const err = BookMeta.check(name, input.value);
        showBookError(name, err);
        if (err) return;
        if (name === 'series' || name === 'seriesPosition') {
            const value = (n) => bookForm.querySelector('[data-book-field="' + n + '"]').value;
            applyBookOps(BookMeta.setSeries(value('series'), value('seriesPosition')));
            return;
        }
        applyBookOps(name === 'isbn' ? BookMeta.setIsbn(input.value) : BookMeta.setField(name, input.value));
    };
    input.addEventListener('change', commit);
    if (input.tagName !== 'TEXTAREA') input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } });
});
function addPersonFrom(kind, ids) {
    const name = document.getElementById(ids.name);
    const err = BookMeta.check('creator', name.value);
    showBookError(kind, err);
    if (err) { name.focus(); return; }
    const fileAs = document.getElementById(ids.fileAs);
    if (applyBookOps(BookMeta.addPerson(kind, name.value, document.getElementById(ids.role).value, fileAs.value))) {
        name.value = '';
        fileAs.value = '';
        document.getElementById(ids.role).value = kind === 'contributor' ? 'edt' : 'aut';
    }
}
document.getElementById('bookAddCreator').addEventListener('click', () => addPersonFrom('creator', { name: 'bookNewName', role: 'bookNewRole', fileAs: 'bookNewFileAs' }));
document.getElementById('bookAddContributor').addEventListener('click', () => addPersonFrom('contributor', { name: 'bookNewCName', role: 'bookNewCRole', fileAs: 'bookNewCFileAs' }));
document.getElementById('bookCopyId').addEventListener('click', () => {
    const id = document.getElementById('bookIdentifier').textContent;
    if (navigator.clipboard) navigator.clipboard.writeText(id).then(() => showNotice('Copied the identifier.'), () => showNotice('Could not copy.', true));
});
document.getElementById('bookTouch').addEventListener('click', () => applyBookOps(BookMeta.touchModified(Date.now())));

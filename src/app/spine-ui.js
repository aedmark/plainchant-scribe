// The chapters organiser (P3-02, D-026): an Inspector tab listing the spine's chapters, with Add, Rename, Delete, and
// moving by drag or arrows. Each action is a BookChapters change across the chapter, content.opf, and nav.xhtml,
// committed as one undo step.

const inspChaptersPane = document.getElementById('inspChaptersPane');
const chaptersList = document.getElementById('chaptersList');
const chaptersUnreadable = document.getElementById('chaptersUnreadable');
let chapterDrag = null;

// Commits a BookChapters result: new and deleted files, the tree, tabs, and the chapter to show.
function commitChapters(res, notice) {
    const removed = new Set(res.removed || []);
    let tree = projectFiles.tree;
    (res.removed || []).forEach((p) => { tree = Project.treeAfter(tree, { type: 'delete', path: p }); });
    Object.keys(res.entries).filter((p) => !(p in projectFiles.entries)).forEach((p) => { tree = Project.treeAfter(tree, { type: 'add', path: p }); });
    let tabs = openTabs.filter((p) => !removed.has(p));
    const show = res.path && !removed.has(res.path) ? res.path : null;
    const added = Object.keys(res.entries).find((p) => !(p in projectFiles.entries));
    let active = removed.has(activeFile) ? (show || tabs[0]) : activeFile;
    if (added) active = added;
    if (active && !tabs.includes(active)) tabs = tabs.concat(active);
    const page = removed.has(activeHtmlFile) || added ? (added || show || bookChapterFor(res.entries, null)) : activeHtmlFile;
    commitFileChange(res.entries, { tree: tree, openTabs: tabs, activeFile: active, activeHtmlFile: page });
    refreshChapters();
    if (notice) showNotice(notice);
}

function chapterAction(run, notice) {
    syncBufferFromEditor();
    try {
        commitChapters(run(projectFiles.entries), notice);
    } catch (e) {
        showNotice(e.message, true);
    }
}

function chapterRow(c, i, count) {
    const li = document.createElement('li');
    li.className = 'chapter-row';
    li.draggable = true;
    li.dataset.path = c.path;
    if (c.path === activeHtmlFile) li.setAttribute('aria-current', 'true');
    const grip = document.createElement('span');
    grip.className = 'chapter-grip';
    grip.textContent = '⠇';
    grip.setAttribute('aria-hidden', 'true');
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'chapter-open';
    open.textContent = c.title;
    const file = document.createElement('small');
    file.textContent = c.path.split('/').pop() + (c.linear ? '' : ' · not in the main reading order');
    open.appendChild(file);
    open.addEventListener('click', () => openFileInEditor(c.path));
    const mini = (text, label, fn, disabled) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'mini';
        b.textContent = text;
        b.setAttribute('aria-label', label + ': ' + c.title);
        b.title = label;
        b.disabled = !!disabled;
        b.addEventListener('click', fn);
        return b;
    };
    li.append(grip, open,
        mini('↑', 'Move up', () => chapterAction((e) => BookChapters.move(e, c.path, i - 1), 'Moved ' + c.title + ' up.'), i === 0),
        mini('↓', 'Move down', () => chapterAction((e) => BookChapters.move(e, c.path, i + 1), 'Moved ' + c.title + ' down.'), i === count - 1),
        mini('Rename', 'Rename', () => renameChapter(c)),
        mini('Delete', 'Delete', () => deleteChapter(c)));
    li.addEventListener('dragstart', (e) => { chapterDrag = { path: c.path, from: i }; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', c.path); });
    li.addEventListener('dragover', (e) => {
        if (!chapterDrag || chapterDrag.path === c.path) return;
        e.preventDefault();
        const r = li.getBoundingClientRect();
        const after = e.clientY > r.top + r.height / 2;
        li.classList.toggle('drop-after', after);
        li.classList.toggle('drop-before', !after);
    });
    li.addEventListener('dragleave', () => li.classList.remove('drop-before', 'drop-after'));
    li.addEventListener('drop', (e) => {
        e.preventDefault();
        const after = li.classList.contains('drop-after');
        li.classList.remove('drop-before', 'drop-after');
        if (!chapterDrag || chapterDrag.path === c.path) return;
        const from = chapterDrag.from;
        let to = after ? i + 1 : i;
        if (from < to) to -= 1;
        const path = chapterDrag.path;
        chapterDrag = null;
        chapterAction((entries) => BookChapters.move(entries, path, to), 'Moved the chapter.');
    });
    li.addEventListener('dragend', () => { chapterDrag = null; });
    return li;
}

function refreshChapters() {
    if (!isBookProject() || inspChaptersPane.hidden) return;
    let chapters;
    try { chapters = BookChapters.list(projectFiles.entries); } catch (e) { chapters = null; }
    chaptersUnreadable.hidden = !!chapters;
    chaptersList.hidden = !chapters;
    if (!chapters) { chaptersUnreadable.textContent = 'content.opf cannot be read, so the chapters cannot be listed. Fix it in the code editor.'; return; }
    chaptersList.textContent = '';
    chapters.forEach((c, i) => chaptersList.appendChild(chapterRow(c, i, chapters.length)));
}

async function addChapter() {
    const title = await askText({ title: 'Add chapter', hint: 'Title of the new chapter. It goes after the chapter on the Stage.', value: '', confirm: 'Add', validate: (t) => (t ? '' : 'Enter a title.') });
    if (!title) return;
    chapterAction((entries) => BookChapters.add(entries, title, activeHtmlFile), 'Added ' + title + '.');
}

async function renameChapter(c) {
    const title = await askText({ title: 'Rename chapter', hint: 'Sets the chapter’s title, its first heading, and its entry in the contents. The file name stays.', value: c.title, confirm: 'Rename', validate: (t) => (t ? '' : 'Enter a title.') });
    if (!title || title === c.title) return;
    chapterAction((entries) => BookChapters.rename(entries, c.path, title), 'Renamed to ' + title + '.');
}

async function deleteChapter(c) {
    const links = BookChapters.incomingLinks(projectFiles.entries, c.path);
    const from = new Set(links.map((l) => l.from)).size;
    const text = 'This deletes ' + c.path.split('/').pop() + ', its place in the reading order, and its entries in the contents. ' +
        (links.length ? links.length + (links.length === 1 ? ' link' : ' links') + ' from ' + from + (from === 1 ? ' other chapter' : ' other chapters') + ' will point nowhere and show in Problems. ' : '') +
        'Undo brings it back.';
    if (!await askConfirm({ title: 'Delete “' + c.title + '”?', text: text, confirm: 'Delete chapter' })) return;
    chapterAction((entries) => BookChapters.remove(entries, c.path), 'Deleted ' + c.title + '.');
}

document.getElementById('chapterAddBtn').addEventListener('click', addChapter);

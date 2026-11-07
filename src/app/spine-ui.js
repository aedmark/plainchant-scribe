// The chapters organiser (P3-02, D-026): an Inspector tab listing the spine's chapters, with Add, Rename, Delete, and
// moving by drag or arrows. Each action is a BookChapters change across the chapter, content.opf, and nav.xhtml,
// committed as one undo step.

const inspChaptersPane = document.getElementById('inspChaptersPane');
const chaptersList = document.getElementById('chaptersList');
const chaptersUnreadable = document.getElementById('chaptersUnreadable');
const navInReadingBox = document.getElementById('navInReadingBox');
const ncxBox = document.getElementById('ncxBox');
const ncxRegenBtn = document.getElementById('ncxRegenBtn');
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
    // New binary files (images from a .docx, P7-03) join the assets in the same undo step.
    const binaries = res.binaries || {};
    Object.keys(binaries).forEach((p) => { if (!(p in res.entries)) tree = Project.treeAfter(tree, { type: 'add', path: p }); });
    const apply = Object.keys(binaries).length ? () => Object.keys(binaries).forEach((p) => addProjectAsset(p, new Blob([binaries[p]], { type: Project.mimeFor(p) }))) : undefined;
    commitFileChange(res.entries, { tree: tree, openTabs: tabs, activeFile: active, activeHtmlFile: page, apply: apply });
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

function chapterRow(c, i, count, next) {
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
    file.textContent = c.path.split('/').pop() + (c.nav ? ' · the contents page' : '') + (c.linear ? '' : ' · not in the main reading order');
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
        mini('Rename', 'Rename', () => renameChapter(c), c.nav),
        mini('Merge', 'Merge with the next chapter', () => mergeChapter(c, i), i === count - 1 || c.nav || (next && next.nav)),
        mini('Delete', 'Delete', () => deleteChapter(c), c.nav));
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
    chapters.forEach((c, i) => chaptersList.appendChild(chapterRow(c, i, chapters.length, chapters[i + 1])));
    navInReadingBox.checked = BookChapters.navInReading(projectFiles.entries);
    const ncx = BookNcx.state(projectFiles.entries, Object.keys(projectAssets || {}));
    ncxBox.checked = ncx.on;
    ncxRegenBtn.hidden = !ncx.on || ncx.owned;
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

// Split at the heading selected on the Stage or in the code (P3-03, D-027).
function splitAtHeading() {
    const node = selectedPcId ? HtmlAst.findById(currentHtmlAst, selectedPcId) : null;
    if (!node || !/^h[1-6]$/.test(node.tag) || !/\.xhtml?$/i.test(activeHtmlFile)) {
        showNotice('Select a heading in the chapter on the Stage first, then split there.', true);
        return;
    }
    const path = activeHtmlFile;
    chapterAction((entries) => BookChapters.split(entries, path, node.start), 'Split the chapter: the new chapter starts at that heading.');
}

async function mergeChapter(c, i) {
    let chapters;
    try { chapters = BookChapters.list(projectFiles.entries); } catch (e) { showNotice(e.message, true); return; }
    const next = chapters[i + 1];
    if (!next) return;
    const text = 'The text of \u201c' + next.title + '\u201d is added to the end of \u201c' + c.title + '\u201d, links to it are pointed into the merged chapter, and ' + next.path.split('/').pop() + ' is deleted. Undo brings it back.';
    if (!await askConfirm({ title: 'Merge \u201c' + next.title + '\u201d into \u201c' + c.title + '\u201d?', text: text, confirm: 'Merge' })) return;
    syncBufferFromEditor();
    let res;
    try { res = BookChapters.merge(projectFiles.entries, c.path); } catch (e) { showNotice(e.message, true); return; }
    const notes = [];
    if (res.renamedIds.length) notes.push('renamed ' + res.renamedIds.length + (res.renamedIds.length === 1 ? ' id' : ' ids') + ' that clashed (' + res.renamedIds.map((p) => p[0] + ' \u2192 ' + p[1]).join(', ') + ')');
    if (res.lostStylesheets.length) notes.push('the merged text no longer links ' + res.lostStylesheets.join(', '));
    commitChapters(res, 'Merged the chapters' + (notes.length ? '; ' + notes.join('; ') : '') + '.');
}

document.getElementById('chapterAddBtn').addEventListener('click', addChapter);
document.getElementById('chapterSplitBtn').addEventListener('click', splitAtHeading);

// Import text (P5-03, D-039; .docx P7-03, D-048): Markdown, plain-text, and Word files become chapters after the one
// on the Stage, as one undo step. Markdown footnotes follow the book's notes setting; Word keeps footnotes and
// endnotes apart. Markdown images are found by name among the book's images; a .docx brings its own.
const chapterImportInput = document.getElementById('chapterImportInput');
document.getElementById('chapterImportBtn').addEventListener('click', () => chapterImportInput.click());
chapterImportInput.addEventListener('change', async () => {
    const picked = Array.from(chapterImportInput.files || []);
    chapterImportInput.value = '';
    if (!picked.length) return;
    const isDocx = (f) => /\.docx$/i.test(f.name);
    const tooBig = picked.find((f) => f.size > (isDocx(f) ? 50 : 10) * 1048576);
    if (tooBig) { showNotice(tooBig.name + ' is larger than ' + (isDocx(tooBig) ? 50 : 10) + ' MB, so nothing was imported.', true); return; }
    const files = [];
    for (const f of picked) {
        const bytes = new Uint8Array(await f.arrayBuffer());
        if (!isDocx(f)) { files.push({ name: f.name, text: Importing.decode(bytes) }); continue; }
        try { files.push({ name: f.name, docx: await Docx.read(bytes) }); } catch (e) { showNotice(f.name + ': ' + e.message, true); return; }
    }
    const sheet = BookStyle.stylesheet(projectFiles.entries);
    const style = sheet ? BookStyle.read(projectFiles.entries[sheet]) : null;
    chapterAction((entries) => {
        let next = entries, prev = activeHtmlFile;
        const added = [], missing = [], skipped = [], binaries = {};
        files.forEach((f) => {
            const assets = Object.keys(projectAssets || {}).concat(Object.keys(binaries));
            const r = f.docx ? DocxImport.importInto(next, f.docx, prev, { name: f.name, assets: assets })
                : MarkdownImport.importInto(next, [f], prev, { assets: assets, notes: style ? style.notes : 'footnotes' });
            next = r.entries;
            if (r.added.length) prev = r.added[r.added.length - 1];
            added.push(...r.added);
            missing.push(...(r.missing || []));
            skipped.push(...(r.skipped || []));
            Object.assign(binaries, r.binaries || {});
        });
        const list = (label, xs) => (xs.length ? ' ' + label + ': ' + xs.slice(0, 5).join(', ') + (xs.length > 5 ? ', and ' + (xs.length - 5) + ' more' : '') + '.' : '');
        const tail = list('Images not in the book, kept as [alt text]', missing) + list('Left out', skipped);
        setTimeout(() => showNotice('Imported ' + added.length + (added.length === 1 ? ' chapter' : ' chapters') + ' from ' + files.map((f) => f.name).join(', ') + '.' + tail, missing.length + skipped.length > 0), 0);
        return { entries: next, path: added[0], removed: [], binaries: binaries };
    }, null);
});

// KDP wants the contents as a page in the reading order (docs/STORES.md); D-047.
navInReadingBox.addEventListener('change', () => { chapterAction((entries) => BookChapters.setNavInReading(entries, navInReadingBox.checked),
    navInReadingBox.checked ? 'The contents page is now in the reading order, after the front matter.' : 'The contents page is out of the reading order; reading apps still show the contents in their menus.'); refreshChapters(); });

// The EPUB 2 NCX for older readers (P7-04, D-049): added or removed as one undo step; an imported one is kept until
// the author regenerates it.
function commitNcx(next, added, removed, notice) {
    let tree = projectFiles.tree;
    if (added) tree = Project.treeAfter(tree, { type: 'add', path: added });
    removed.forEach((p) => { tree = Project.treeAfter(tree, { type: 'delete', path: p }); });
    const tabs = openTabs.filter((p) => removed.indexOf(p) === -1);
    const active = removed.indexOf(activeFile) === -1 ? activeFile : (tabs[0] || activeHtmlFile);
    commitFileChange(next, { tree: tree, openTabs: tabs, activeFile: active, activeHtmlFile: activeHtmlFile });
    refreshChapters();
    showNotice(notice);
}

ncxBox.addEventListener('change', async () => {
    syncBufferFromEditor();
    const assets = Object.keys(projectAssets || {});
    const on = ncxBox.checked;
    try {
        if (on) {
            const r = BookNcx.enable(projectFiles.entries, assets);
            commitNcx(r.entries, r.path, [], 'Added ' + r.path.split('/').pop() + ', the EPUB 2 contents. Scribe keeps it in step with the contents.');
            return;
        }
        const state = BookNcx.state(projectFiles.entries, assets);
        if (!state.owned && !await askConfirm({ title: 'Delete the book’s toc.ncx?', text: 'This toc.ncx came with the book. Turning the EPUB 2 contents off deletes it; undo puts it back.', confirm: 'Delete it' })) { refreshChapters(); return; }
        const r = BookNcx.disable(projectFiles.entries, assets);
        commitNcx(r.entries, null, r.removed, 'Removed ' + r.removed.map((p) => p.split('/').pop()).join(', ') + '. EPUB 3 readers use the contents in nav.xhtml.');
    } catch (e) {
        refreshChapters();
        showNotice(e.message, true);
    }
});

ncxRegenBtn.addEventListener('click', () => {
    syncBufferFromEditor();
    const next = BookNcx.refresh(projectFiles.entries, Object.keys(projectAssets || {}), { adopt: true });
    if (next === projectFiles.entries) { showNotice('The contents list no links to write into toc.ncx. Generate the contents first.', true); return; }
    commitNcx(next, null, [], 'Rewrote toc.ncx from the contents. Scribe now keeps it in step.');
});

// P6-02 (D-045): page breaks and the page list, the language of parts, matching ARIA roles, and the alt-text pass.
// Each change is one undo step of splices (D-002). The pure work is in BookPages, BookLang, BookRoles, and BookAlt.

const altModal = document.getElementById('alt-modal');
const altList = document.getElementById('altList');
const pageSourceInput = document.getElementById('pageSourceInput');

// Where to act in the open chapter: the code editor's selection when it shows the chapter and has focus or a
// selection, else the element selected on the Stage (as scene breaks and notes do).
function chapterPlace(range) {
    if (!/\.xhtml?$/i.test(activeHtmlFile || '')) return null;
    const editorOnChapter = activeFile === activeHtmlFile && !editor.closest('[hidden]');
    if (editorOnChapter && (document.activeElement === editor || editor.selectionStart !== editor.selectionEnd)) {
        return { start: editor.selectionStart, end: range ? editor.selectionEnd : editor.selectionStart, from: 'editor' };
    }
    const node = selectedPcId ? HtmlAst.findById(currentHtmlAst, selectedPcId) : null;
    return node ? { node: node, start: node.start, end: node.start, from: 'stage' } : null;
}

// The chapters and the nav, the files that carry epub:type.
function roleFiles(entries) {
    const model = Book.read(entries).model;
    if (!model) return [];
    return model.manifest.items.filter((i) => i.mediaType === 'application/xhtml+xml' && i.path && typeof entries[i.path] === 'string').map((i) => i.path);
}

function refreshStructure(model) {
    pageSourceInput.value = BookPages.source(model);
    const files = roleFiles(projectFiles.entries);
    const fixable = files.reduce((n, p) => n + BookRoles.scan(projectFiles.entries[p]).filter((f) => f.fixable).length, 0);
    const btn = document.getElementById('rolesFixBtn');
    btn.disabled = !fixable;
    btn.textContent = fixable ? 'Add matching roles (' + fixable + ')' : 'Roles match';
}

function commitBookFiles(next, notice) {
    commitFileChange(next, { tree: projectFiles.tree, openTabs: openTabs, activeFile: activeFile, activeHtmlFile: activeHtmlFile });
    if (typeof refreshBookPanel === 'function') refreshBookPanel(true);
    if (notice) showNotice(notice);
}

document.getElementById('pageBreakBtn').addEventListener('click', async () => {
    syncBufferFromEditor();
    const place = chapterPlace(false);
    if (!place) { showNotice('Select the element a printed page starts with on the Stage, or put the cursor in the chapter in the code editor.', true); return; }
    const model = Book.read(projectFiles.entries).model;
    if (!model) { showNotice('content.opf cannot be read; fix it first.', true); return; }
    const guess = BookPages.nextLabel(projectFiles.entries, model, activeHtmlFile, place.start);
    const label = await askText({ title: 'Page break', hint: 'The number of the printed page that starts here, as printed (12, xiv). Screen readers announce it; it is not shown in the text.', value: guess, confirm: 'Add page break', validate: (t) => (t ? '' : 'Enter the page number.') });
    if (!label) return;
    let r;
    try { r = BookPages.insertAt(projectFiles.entries[activeHtmlFile], place.start, label); } catch (e) { showNotice(e.message, true); return; }
    commitBookFiles(Object.assign({}, projectFiles.entries, { [activeHtmlFile]: r.text }), 'Added page ' + label + '. Build page list in the Chapters tab links every page break.');
});

document.getElementById('pageListBtn').addEventListener('click', () => {
    syncBufferFromEditor();
    const model = Book.read(projectFiles.entries).model;
    if (!model) { showNotice('content.opf cannot be read; fix it first.', true); return; }
    let r;
    try { r = BookPages.buildPageList(projectFiles.entries, model); } catch (e) { showNotice(e.message, true); return; }
    commitBookFiles(r.entries, 'The page list links ' + r.count + (r.count === 1 ? ' page.' : ' pages.') + (BookPages.source(Book.read(r.entries).model) ? '' : ' Say where the page numbers come from in the Book tab.'));
    if (typeof refreshChapters === 'function') refreshChapters();
});

pageSourceInput.addEventListener('change', () => { applyBookOps(BookPages.setSource(pageSourceInput.value)); });

document.getElementById('langBtn').addEventListener('click', async () => {
    syncBufferFromEditor();
    const place = chapterPlace(true);
    if (!place) { showNotice('Select the passage in the code editor, or an element on the Stage, first.', true); return; }
    const text = projectFiles.entries[activeHtmlFile];
    const start = place.from === 'stage' ? place.node.openEnd : place.start;
    const end = place.from === 'stage' ? place.node.openEnd : place.end;
    const now = BookLang.at(text, start);
    const tag = await askText({ title: 'Language', hint: 'A language tag such as fr, de-CH, or zh-Hant (BCP 47), so screen readers switch voice. Leave it empty to remove a language set here.', value: now, confirm: 'Set language', validate: (t) => (!t || BookLang.wellFormed(t) ? '' : '"' + t + '" is not a language tag. Try fr, de-CH, or zh-Hant.') });
    if (tag === null) return;
    let next;
    try { next = BookLang.apply(text, start, end, tag); } catch (e) { showNotice(e.message, true); return; }
    commitBookFiles(Object.assign({}, projectFiles.entries, { [activeHtmlFile]: next }), tag ? 'Marked as ' + tag + '.' : 'Removed the language.');
});

document.getElementById('rolesFixBtn').addEventListener('click', async () => {
    syncBufferFromEditor();
    const files = roleFiles(projectFiles.entries);
    let next = projectFiles.entries, count = 0, changed = 0;
    files.forEach((p) => { const r = BookRoles.fix(next[p]); if (r.count) { next = Object.assign({}, next, { [p]: r.text }); count += r.count; changed++; } });
    if (!count) { showNotice('Every epub:type already has its role, or the Problems tab says why it cannot.'); return; }
    if (!await askConfirm({ title: 'Add matching roles?', text: 'Adds ' + count + (count === 1 ? ' role attribute' : ' role attributes') + ' in ' + changed + (changed === 1 ? ' file' : ' files') + ', such as role="doc-chapter" next to epub:type="chapter". Nothing else changes.', confirm: 'Add roles' })) return;
    commitBookFiles(next, 'Added ' + count + (count === 1 ? ' role.' : ' roles.'));
});

function altItem(item) {
    const li = document.createElement('li');
    li.className = 'alt-item' + (item.alt == null ? ' alt-missing' : '');
    const img = document.createElement('img');
    img.alt = '';
    if (item.file && projectAssetUrls[item.file]) img.src = projectAssetUrls[item.file];
    const side = document.createElement('div');
    const where = document.createElement('p');
    where.className = 'alt-where';
    where.textContent = item.chapter + ' · ' + (item.file || item.src) + (item.caption ? ' · Caption: ' + item.caption : '') + (item.alt == null ? ' · No alt text' : '');
    const area = document.createElement('textarea');
    area.rows = 2;
    area.value = item.alt || '';
    area.placeholder = 'What the image shows, as you would say it to someone who cannot see it';
    area.setAttribute('aria-label', 'Alt text for ' + (item.file || item.src));
    const row = document.createElement('div');
    row.className = 'alt-row';
    const deco = document.createElement('label');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = item.alt === '';
    deco.append(box, document.createTextNode(' Decorative (alt="", skipped by screen readers)'));
    area.disabled = box.checked;
    const save = () => {
        syncBufferFromEditor();
        const fresh = BookAlt.list(projectFiles.entries, Book.read(projectFiles.entries).model).find((i) => i.path === item.path && i.order === item.order);
        if (!fresh) { showNotice('The image has moved; reopen the list.', true); return; }
        let text;
        try { text = BookAlt.setAlt(projectFiles.entries[item.path], fresh.start, area.value, box.checked); } catch (e) { showNotice(e.message, true); return; }
        if (text === projectFiles.entries[item.path]) return;
        commitBookFiles(Object.assign({}, projectFiles.entries, { [item.path]: text }));
        li.classList.remove('alt-missing');
        renderAltSummary();
    };
    area.addEventListener('change', save);
    box.addEventListener('change', () => { area.disabled = box.checked; if (box.checked || area.value.trim()) save(); else area.focus(); });
    row.appendChild(deco);
    side.append(where, area, row);
    li.append(img, side);
    return li;
}

function renderAltSummary() {
    const c = BookAlt.counts(BookAlt.list(projectFiles.entries, Book.read(projectFiles.entries).model));
    document.getElementById('altSummary').textContent = c.total ? c.total + (c.total === 1 ? ' image' : ' images') + ': ' + c.missing + ' without alt text, ' + c.decorative + ' marked decorative. Describe what each image means in the book (WCAG 2 1.1.1); a change is saved when you leave the box.' : 'The chapters have no images.';
}

document.getElementById('altReviewBtn').addEventListener('click', () => {
    syncBufferFromEditor();
    const model = Book.read(projectFiles.entries).model;
    if (!model) { showNotice('content.opf cannot be read; fix it first.', true); return; }
    altList.textContent = '';
    BookAlt.list(projectFiles.entries, model).forEach((item) => altList.appendChild(altItem(item)));
    renderAltSummary();
    openModal(altModal);
});

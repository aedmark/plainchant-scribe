// Notes (P4-04, D-034): the Layout tab's Notes section adds a numbered footnote or endnote to the paragraph selected
// on the Stage, or removes the note whose reference is selected. BookNotes renumbers in reading order; each change,
// a new notes chapter included, is one undo step. The first note also turns on the note styling.

function notesMode() {
    const sheet = layoutTarget();
    const s = sheet ? BookStyle.read(projectFiles.entries[sheet]) : null;
    return s ? s.notes : 'footnotes';
}

function selectedInChapter(message) {
    const node = selectedPcId ? HtmlAst.findById(currentHtmlAst, selectedPcId) : null;
    if (!node || !/\.xhtml?$/i.test(activeHtmlFile)) { showNotice(message, true); return null; }
    return node;
}

function commitNotes(next, notice) {
    let tree = projectFiles.tree;
    Object.keys(next).filter((p) => !(p in projectFiles.entries)).forEach((p) => { tree = Project.treeAfter(tree, { type: 'add', path: p }); });
    commitFileChange(next, { tree: tree, openTabs: openTabs, activeFile: activeFile, activeHtmlFile: activeHtmlFile });
    refreshLayout();
    if (typeof refreshChapters === 'function') refreshChapters();
    showNotice(notice);
}

document.getElementById('noteAddBtn').addEventListener('click', async () => {
    const node = selectedInChapter('Select a paragraph in a chapter on the Stage first, then add a note to it.');
    if (!node) return;
    const path = activeHtmlFile, start = node.start, mode = notesMode();
    const text = await askText({ title: 'Add a note', hint: 'The note’s text. Its numbered reference goes at the end of the selected paragraph; move it in the code editor if it belongs mid-sentence.', value: '', confirm: 'Add note', validate: (t) => (t ? '' : 'Enter the note’s text.') });
    if (!text) return;
    syncBufferFromEditor();
    let next;
    try { next = BookNotes.add(projectFiles.entries, path, start, text, mode).entries; } catch (e) { showNotice(e.message, true); return; }
    const sheet = BookStyle.stylesheet(next);
    const s = sheet ? (BookStyle.read(next[sheet]) || BookStyle.normalise(BookStyle.PRESETS.plain.settings)) : null;
    if (s && !s.noteStyle) {
        s.noteStyle = true;
        const model = Book.read(next).model;
        next = Object.assign({}, next, { [sheet]: BookStyle.apply(next[sheet], s, model ? model.metadata.language : 'en') });
    }
    commitNotes(next, mode === 'endnotes' ? 'Added an endnote.' : 'Added a footnote.');
});

document.getElementById('noteRemoveBtn').addEventListener('click', async () => {
    const node = selectedInChapter('Select a note reference (the small number) on the Stage first.');
    if (!node) return;
    const path = activeHtmlFile, start = node.start, mode = notesMode();
    if (!await askConfirm({ title: 'Remove this note?', text: 'The reference and its note are deleted, and the other notes are renumbered. Undo brings it back.', confirm: 'Remove note' })) return;
    syncBufferFromEditor();
    let next;
    try { next = BookNotes.remove(projectFiles.entries, path, start, mode).entries; } catch (e) { showNotice(e.message, true); return; }
    commitNotes(next, 'Removed the note.');
});

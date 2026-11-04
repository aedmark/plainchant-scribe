const formatBtn = document.getElementById('formatBtn');

function formatActiveFile() {
    syncBufferFromEditor();
    const before = editor.value;
    const res = Format.byPath(activeFile, before, { indent: Format.detectIndent(before) });
    if (!res) { showNotice('Format works on HTML, CSS, and JavaScript files.', true); return; }
    if (res.text === before) { showNotice(activeFile + ' is already formatted.'); return; }
    applyEdit(Editing.diffEdit(before, res.text, editor.selectionStart, editor.selectionEnd), {});
    showNotice('Formatted ' + activeFile + '. Press Ctrl/Cmd+Z to undo.');
}

formatBtn.addEventListener('click', formatActiveFile);
document.addEventListener('keydown', (e) => {
    if (e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyF' && !e.isComposing) {
        e.preventDefault();
        formatActiveFile();
    }
});

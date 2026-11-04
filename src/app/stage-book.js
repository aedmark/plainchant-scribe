// The Reading Stage for books (P2-01, D-018). A chapter is loaded as application/xhtml+xml from a Blob URL, so the
// browser parses it as a reading system does. Stage selection and inline editing stay off for chapters until P2-06;
// links never navigate the frame: stage-nav.js follows them (P2-05).

let stageBookUrl = null;
let stageBookScroll = { path: null, y: 0 };

function isBookProject() {
    return Project.isBookEntries(projectFiles && projectFiles.entries);
}

function bookChapterFor(entries, preferred) {
    return BookStage.chapterFor(entries, preferred, Object.keys(projectAssets || {}));
}

// Project files for a book made by BookTemplate.create or ExampleBook.create, with its empty folders in the tree.
function bookProjectFiles(made) {
    let tree = Project.deriveTree(made.files, null, []);
    (made.dirs || []).forEach((dir) => { tree = Project.treeAfter(tree, { type: 'mkdir', path: dir }); });
    return { html: '', css: '', js: '', entries: Object.assign({}, made.files), tree: tree };
}

function clearBookStage() {
    if (stageBookUrl) URL.revokeObjectURL(stageBookUrl);
    stageBookUrl = null;
    if (stageFrame.hasAttribute('src')) stageFrame.removeAttribute('src');
    syncReaderUi();
}

function rememberBookScroll() {
    try {
        const win = stageFrame.contentWindow;
        if (stageBookUrl && win && stageBookScroll.path === activeHtmlFile) stageBookScroll.y = win.scrollY || 0;
    } catch (e) {
        stageBookScroll.y = 0;
    }
}

function bookStageError(path, errors) {
    const esc = HtmlAst.escapeHtml;
    const first = errors[0] || { message: 'Unknown error', line: 0, column: 0 };
    const more = errors.length > 1 ? '<p>' + (errors.length - 1) + ' more in the Problems tab and the code editor.</p>' : '';
    return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Not shown</title></head>' +
        '<body style="font-family: sans-serif; margin: 2em; line-height: 1.5">' +
        '<h1 style="font-size: 1.2em">This chapter is not well-formed XML</h1>' +
        '<p>A reading system would not show <code>' + esc(path) + '</code>, so the Stage does not either.</p>' +
        '<p><strong>Line ' + (first.line + 1) + ', column ' + (first.column + 1) + ':</strong> ' + esc(first.message) + '</p>' + more +
        '</body></html>';
}

function drawBookStage() {
    rememberBookScroll();
    const path = activeHtmlFile;
    syncReaderUi();
    const res = BookStage.assemble(projectFiles.entries, path, projectAssetUrls, { css: BookStage.readerCss(readerPrefs()) });
    const old = stageBookUrl;
    if (!res.ok) {
        clearBookStage();
        stageFrame.srcdoc = bookStageError(path, res.errors);
        return;
    }
    if (stageBookScroll.path !== path) stageBookScroll = { path: path, y: 0 };
    const url = URL.createObjectURL(new Blob([res.xhtml], { type: 'application/xhtml+xml' }));
    stageBookUrl = url;
    // srcdoc wins over src, so it has to go first.
    stageFrame.removeAttribute('srcdoc');
    stageFrame.src = url;
    if (old) URL.revokeObjectURL(old);
}

stageFrame.addEventListener('load', () => {
    if (!stageBookUrl) return;
    let doc;
    try { doc = stageFrame.contentDocument; } catch (e) { return; }
    if (!doc) return;
    onBookStageLoad(doc);
    if (stageBookScroll.y) stageFrame.contentWindow.scrollTo(0, stageBookScroll.y);
    // Links go through the Stage's own navigation (P2-05): in-chapter targets turn to their page, other chapters
    // open in the editor and on the Stage, and links that leave the book are shown, not opened.
    doc.addEventListener('click', (e) => {
        const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
        if (!a) return;
        e.preventDefault();
        followBookLink(a.getAttribute('href') || '');
    }, true);
});

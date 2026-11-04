// The Reading Stage for books (P2-01, D-018). A chapter is loaded as application/xhtml+xml from a Blob URL, so the
// browser parses it as a reading system does. The Design bridge runs in the copy for selection and editing (P2-06);
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
    // Stage editing (P2-06, D-024): the copy carries HtmlAst's data-pc-id stamps and the Design bridge, as web pages do.
    const stamped = Object.assign({}, projectFiles.entries, { [path]: HtmlAst.stamp(projectFiles.entries[path], currentHtmlAst) });
    const res = BookStage.assemble(stamped, path, projectAssetUrls, {
        css: BookStage.readerCss(readerPrefs()) + '\n' + BRIDGE_CSS,
        script: buildBridgeScript(selectedPcId)
    });
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
    // Clicks belong to the Design bridge: click selects, double-click edits text, Ctrl/Cmd+Click follows a link
    // through followProjectLink, which hands books to followBookLink (D-024).
});

// Every HtmlAst edit to a chapter is parsed as XML first: one that would make a well-formed chapter ill-formed (an
// HTML-only snippet such as <img ...>) is refused, so the Stage and Inspector never break a chapter (D-024).
function bookEditRefused(nextHtml) {
    if (!isBookProject() || !/\.xhtml?$/i.test(activeHtmlFile)) return false;
    const after = XmlAst.parse(nextHtml);
    if (after.wellFormed || !XmlAst.parse(projectFiles.html).wellFormed) return false;
    const e = after.errors[0];
    showNotice('Not changed: that edit would make the chapter invalid XHTML (line ' + (e.line + 1) + ': ' + e.message + ').', true);
    return true;
}

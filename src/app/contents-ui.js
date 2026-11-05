// Generate contents (P3-04, D-028): a dialog that previews the table of contents and landmarks BookContents plans
// from the chapters' headings, then writes them, with any heading ids the links need, as one undo step.

const tocModal = document.getElementById('toc-modal');
const tocDepth = document.getElementById('tocDepth');
const tocPreview = document.getElementById('tocPreview');
const tocSummary = document.getElementById('tocSummary');
let tocPlan = null;

function tocTree(items) {
    const ol = document.createElement('ol');
    items.forEach((item) => {
        const li = document.createElement('li');
        li.textContent = item.label;
        li.title = item.path + (item.fragment ? '#' + item.fragment : '');
        if (item.children.length) li.appendChild(tocTree(item.children));
        ol.appendChild(li);
    });
    return ol;
}

function showTocPlan() {
    syncBufferFromEditor();
    try { tocPlan = BookContents.plan(projectFiles.entries, Number(tocDepth.value)); } catch (e) { tocPlan = null; tocSummary.textContent = e.message; tocPreview.textContent = ''; return; }
    const n = BookContents.count(tocPlan.tree);
    const parts = [n + (n === 1 ? ' entry' : ' entries')];
    const chapters = new Set(tocPlan.ids.map((x) => x.path)).size;
    if (tocPlan.ids.length) parts.push(tocPlan.ids.length + (tocPlan.ids.length === 1 ? ' heading gets an id' : ' headings get ids') + ' in ' + chapters + (chapters === 1 ? ' chapter' : ' chapters'));
    if (tocPlan.skipped.length) parts.push('left out, not well-formed: ' + tocPlan.skipped.map((p) => p.split('/').pop()).join(', '));
    tocSummary.textContent = parts.join('; ') + '.';
    tocPreview.textContent = '';
    tocPreview.appendChild(tocTree(tocPlan.tree));
    const marks = document.createElement('p');
    marks.className = 'toc-landmarks';
    marks.textContent = 'Landmarks: ' + (tocPlan.landmarks.length ? tocPlan.landmarks.map((l) => l.label + ' → ' + (l.path ? l.path.split('/').pop() : l.href)).join('; ') : 'none');
    tocPreview.appendChild(marks);
}

function openTocDialog() {
    showTocPlan();
    document.getElementById('tocForm').onsubmit = (e) => {
        e.preventDefault();
        if (!tocPlan) return;
        let next;
        try { next = BookContents.apply(projectFiles.entries, tocPlan); } catch (err) { showNotice(err.message, true); return; }
        closeModal(tocModal);
        commitFileChange(next, { tree: projectFiles.tree, openTabs: openTabs, activeFile: activeFile, activeHtmlFile: activeHtmlFile });
        refreshChapters();
        showNotice('Generated the contents: ' + BookContents.count(tocPlan.tree) + ' entries.');
    };
    openModal(tocModal, { focus: '#tocDepth' });
}

tocDepth.addEventListener('change', showTocPlan);
document.getElementById('tocGenerateBtn').addEventListener('click', openTocDialog);

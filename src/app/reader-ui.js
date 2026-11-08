// Reader settings for the Stage (P2-02, D-020): text size, margins, and theme, saved with the Studio's settings and
// applied to every book's Stage copy. They never change a book's files, and web-page projects do not show them.

const readerWrap = document.getElementById('readerWrap');
const readerBtn = document.getElementById('readerBtn');
const readerPanel = document.getElementById('readerPanel');
const readerSizeOut = document.getElementById('readerSizeOut');
const readerSmaller = document.getElementById('readerSmaller');
const readerLarger = document.getElementById('readerLarger');
const pageNav = document.getElementById('pageNav');
const pagePrev = document.getElementById('pagePrev');
const pageNext = document.getElementById('pageNext');
const pageOut = document.getElementById('pageOut');
let stagePage = { path: null, index: 0, count: 1 };

function readerPrefs() {
    return BookStage.readerPrefs({ size: settings.readerSize, margins: settings.readerMargins, theme: settings.readerTheme, mode: settings.readerMode, device: settings.readerDevice, orientation: settings.readerOrientation });
}

// Scales the book's own root font size, read after load, so its em and rem sizes follow and px does not.
function applyReaderSize(doc) {
    const size = readerPrefs().size;
    const root = doc && doc.documentElement;
    if (!root || size === 100) return;
    const px = parseFloat(doc.defaultView.getComputedStyle(root).fontSize) || 16;
    root.style.setProperty('font-size', (px * size / 100) + 'px', 'important');
}

function showReaderPrefs() {
    const p = readerPrefs();
    const sizes = BookStage.READER.sizes;
    readerSizeOut.textContent = p.size + '%';
    readerSmaller.disabled = p.size === sizes[0];
    readerLarger.disabled = p.size === sizes[sizes.length - 1];
    readerPanel.querySelectorAll('[data-reader-margins]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.readerMargins === p.margins)));
    readerPanel.querySelectorAll('[data-reader-theme]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.readerTheme === p.theme)));
    readerPanel.querySelectorAll('[data-reader-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.readerMode === p.mode)));
}

// Paged mode (P2-03, D-021): the Stage copy is laid out in columns one viewport wide (BookStage.readerCss), and a page
// turn sets the root's scrollLeft to a multiple of that width. Pages count within the open chapter.
function pagedDoc() {
    if (!stageBookUrl || readerPrefs().mode !== 'paged' || isFixedStagePage()) return null;
    try { return stageFrame.contentDocument; } catch (e) { return null; }
}

function showPageNav() {
    const doc = pagedDoc();
    pageNav.hidden = !doc || !isBookProject();
    if (pageNav.hidden) return;
    pageOut.textContent = 'Page ' + (stagePage.index + 1) + ' of ' + stagePage.count;
    // At a chapter's end the buttons stay on while there is a chapter to page into.
    pagePrev.disabled = stagePage.index === 0 && !BookStage.neighbour(projectFiles.entries, activeHtmlFile, -1, Object.keys(projectAssets || {}));
    pageNext.disabled = stagePage.index >= stagePage.count - 1 && !BookStage.neighbour(projectFiles.entries, activeHtmlFile, 1, Object.keys(projectAssets || {}));
}

// Browsers leave the body's end padding out of the scroll width, so the last page could not be reached exactly. A 1px
// marker in the Stage copy (never the book) at the end of the last page makes the width whole pages.
function pageEndMarker(doc, at) {
    let mark = doc.getElementById('scribe-page-end');
    if (!mark) {
        mark = doc.createElementNS('http://www.w3.org/1999/xhtml', 'div');
        mark.id = 'scribe-page-end';
        mark.setAttribute('aria-hidden', 'true');
        mark.style.cssText = 'position: absolute; top: 0; width: 1px; height: 1px; visibility: hidden;';
        doc.documentElement.appendChild(mark);
    }
    mark.style.left = at + 'px';
}

function goToPage(index) {
    const doc = pagedDoc();
    if (!doc) { showPageNav(); return; }
    const root = doc.scrollingElement || doc.documentElement;
    const width = doc.defaultView.innerWidth || 1;
    pageEndMarker(doc, 0);
    stagePage.count = Math.max(1, Math.ceil((root.scrollWidth - 1) / width));
    pageEndMarker(doc, stagePage.count * width - 1);
    stagePage.index = Math.max(0, Math.min(stagePage.count - 1, index));
    root.scrollLeft = stagePage.index * width;
    showPageNav();
}

// An in-chapter link turns to the page holding its target instead of leaving the view between two pages.
function turnToFragment(doc, id) {
    if (!pagedDoc()) return false;
    let target = null;
    try { target = doc.getElementById(decodeURIComponent(id)); } catch (e) { target = doc.getElementById(id); }
    if (!target) return false;
    const root = doc.scrollingElement || doc.documentElement;
    goToPage(Math.floor((target.getBoundingClientRect().left + root.scrollLeft) / (doc.defaultView.innerWidth || 1)));
    return true;
}

// Paging past either end moves to the next chapter's first page or the previous chapter's last page (D-023).
function turnPage(dir) {
    const next = stagePage.index + dir;
    if (next < 0 || next > stagePage.count - 1) {
        if (BookStage.neighbour(projectFiles.entries, activeHtmlFile, dir, Object.keys(projectAssets || {}))) stepChapter(dir, dir > 0 ? 'first' : 'last');
        return;
    }
    goToPage(next);
}

function pageKey(e) {
    if (e.altKey || e.ctrlKey || e.metaKey || (e.target && e.target.isContentEditable)) return;
    const dir = { ArrowLeft: -1, PageUp: -1, ArrowRight: 1, PageDown: 1 }[e.key];
    if (!dir || !pagedDoc()) return;
    e.preventDefault();
    turnPage(dir);
}

// Called by stage-book.js each time a chapter copy has loaded.
function onBookStageLoad(doc) {
    // A fixed-layout page (P7-01) keeps its own type and is one page: no reader size, no paging.
    const fixed = isFixedStagePage();
    if (!fixed) applyReaderSize(doc);
    if (stagePage.path !== activeHtmlFile) stagePage = { path: activeHtmlFile, index: 0, count: 1 };
    doc.addEventListener('keydown', pageKey);
    if (readerPrefs().mode === 'paged' && !fixed) {
        const keep = () => goToPage(stagePage.index);
        doc.defaultView.addEventListener('resize', keep);
        // Anything else that scrolls the page (find in page, focus) snaps back to a page boundary.
        doc.addEventListener('scroll', () => {
            const root = doc.scrollingElement || doc.documentElement, width = doc.defaultView.innerWidth || 1;
            if (root.scrollLeft % width) goToPage(Math.round(root.scrollLeft / width));
        });
        if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(keep);
        keep();
    } else showPageNav();
    applyStageTarget(doc);
}

function syncReaderUi() {
    const book = isBookProject();
    const fixed = book && isFixedStagePage();
    readerWrap.hidden = !book || fixed;
    if (!book || fixed) setReaderPanel(false);
    if (typeof layoutDevice === 'function') layoutDevice();
    if (typeof syncChapterNav === 'function') syncChapterNav();
    if (typeof syncBookTab === 'function') syncBookTab();
    showPageNav();
}

function setReaderPanel(open) {
    readerPanel.hidden = !open;
    readerBtn.setAttribute('aria-expanded', String(open));
    if (open) showReaderPrefs();
}

function setReaderPref(name, value) {
    setSetting(name, value);
    showReaderPrefs();
    if (isBookProject()) drawStageNow();
}

function stepReaderSize(dir) {
    const sizes = BookStage.READER.sizes;
    const at = sizes.indexOf(readerPrefs().size);
    const next = sizes[Math.max(0, Math.min(sizes.length - 1, at + dir))];
    if (next !== readerPrefs().size) setReaderPref('readerSize', next);
}

readerBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    setReaderPanel(readerPanel.hidden);
});
readerSmaller.addEventListener('click', () => stepReaderSize(-1));
readerLarger.addEventListener('click', () => stepReaderSize(1));
readerPanel.querySelectorAll('[data-reader-margins]').forEach((b) => b.addEventListener('click', () => setReaderPref('readerMargins', b.dataset.readerMargins)));
readerPanel.querySelectorAll('[data-reader-theme]').forEach((b) => b.addEventListener('click', () => setReaderPref('readerTheme', b.dataset.readerTheme)));
readerPanel.querySelectorAll('[data-reader-mode]').forEach((b) => b.addEventListener('click', () => setReaderPref('readerMode', b.dataset.readerMode)));
pagePrev.addEventListener('click', () => turnPage(-1));
pageNext.addEventListener('click', () => turnPage(1));
pageNav.addEventListener('keydown', pageKey);
document.getElementById('readerReset').addEventListener('click', () => {
    const d = BookStage.READER.defaults;
    setSetting('readerSize', d.size);
    setSetting('readerMargins', d.margins);
    setSetting('readerMode', d.mode);
    setSetting('readerDevice', d.device);
    setSetting('readerOrientation', d.orientation);
    setReaderPref('readerTheme', d.theme);
});
readerWrap.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !readerPanel.hidden) {
        e.stopPropagation();
        setReaderPanel(false);
        readerBtn.focus({ preventScroll: true });
    }
});
document.addEventListener('click', (e) => {
    if (!readerPanel.hidden && !e.target.closest('#readerWrap')) setReaderPanel(false);
});

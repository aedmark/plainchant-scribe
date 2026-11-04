// Reader settings for the Stage (P2-02, D-020): text size, margins, and theme, saved with the Studio's settings and
// applied to every book's Stage copy. They never change a book's files, and web-page projects do not show them.

const readerWrap = document.getElementById('readerWrap');
const readerBtn = document.getElementById('readerBtn');
const readerPanel = document.getElementById('readerPanel');
const readerSizeOut = document.getElementById('readerSizeOut');
const readerSmaller = document.getElementById('readerSmaller');
const readerLarger = document.getElementById('readerLarger');

function readerPrefs() {
    return BookStage.readerPrefs({ size: settings.readerSize, margins: settings.readerMargins, theme: settings.readerTheme });
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
}

function syncReaderUi() {
    const book = isBookProject();
    readerWrap.hidden = !book;
    if (!book) setReaderPanel(false);
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
document.getElementById('readerReset').addEventListener('click', () => {
    const d = BookStage.READER.defaults;
    setSetting('readerSize', d.size);
    setSetting('readerMargins', d.margins);
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

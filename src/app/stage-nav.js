// Moving through a book on the Stage (P2-05, D-023): previous and next chapter, the contents sidebar, and links.
// The Stage always shows the chapter open in the editor, so going to a chapter opens it there; a pending target
// (a fragment, or the last page) is applied when the new copy has loaded. Links that leave the book are shown,
// never opened.

const chapterNav = document.getElementById('chapterNav');
const chapterPrev = document.getElementById('chapterPrev');
const chapterNext = document.getElementById('chapterNext');
const contentsBtn = document.getElementById('contentsBtn');
const contentsPanel = document.getElementById('contentsPanel');
const contentsList = document.getElementById('contentsList');
let stageTarget = null;

const bookAssets = () => Object.keys(projectAssets || {});

function syncChapterNav() {
    const book = isBookProject();
    chapterNav.hidden = !book;
    if (!book) { setContents(false); return; }
    chapterPrev.disabled = !BookStage.neighbour(projectFiles.entries, activeHtmlFile, -1, bookAssets());
    chapterNext.disabled = !BookStage.neighbour(projectFiles.entries, activeHtmlFile, 1, bookAssets());
}

// target: { fragment, page: 'first' | 'last' }.
function goToChapter(path, target) {
    const t = target || {};
    if (path === activeHtmlFile) {
        stageTarget = t;
        const doc = stageFrame.contentDocument;
        if (stageBookUrl && doc) applyStageTarget(doc);
        return;
    }
    stageTarget = t;
    openFileInEditor(path);
}

// Called by reader-ui.js after a chapter copy has loaded and its pages are counted.
function applyStageTarget(doc) {
    const t = stageTarget;
    stageTarget = null;
    syncChapterNav();
    if (!t) return;
    if (t.fragment && turnToFragment(doc, t.fragment)) return;
    if (t.fragment) {
        const el = doc.getElementById(t.fragment);
        if (el) { el.scrollIntoView(); return; }
    }
    if (t.page === 'last') {
        if (pagedDoc()) goToPage(Number.MAX_SAFE_INTEGER);
        else doc.defaultView.scrollTo(0, (doc.scrollingElement || doc.documentElement).scrollHeight);
    }
}

function stepChapter(dir, page) {
    const next = BookStage.neighbour(projectFiles.entries, activeHtmlFile, dir, bookAssets());
    if (next) goToChapter(next, { page: page || 'first' });
    else showNotice(dir > 0 ? 'This is the last chapter.' : 'This is the first chapter.');
}

// A click on a link in the chapter. Returns true when the Stage handled it.
function followBookLink(href) {
    const t = BookStage.linkTarget(projectFiles.entries, activeHtmlFile, href, bookAssets());
    if (t.kind === 'fragment') { goToChapter(activeHtmlFile, { fragment: t.fragment }); return true; }
    if (t.kind === 'chapter') { goToChapter(t.path, { fragment: t.fragment }); return true; }
    if (t.kind === 'external') showNotice('This link leaves the book: ' + t.href + '. The Studio does not open web pages from a book.');
    else if (t.kind === 'file') showNotice(t.path + ' is not a chapter, so the Stage does not open it.');
    else if (t.kind === 'missing') showNotice('This link points at ' + t.path + ', which is not in the book.', true);
    else showNotice('"' + t.href + '" is not a link the Stage can follow.', true);
    return true;
}

function contentsTree(items) {
    const ol = document.createElement('ol');
    items.forEach((item) => {
        const li = document.createElement('li');
        if (item.path) {
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = item.label || item.path;
            b.title = item.path + (item.fragment ? '#' + item.fragment : '');
            if (item.path === activeHtmlFile && !item.fragment) b.setAttribute('aria-current', 'page');
            b.addEventListener('click', () => {
                setContents(false);
                goToChapter(item.path, { fragment: item.fragment });
            });
            li.appendChild(b);
        } else {
            const span = document.createElement('div');
            span.className = 'contents-heading';
            span.textContent = item.label;
            li.appendChild(span);
        }
        if (item.children && item.children.length) li.appendChild(contentsTree(item.children));
        ol.appendChild(li);
    });
    return ol;
}

function setContents(open) {
    contentsPanel.hidden = !open;
    contentsBtn.setAttribute('aria-expanded', String(open));
    if (!open) return;
    contentsList.textContent = '';
    const items = BookStage.contents(projectFiles.entries, bookAssets());
    if (items.length) contentsList.appendChild(contentsTree(items));
    else {
        const p = document.createElement('p');
        p.className = 'contents-empty';
        p.textContent = 'The navigation document has no table of contents to show.';
        contentsList.appendChild(p);
    }
    const first = contentsList.querySelector('[aria-current="page"]') || contentsList.querySelector('button') || document.getElementById('contentsClose');
    first.focus({ preventScroll: true });
}

chapterPrev.addEventListener('click', () => stepChapter(-1));
chapterNext.addEventListener('click', () => stepChapter(1));
contentsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    setContents(contentsPanel.hidden);
});
document.getElementById('contentsClose').addEventListener('click', () => {
    setContents(false);
    contentsBtn.focus({ preventScroll: true });
});
contentsPanel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        e.stopPropagation();
        setContents(false);
        contentsBtn.focus({ preventScroll: true });
    }
});
document.addEventListener('click', (e) => {
    if (!contentsPanel.hidden && !e.target.closest('#contentsPanel') && !e.target.closest('#contentsBtn')) setContents(false);
});

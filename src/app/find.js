const findBar = document.getElementById('findBar');
const findInput = document.getElementById('findInput');
const replaceInput = document.getElementById('replaceInput');
const findCaseBtn = document.getElementById('findCaseBtn');
const findCount = document.getElementById('findCount');
const findLayer = document.createElement('div');
findLayer.className = 'editor-find';
findLayer.setAttribute('aria-hidden', 'true');
shadeLayer.before(findLayer);

const FIND_MARK_LIMIT = 2000;
let findMatches = [];
let findCurrent = -1;
let findAnchor = null;
let findProject = false;

function placeFindLayer() {
    if (findBar.hidden || editor.offsetParent === null) return;
    copyEditorType(findLayer);
    Object.assign(findLayer.style, { top: editor.offsetTop + 'px', left: editor.offsetLeft + 'px', height: editor.clientHeight + 'px' });
    findLayer.scrollTop = editor.scrollTop;
}

function paintFind() {
    findLayer.textContent = '';
    if (findBar.hidden) return;
    const text = editor.value;
    const parts = document.createDocumentFragment();
    let last = 0;
    findMatches.slice(0, FIND_MARK_LIMIT).forEach((m, i) => {
        parts.appendChild(document.createTextNode(text.slice(last, m.start)));
        const mark = document.createElement('mark');
        mark.className = 'sh-find-match' + (i === findCurrent ? ' sh-find-current' : '');
        mark.textContent = text.slice(m.start, m.end);
        parts.appendChild(mark);
        last = m.end;
    });
    parts.appendChild(document.createTextNode(text.slice(last)));
    findLayer.appendChild(parts);
    findCount.textContent = !findInput.value ? '' : (findMatches.length ? (findCurrent + 1) + ' of ' + findMatches.length : 'No results');
    placeFindLayer();
}

function recomputeFind(anchor) {
    findMatches = Finding.findAll(editor.value, findInput.value, { caseSensitive: findCaseBtn.getAttribute('aria-pressed') === 'true' });
    findCurrent = Finding.nearest(findMatches, anchor);
    paintFind();
    if (typeof onFindChanged === 'function') onFindChanged(false);
}

function refreshFind() {
    if (findBar.hidden) return;
    const keep = findAnchor != null ? findAnchor : (findMatches[findCurrent] ? findMatches[findCurrent].start : editor.selectionStart);
    findAnchor = null;
    recomputeFind(keep);
}

function showFindMatch(index) {
    findCurrent = index;
    const m = findMatches[index];
    if (m) {
        editor.setSelectionRange(m.start, m.end);
        const top = textTopIn(editor.value, m.start);
        const lineHeight = parseFloat(getComputedStyle(editor).lineHeight) || 20;
        if (top < editor.scrollTop || top > editor.scrollTop + editor.clientHeight - 2 * lineHeight) {
            editor.scrollTop = Math.max(0, top - editor.clientHeight / 3);
        }
    }
    paintFind();
}

function stepFind(direction) {
    if (!findMatches.length) return;
    showFindMatch(Finding.step(findMatches, findCurrent, direction));
}

function openFind(focusReplace, projectScope) {
    if (panesShown() === 'preview') setPanes('both');
    const sel = editor.value.slice(editor.selectionStart, editor.selectionEnd);
    if (sel && sel.indexOf('\n') === -1 && sel.length <= 200) findInput.value = sel;
    findBar.hidden = false;
    if (typeof setFindProject === 'function') setFindProject(projectScope === true || (projectScope !== false && findProject));
    recomputeFind(editor.selectionStart);
    (focusReplace ? replaceInput : findInput).focus();
    (focusReplace ? replaceInput : findInput).select();
    placeShade();
}

function closeFind() {
    findBar.hidden = true;
    if (typeof hideFindResults === 'function') hideFindResults();
    findLayer.textContent = '';
    placeShade();
    editor.focus({ preventScroll: true });
}

function replaceInEditor(newText, caret) {
    const edit = Editing.diffEdit(editor.value, newText, caret, caret);
    applyEdit(edit, { keepFocus: true });
}

function replaceCurrentMatch() {
    const m = findMatches[findCurrent];
    if (!m) return;
    const res = Finding.replaceAt(editor.value, m, replaceInput.value);
    findAnchor = res.caret;
    replaceInEditor(res.text, res.caret);
    if (findMatches.length) showFindMatch(findCurrent);
}

function replaceEveryMatch() {
    if (findProject) { replaceAcrossProject(); return; }
    const res = Finding.replaceAll(editor.value, findInput.value, replaceInput.value, { caseSensitive: findCaseBtn.getAttribute('aria-pressed') === 'true' });
    if (!res.count) return;
    findAnchor = 0;
    replaceInEditor(res.text, editor.selectionStart);
    showNotice('Replaced ' + res.count + (res.count === 1 ? ' match' : ' matches') + ' in ' + activeFile + '.');
}

findInput.addEventListener('input', () => { if (typeof onFindChanged === 'function') onFindChanged(true); recomputeFind(editor.selectionStart); });
findCaseBtn.addEventListener('click', () => {
    findCaseBtn.setAttribute('aria-pressed', String(findCaseBtn.getAttribute('aria-pressed') !== 'true'));
    if (typeof onFindChanged === 'function') onFindChanged(true);
    recomputeFind(editor.selectionStart);
});
document.getElementById('findNextBtn').addEventListener('click', () => stepFind(1));
document.getElementById('findPrevBtn').addEventListener('click', () => stepFind(-1));
document.getElementById('replaceBtn').addEventListener('click', replaceCurrentMatch);
document.getElementById('replaceAllBtn').addEventListener('click', replaceEveryMatch);
document.getElementById('findCloseBtn').addEventListener('click', closeFind);

findBar.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        e.preventDefault();
        closeFind();
    } else if (e.key === 'Enter') {
        e.preventDefault();
        if (e.target === replaceInput) replaceCurrentMatch();
        else stepFind(e.shiftKey ? -1 : 1);
    }
});

document.addEventListener('keydown', (e) => {
    if (e.isComposing || e.altKey || !(e.ctrlKey || e.metaKey)) return;
    const key = e.key.toLowerCase();
    if (key !== 'f' && key !== 'h') return;
    if (e.shiftKey && key !== 'f') return;
    const active = document.activeElement;
    const typing = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT');
    if (typing && active !== editor && !findBar.contains(active)) return;
    e.preventDefault();
    openFind(key === 'h', e.shiftKey ? true : undefined);
});

editor.addEventListener('scroll', () => { findLayer.scrollTop = editor.scrollTop; });
if (typeof ResizeObserver === 'function') new ResizeObserver(placeFindLayer).observe(editor);

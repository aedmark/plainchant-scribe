let applyingEdit = false;
let tabReleased = false;
let shiftDown = false;
const elementBar = document.querySelector('.element-bar');
const breadcrumbBar = document.getElementById('breadcrumbBar');
const insertBar = document.querySelector('.insert-bar');
const insertMenuBtn = document.getElementById('insertMenuBtn');
const suggestBox = elementBar.querySelector('.suggestions');
const suggestSay = document.getElementById('suggestSay');
const undoBtn = document.getElementById('undoBtn');
const redoBtn = document.getElementById('redoBtn');
let suggestion = null;
let dismissedFor = '';

const MAX_HISTORY = 150;
let undoStack = [];
let redoStack = [];
let currentSnapshot = null;
let typingBatchOpen = false;
let typingBatchTimer = null;

function captureSnapshot() {
    ensureEntries();
    const entriesCopy = Object.assign({}, projectFiles.entries);
    if (activeFile) entriesCopy[activeFile] = editor.value;
    return {
        entries: entriesCopy,
        activeFile: activeFile,
        activeHtmlFile: activeHtmlFile,
        openTabs: openTabs.slice(),
        tree: Array.isArray(projectFiles.tree) ? projectFiles.tree.map((item) => Object.assign({}, item)) : null,
        assets: assetsForSnapshot(),
        selectedPcId: selectedPcId,
        selStart: editor.selectionStart || 0,
        selEnd: editor.selectionEnd || 0,
        scrollTop: editor.scrollTop || 0
    };
}

function snapshotsEqual(a, b) {
    if (!a || !b) return false;
    const keysA = Object.keys(a.entries);
    const keysB = Object.keys(b.entries);
    if (keysA.length !== keysB.length) return false;
    for (let i = 0; i < keysA.length; i++) {
        const k = keysA[i];
        if (a.entries[k] !== b.entries[k]) return false;
    }
    if (JSON.stringify(a.tree || null) !== JSON.stringify(b.tree || null)) return false;
    if (a.assets && b.assets) {
        const na = Object.keys(a.assets);
        if (na.length !== Object.keys(b.assets).length || na.some((p) => a.assets[p] !== b.assets[p])) return false;
    }
    return true;
}

function updateHistoryButtons() {
    if (undoBtn) undoBtn.disabled = undoStack.length === 0;
    if (redoBtn) redoBtn.disabled = redoStack.length === 0;
}

function resetHistory() {
    clearTimeout(typingBatchTimer);
    typingBatchOpen = false;
    undoStack = [];
    redoStack = [];
    currentSnapshot = captureSnapshot();
    updateHistoryButtons();
}

function pushUndoState() {
    clearTimeout(typingBatchTimer);
    typingBatchOpen = false;
    const snap = currentSnapshot || captureSnapshot();
    if (!undoStack.length || !snapshotsEqual(undoStack[undoStack.length - 1], snap)) {
        undoStack.push(snap);
        if (undoStack.length > MAX_HISTORY) undoStack.shift();
    }
    redoStack = [];
    updateHistoryButtons();
}

function recordHistoryBurst() {
    if (!typingBatchOpen) {
        const snap = currentSnapshot || captureSnapshot();
        if (!undoStack.length || !snapshotsEqual(undoStack[undoStack.length - 1], snap)) {
            undoStack.push(snap);
            if (undoStack.length > MAX_HISTORY) undoStack.shift();
        }
        redoStack = [];
        typingBatchOpen = true;
    }
    clearTimeout(typingBatchTimer);
    typingBatchTimer = setTimeout(() => {
        typingBatchOpen = false;
        currentSnapshot = captureSnapshot();
    }, 600);
}

function syncLatestHistoryState() {
    if (!typingBatchOpen) {
        currentSnapshot = captureSnapshot();
    }
    updateHistoryButtons();
}

function restoreSnapshot(snap) {
    if (!snap) return;
    clearTimeout(typingBatchTimer);
    typingBatchOpen = false;
    projectFiles.entries = Object.assign({}, snap.entries);
    restoreProjectAssets(snap.assets);
    if (snap.tree !== undefined) projectFiles.tree = snap.tree ? snap.tree.map((item) => Object.assign({}, item)) : null;
    if (Array.isArray(snap.openTabs)) openTabs = snap.openTabs.filter((p) => p in projectFiles.entries);
    if (snap.activeHtmlFile && (snap.activeHtmlFile in projectFiles.entries)) {
        activeHtmlFile = snap.activeHtmlFile;
    }
    if (snap.activeFile && (snap.activeFile in projectFiles.entries)) {
        activeFile = snap.activeFile;
        if (!openTabs.includes(activeFile)) openTabs.push(activeFile);
    }
    if (!(activeFile in projectFiles.entries)) activeFile = Object.keys(projectFiles.entries)[0] || 'index.html';
    if (!openTabs.includes(activeFile)) openTabs.push(activeFile);
    activeTab = langForFile(activeFile);
    syncMirrors();
    applyingEdit = true;
    try {
        editor.value = projectFiles.entries[activeFile] || '';
        const maxLen = editor.value.length;
        editor.setSelectionRange(
            Math.min(snap.selStart || 0, maxLen),
            Math.min(snap.selEnd || 0, maxLen)
        );
        editor.scrollTop = snap.scrollTop || 0;
        if (typeof shadeLayer !== 'undefined' && shadeLayer) shadeLayer.scrollTop = editor.scrollTop;
    } finally {
        applyingEdit = false;
    }
    selectedPcId = snap.selectedPcId || null;
    renderFileTabs();
    renderExplorer();
    render(false);
    scheduleAutoSave();
    currentSnapshot = captureSnapshot();
    updateHistoryButtons();
}

function performUndo() {
    if (!undoStack.length) return;
    const live = captureSnapshot();
    const prev = undoStack.pop();
    redoStack.push(live);
    restoreSnapshot(prev);
    showNotice('Undo');
}

function performRedo() {
    if (!redoStack.length) return;
    const live = captureSnapshot();
    const next = redoStack.pop();
    undoStack.push(live);
    restoreSnapshot(next);
    showNotice('Redo');
}

function caretLine() {
    return editor.value.slice(0, editor.selectionStart).split('\n').length - 1;
}

function applyEdit(edit, options = {}) {
    if (!options.skipHistory) pushUndoState();
    const before = editor.value;
    const expected = before.slice(0, edit.from) + edit.insert + before.slice(edit.to);
    const previous = document.activeElement;
    applyingEdit = true;
    try {
        if (options.keepFocus && previous !== editor) {
            editor.value = expected;
            editor.setSelectionRange(edit.selStart, edit.selStart);
            render(false);
            scheduleAutoSave();
        } else {
            editor.focus({ preventScroll: true });
            editor.setSelectionRange(edit.from, edit.to);
            let done = false;
            try { done = document.execCommand('insertText', false, edit.insert); } catch (e) { done = false; }
            if (!done || editor.value !== expected) {
                editor.value = expected;
                editor.dispatchEvent(new Event('input', { bubbles: true }));
            }
            editor.setSelectionRange(edit.selStart, edit.selEnd);
        }
    } finally {
        applyingEdit = false;
    }
    syncBufferFromEditor();
    if (!options.skipHistory) syncLatestHistoryState();
}

function updateBreadcrumbs() {
    if (!breadcrumbBar) return;
    let targetId = selectedPcId;
    if (!targetId && activeTab === 'html') {
        const hit = HtmlAst.nodeAtOffset(currentHtmlAst, editor.selectionStart);
        if (hit) targetId = hit.id;
    }
    const crumbs = DomOutline.breadcrumbs(currentHtmlAst, targetId);
    breadcrumbBar.textContent = '';
    if (!crumbs.length) {
        const span = document.createElement('span');
        span.className = 'crumb-empty';
        span.textContent = activeTab === 'html' ? 'document > body' : activeTab + ' buffer';
        breadcrumbBar.appendChild(span);
        return;
    }
    crumbs.forEach((c, idx) => {
        if (idx > 0) {
            const sep = document.createElement('span');
            sep.className = 'crumb-sep';
            sep.textContent = '›';
            breadcrumbBar.appendChild(sep);
        }
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'crumb-btn' + (c.id === selectedPcId ? ' active' : '');
        btn.dataset.pcId = c.id;
        btn.textContent = '<' + c.label + '>';
        btn.addEventListener('click', () => {
            selectElementById(c.id, { revealCode: true, focusEditor: false });
        });
        breadcrumbBar.appendChild(btn);
    });
}

function insertSnippet(kind) {
    const snippet = Editing.SNIPPETS[kind];
    if (!snippet) return;
    if (activeTab !== 'html') switchFileTab('html');
    const nextHtml = HtmlAst.insertElement(projectFiles.html, selectedPcId, 'inside-end', snippet);
    applyHtmlTransform(nextHtml, selectedPcId);
    showNotice('Inserted <' + kind + '>');
}

function suggestionKey(hit) {
    return activeTab + ':' + caretLine() + ':' + editor.value.slice(hit.from, hit.to);
}

function showSuggestions(hit) {
    suggestion = hit;
    suggestBox.hidden = !hit;
    elementBar.classList.toggle('suggesting', !!hit);
    const labels = hit ? (hit.labels || hit.options) : [];
    suggestSay.textContent = hit ? 'Suggestions: ' + labels.join(', ') : '';
    suggestBox.replaceChildren(...labels.map((label, i) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'suggest-chip';
        chip.dataset.index = String(i);
        chip.textContent = label;
        return chip;
    }));
}

function syncSuggestions() {
    let hit = null;
    if (document.activeElement === editor && editor.selectionStart === editor.selectionEnd) {
        hit = Suggest.at(editor.value, editor.selectionStart, activeTab, projectFiles);
    }
    const key = hit ? suggestionKey(hit) : '';
    if (key !== dismissedFor) dismissedFor = '';
    showSuggestions(hit && key !== dismissedFor ? hit : null);
}

function acceptSuggestion(index) {
    if (!suggestion || !suggestion.options[index]) return;
    applyEdit(Suggest.edit(suggestion, suggestion.options[index]));
    syncElementState();
}

let syncQueued = false;
function syncElementState() {
    syncQueued = false;
    if (activeTab === 'html' && document.activeElement === editor) {
        const node = HtmlAst.nodeAtOffset(currentHtmlAst, editor.selectionStart);
        if (node && node.tag !== 'html' && node.tag !== 'head' && node.id !== selectedPcId) {
            selectedPcId = node.id;
            refreshInspector();
            highlightOnStage(selectedPcId);
        }
    }
    if (!typingBatchOpen && currentSnapshot) {
        currentSnapshot.selStart = editor.selectionStart || 0;
        currentSnapshot.selEnd = editor.selectionEnd || 0;
        currentSnapshot.scrollTop = editor.scrollTop || 0;
        currentSnapshot.selectedPcId = selectedPcId;
    }
    updateBreadcrumbs();
    syncSuggestions();
}

function scheduleSync() {
    if (syncQueued) return;
    syncQueued = true;
    requestAnimationFrame(syncElementState);
}

function setInsertMenuOpen(open) {
    if (!insertBar || !insertMenuBtn) return;
    insertBar.hidden = !open;
    insertMenuBtn.setAttribute('aria-expanded', String(Boolean(open)));
}

if (insertMenuBtn) {
    insertMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        setInsertMenuOpen(insertBar.hidden);
    });
}

insertBar.addEventListener('click', (e) => {
    const btn = e.target.closest('.ins-btn');
    if (btn && btn.dataset.insert) {
        setInsertMenuOpen(false);
        insertSnippet(btn.dataset.insert);
    }
});

document.addEventListener('click', (e) => {
    if (insertBar && !insertBar.hidden && !e.target.closest('.insert-dropdown-wrap')) {
        setInsertMenuOpen(false);
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && insertBar && !insertBar.hidden) {
        setInsertMenuOpen(false);
    }
});

suggestBox.addEventListener('mousedown', (e) => e.preventDefault());
suggestBox.addEventListener('click', (e) => {
    const chip = e.target.closest('.suggest-chip');
    if (chip) acceptSuggestion(Number(chip.dataset.index));
});

editor.addEventListener('keydown', (e) => {
    shiftDown = e.shiftKey;
    if (e.isComposing) return;
    if (e.key === 'Escape') {
        if (suggestion) { dismissedFor = suggestionKey(suggestion); syncSuggestions(); }
        else tabReleased = true;
        return;
    }
    if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        if (tabReleased) { tabReleased = false; return; }
        e.preventDefault();
        if (!e.shiftKey) {
            syncSuggestions();
            if (suggestion && suggestion.tab !== false) { acceptSuggestion(0); return; }
            if (settings.indent && activeTab === 'html') {
                const exp = Editing.expandAbbrev(editor.value, editor.selectionStart, activeTab);
                if (exp) { applyEdit(exp); syncElementState(); return; }
            }
        }
        const pos = editor.selectionStart;
        applyEdit({ from: pos, to: editor.selectionEnd, insert: '  ', selStart: pos + 2, selEnd: pos + 2 });
        return;
    }
    if (e.key !== 'Shift') tabReleased = false;
});

editor.addEventListener('keyup', (e) => { shiftDown = e.shiftKey; scheduleSync(); });
editor.addEventListener('blur', () => { tabReleased = false; shiftDown = false; dismissedFor = ''; showSuggestions(null); });
['click', 'focus', 'pointerup'].forEach((name) => editor.addEventListener(name, scheduleSync));

editor.addEventListener('beforeinput', (e) => {
    if (applyingEdit || e.isComposing || !settings.indent) return;
    if (e.inputType !== 'insertLineBreak' && e.inputType !== 'insertParagraph') return;
    if (shiftDown) return;
    const edit = Editing.enter(editor.value, editor.selectionStart, editor.selectionEnd, activeTab);
    if (!edit) return;
    e.preventDefault();
    applyEdit(edit);
    syncElementState();
});

    editor.addEventListener('input', () => {
    if (!applyingEdit) {
        if (!typingBatchOpen) {
            const snap = currentSnapshot || captureSnapshot();
            undoStack.push(snap);
            if (undoStack.length > MAX_HISTORY) undoStack.shift();
            redoStack = [];
            typingBatchOpen = true;
        }
        clearTimeout(typingBatchTimer);
        typingBatchTimer = setTimeout(() => {
            typingBatchOpen = false;
            currentSnapshot = captureSnapshot();
        }, 600);
    }
    render(true);
    currentSnapshot = captureSnapshot();
    updateHistoryButtons();
    scheduleSync();
    scheduleAutoSave();
});

if (undoBtn) undoBtn.addEventListener('click', performUndo);
if (redoBtn) redoBtn.addEventListener('click', performRedo);

document.addEventListener('keydown', (e) => {
    if (e.isComposing || e.altKey) return;
    if (!(e.ctrlKey || e.metaKey)) return;
    const activeEl = document.activeElement;
    if (activeEl && activeEl !== editor && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
        return;
    }
    const key = e.key.toLowerCase();
    if (key === 'z') {
        e.preventDefault();
        if (e.shiftKey) performRedo();
        else performUndo();
    } else if (key === 'y' && !e.shiftKey) {
        e.preventDefault();
        performRedo();
    }
});

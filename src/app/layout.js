const MOBILE_QUERY = '(max-width: 1023px), (pointer: coarse) and (max-height: 500px)';
const FIT_QUERY = '(pointer: coarse), (max-width: 1023px)';
const mobileMQ = window.matchMedia(MOBILE_QUERY);
const fitMQ = window.matchMedia(FIT_QUERY);
const tabWrite = document.getElementById('tabWrite');
const tabPreview = document.getElementById('tabPreview');
const menuBtn = document.getElementById('menuBtn');
const buttonGroup = document.querySelector('.button-group');
let stageFocusTimer = null;

function setView(view) {
    document.body.dataset.view = view;
    tabWrite.setAttribute('aria-pressed', String(view === 'write'));
    tabPreview.setAttribute('aria-pressed', String(view === 'preview'));
    setMenu(false);
    if (view === 'preview') {
        editor.blur();
    } else if (mobileMQ.matches) {
        editor.focus({ preventScroll: true });
    }
}

const measureCopy = document.createElement('div');

function copyEditorType(el) {
    const cs = getComputedStyle(editor);
    ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'wordSpacing', 'lineHeight', 'tabSize', 'textIndent',
        'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'].forEach((p) => { el.style[p] = cs[p]; });
    const width = editor.getBoundingClientRect().width - (editor.offsetWidth - editor.clientWidth);
    Object.assign(el.style, { boxSizing: 'border-box', width: width + 'px', border: '0', whiteSpace: 'pre-wrap', overflowWrap: 'break-word' });
}

function textTopIn(text, pos) {
    copyEditorType(measureCopy);
    Object.assign(measureCopy.style, { position: 'absolute', visibility: 'hidden', left: '-9999px', top: '0' });
    if (!measureCopy.isConnected) document.body.appendChild(measureCopy);
    const markAt = (before) => {
        measureCopy.textContent = before;
        const mark = document.createElement('span');
        mark.textContent = '\u200b';
        measureCopy.appendChild(mark);
        return mark.getBoundingClientRect().top;
    };
    const top = markAt(text.slice(0, pos)) - markAt('');
    measureCopy.textContent = '';
    return top;
}

function lineHeightPx() {
    const px = parseFloat(getComputedStyle(editor).lineHeight);
    return px > 0 ? px : textTopIn('x\nx', 2);
}

function jumpToLine(line, focusEditor = true) {
    const lines = editor.value.split('\n');
    const clamped = Math.max(0, Math.min(line, lines.length - 1));
    let pos = 0;
    for (let i = 0; i < clamped; i++) pos += lines[i].length + 1;
    const endPos = pos + lines[clamped].length;
    if (focusEditor) editor.focus({ preventScroll: true });
    editor.setSelectionRange(pos, endPos);
    const topPx = textTopIn(editor.value, pos);
    editor.scrollTop = Math.max(0, topPx - editor.clientHeight / 3);
    shadeLayer.scrollTop = editor.scrollTop;
    paintShade();
}

function cancelStageFocusTimer() {
    if (stageFocusTimer) {
        clearTimeout(stageFocusTimer);
        stageFocusTimer = null;
    }
}

function selectElementById(pcId, options = {}) {
    const node = HtmlAst.findById(currentHtmlAst, pcId);
    selectedPcId = node ? node.id : null;
    updateBreadcrumbs();
    refreshInspector();
    highlightOnStage(selectedPcId);

    if (!node) {
        highlightCodeRange(-1, -1);
        return;
    }

    if (options.revealCode !== false && panesShown() !== 'preview') {
        if (activeFile !== activeHtmlFile) {
            openFileInEditor(activeHtmlFile);
        }
        const blockText = editor.value.slice(node.start, node.end);
        const blockLines = blockText.split('\n').length;
        const selFrom = node.start;
        const selTo = blockLines <= 16 ? node.end : node.openEnd;

        highlightCodeRange(selFrom, selTo);

        const topPx = textTopIn(editor.value, selFrom);
        editor.scrollTop = Math.max(0, topPx - editor.clientHeight / 3);
        shadeLayer.scrollTop = editor.scrollTop;

        cancelStageFocusTimer();
        if (options.focusEditor === true) {
            editor.focus({ preventScroll: true });
            editor.setSelectionRange(selFrom, selTo);
        } else {
            if (document.activeElement === editor) {
                editor.blur();
            }
            editor.setSelectionRange(selFrom, selFrom);
        }
    }
}

function setMenu(open) {
    document.body.classList.toggle('menu-open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
}

function fitToViewport(vv = window.visualViewport) {
    const rootStyle = document.documentElement.style;
    if (!vv || !fitMQ.matches) {
        rootStyle.removeProperty('--app-height');
        rootStyle.removeProperty('--app-top');
        document.body.classList.remove('kb-open');
        return;
    }
    rootStyle.setProperty('--app-height', vv.height + 'px');
    rootStyle.setProperty('--app-top', vv.offsetTop + 'px');
    document.body.classList.toggle('kb-open', vv.height < window.innerHeight - 120);
}

tabWrite.addEventListener('click', () => setView('write'));
tabPreview.addEventListener('click', () => setView('preview'));

menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    setMenu(!document.body.classList.contains('menu-open'));
});
buttonGroup.addEventListener('click', () => setMenu(false));
document.addEventListener('click', (e) => {
    if (document.body.classList.contains('menu-open') && !e.target.closest('.button-group')) setMenu(false);
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });

mobileMQ.addEventListener('change', () => { setMenu(false); fitToViewport(); });
fitMQ.addEventListener('change', () => fitToViewport());
if (window.visualViewport) {
    visualViewport.addEventListener('resize', () => fitToViewport());
    visualViewport.addEventListener('scroll', () => fitToViewport());
}

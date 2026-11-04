const shadeLayer = document.createElement('div');
shadeLayer.className = 'editor-shade';
shadeLayer.setAttribute('aria-hidden', 'true');
editor.before(shadeLayer);

let shadeBase = [];
let shadeKeys = [];
let shadeText = null;
let shadeLang = null;
let shadeBroken = false;
let highlightedLines = [-1, -1];

const editorGutter = document.getElementById('editorGutter');
const gutterMeasure = document.createElement('div');
const GUTTER_WRAP_LIMIT = 4000;
let gutterFrame = 0;
let gutterCaretLine = -1;

function scheduleGutter() {
    if (!gutterFrame) gutterFrame = setTimeout(drawGutter, 16);
}

function lineHeights(lines, lineHeight) {
    if (lines.length > GUTTER_WRAP_LIMIT) return lines.map(() => lineHeight);
    copyEditorType(gutterMeasure);
    Object.assign(gutterMeasure.style, { position: 'absolute', visibility: 'hidden', left: '-9999px', top: '0', paddingTop: '0', paddingBottom: '0' });
    const rows = document.createDocumentFragment();
    lines.forEach((line) => {
        const row = document.createElement('div');
        row.textContent = line || '\u200b';
        rows.appendChild(row);
    });
    gutterMeasure.textContent = '';
    gutterMeasure.appendChild(rows);
    document.body.appendChild(gutterMeasure);
    const heights = Array.from(gutterMeasure.children).map((row) => row.getBoundingClientRect().height || lineHeight);
    gutterMeasure.remove();
    return heights;
}

function drawGutter() {
    gutterFrame = 0;
    if (!editorGutter || editor.offsetParent === null) return;
    const lines = editor.value.split('\n');
    const cs = getComputedStyle(editor);
    const lineHeight = parseFloat(cs.lineHeight) || 20;
    Object.assign(editorGutter.style, {
        fontFamily: cs.fontFamily, fontSize: cs.fontSize, lineHeight: cs.lineHeight,
        paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom, width: (String(lines.length).length + 2) + 'ch'
    });
    const heights = lineHeights(lines, lineHeight);
    const rows = document.createDocumentFragment();
    heights.forEach((h, i) => {
        const row = document.createElement('div');
        row.className = 'gl';
        row.style.height = h + 'px';
        row.textContent = String(i + 1);
        rows.appendChild(row);
    });
    editorGutter.textContent = '';
    editorGutter.appendChild(rows);
    gutterCaretLine = -1;
    applyGutterClasses();
    editorGutter.scrollTop = editor.scrollTop;
}

function applyGutterClasses() {
    if (!editorGutter) return;
    const [sLine, eLine] = highlightedLines;
    const rows = editorGutter.children;
    for (let i = 0; i < rows.length; i++) {
        rows[i].classList.toggle('gl-selected', sLine !== -1 && i >= sLine && i <= eLine);
        rows[i].classList.toggle('gl-active', i === gutterCaretLine);
    }
}

function updateGutterCaret() {
    if (document.activeElement !== editor) return;
    const line = editor.value.slice(0, editor.selectionStart).split('\n').length - 1;
    if (line === gutterCaretLine) return;
    gutterCaretLine = line;
    applyGutterClasses();
}

function shadeLine(line, last) {
    const el = document.createElement('span');
    el.className = 'sh-' + line.kind;
    line.runs.forEach((r, i) => {
        let text = r.text;
        if (i === line.runs.length - 1) text += (line.runs.some((x) => x.text) ? '' : '\u200b') + (last ? '' : '\n');
        if (!r.mark) { el.appendChild(document.createTextNode(text)); return; }
        const m = el.appendChild(document.createElement('span'));
        m.className = 'sh-' + r.mark;
        m.textContent = text;
    });
    return el;
}

function lineKey(line) {
    return line.kind + '\u0001' + line.runs.map((r) => (r.mark || '') + '\u0002' + r.text).join('\u0003');
}

function drawShade() {
    scheduleGutter();
    if (typeof refreshFind === 'function') refreshFind();
    if (shadeBroken || !settings.colours) return;
    try {
        const text = editor.value;
        if (shadeLang !== activeTab) {
            shadeLayer.textContent = '';
            shadeKeys = [];
        }
        shadeBase = CodeShade.shade(text, activeTab);
        shadeText = text;
        shadeLang = activeTab;
        paintShade();
    } catch (e) {
        stopShade('the syntax colours could not be drawn', e);
    }
}

function paintShade() {
    if (shadeBroken || !settings.colours || !shadeBase.length) return;
    if (shadeLayer.children.length !== shadeKeys.length) {
        shadeLayer.textContent = '';
        shadeKeys = [];
    }
    const lines = shadeBase.slice();
    const keys = lines.map(lineKey);
    keys[keys.length - 1] += '\u0004';
    let head = 0;
    while (head < keys.length && head < shadeKeys.length && keys[head] === shadeKeys[head]) head++;
    let tail = 0;
    while (tail < keys.length - head && tail < shadeKeys.length - head &&
        keys[keys.length - 1 - tail] === shadeKeys[shadeKeys.length - 1 - tail]) tail++;
    const old = shadeLayer.children;
    for (let k = shadeKeys.length - tail - 1; k >= head; k--) old[k].remove();
    const fresh = document.createDocumentFragment();
    for (let k = head; k < keys.length - tail; k++) fresh.appendChild(shadeLine(lines[k], k === keys.length - 1));
    shadeLayer.insertBefore(fresh, old[head] || null);
    shadeKeys = keys;
    applyLineHighlightClasses();
    placeShade();
    checkShade();
}

function highlightCodeRange(fromOffset, toOffset) {
    if (typeof fromOffset !== 'number' || fromOffset < 0 || (activeTab !== 'html' && activeTab !== 'css')) {
        highlightedLines = [-1, -1];
        applyLineHighlightClasses();
        return;
    }
    const text = editor.value;
    const startLine = text.slice(0, fromOffset).split('\n').length - 1;
    const endLine = text.slice(0, Math.max(fromOffset, toOffset)).split('\n').length - 1;
    highlightedLines = [startLine, endLine];
    applyLineHighlightClasses();
}

function applyLineHighlightClasses() {
    const children = shadeLayer.children;
    const [sLine, eLine] = highlightedLines;
    for (let i = 0; i < children.length; i++) {
        const active = sLine !== -1 && i >= sLine && i <= eLine;
        children[i].classList.toggle('sh-selected-line', active);
    }
    applyGutterClasses();
}

function placeShade() {
    if (shadeBroken || shadeText === null || editor.offsetParent === null) return;
    copyEditorType(shadeLayer);
    Object.assign(shadeLayer.style, { top: editor.offsetTop + 'px', left: editor.offsetLeft + 'px', height: editor.clientHeight + 'px' });
    shadeLayer.scrollTop = editor.scrollTop;
    document.body.classList.add('shaded');
}

function checkShade() {
    if (shadeText === null || editor.offsetParent === null || editor.scrollHeight <= editor.clientHeight + 1) return;
    const cs = getComputedStyle(editor);
    const padTop = parseFloat(cs.paddingTop), padBottom = parseFloat(cs.paddingBottom);
    const layer = getComputedStyle(shadeLayer);
    const textHeight = shadeLayer.scrollHeight - parseFloat(layer.paddingTop) - parseFloat(layer.paddingBottom) -
        (parseFloat(getComputedStyle(shadeLayer, '::after').height) || 0);
    const rest = editor.scrollHeight - padTop - textHeight;
    if (Math.abs(rest - padBottom) > 4 && Math.abs(rest) > 4) stopShade('the syntax colours wrap differently from the editor', rest - padBottom);
}

function setShadeOn(on) {
    if (on) { shadeBroken = false; drawShade(); return; }
    document.body.classList.remove('shaded');
    shadeLayer.textContent = '';
    shadeBase = [];
    shadeKeys = [];
    shadeText = null;
}

function stopShade(why, detail) {
    shadeBroken = true;
    document.body.classList.remove('shaded');
    shadeLayer.textContent = '';
    shadeKeys = [];
    shadeText = null;
    console.warn('Plainchant Web: ' + why + ', so they are off until reload.', detail);
    showNotice('Syntax colours were switched off because they stopped lining up with the text. Turn Syntax colours off and on in Settings, or reload, to bring them back.', true);
}

editor.addEventListener('scroll', () => {
    shadeLayer.scrollTop = editor.scrollTop;
    if (editorGutter) editorGutter.scrollTop = editor.scrollTop;
});
if (typeof ResizeObserver === 'function') new ResizeObserver(() => { placeShade(); checkShade(); scheduleGutter(); }).observe(editor);
window.addEventListener('resize', () => { placeShade(); scheduleGutter(); });
document.addEventListener('selectionchange', updateGutterCaret);
editor.addEventListener('focus', updateGutterCaret);
editor.addEventListener('blur', () => { gutterCaretLine = -1; applyGutterClasses(); });

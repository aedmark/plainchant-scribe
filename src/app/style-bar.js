const styleToolbar = document.getElementById('styleToolbar');
const tbCssTarget = document.getElementById('tbCssTarget');
const tbFontFamily = document.getElementById('tbFontFamily');
const tbFontDec = document.getElementById('tbFontDec');
const tbFontSize = document.getElementById('tbFontSize');
const tbFontInc = document.getElementById('tbFontInc');
const tbBold = document.getElementById('tbBold');
const tbItalic = document.getElementById('tbItalic');
const tbUnderline = document.getElementById('tbUnderline');
const tbStrike = document.getElementById('tbStrike');
const tbAlignBtns = Array.from(document.querySelectorAll('.tb-align'));
const tbLineHeight = document.getElementById('tbLineHeight');
const tbLetterSpacing = document.getElementById('tbLetterSpacing');
const tbColor = document.getElementById('tbColor');
const tbColorBar = document.getElementById('tbColorBar');
const tbBgColor = document.getElementById('tbBgColor');
const tbBgBar = document.getElementById('tbBgBar');

const cssFontFamily = document.getElementById('cssFontFamily');
const cssLineHeight = document.getElementById('cssLineHeight');
const cssLetterSpacing = document.getElementById('cssLetterSpacing');
const cssStyleToggleBtns = Array.from(document.querySelectorAll('#cssStyleToggles [data-style-cmd]'));

let lastStyleBarFontSig = '';
let lastStyleBarSizeKind = '';
let activeFontPresets = Typography.FONT_PRESETS;

function fillDatalist(id, items) {
    const dl = document.getElementById(id);
    if (!dl) return;
    dl.textContent = '';
    items.forEach((val) => {
        const opt = document.createElement('option');
        opt.value = val;
        dl.appendChild(opt);
    });
}

function isReflowableBook() {
    return typeof isBookProject === 'function' && isBookProject()
        && !(typeof isFixedStagePage === 'function' && isFixedStagePage());
}

function currentFontPresets() {
    if (typeof isBookProject === 'function' && isBookProject()) {
        const embedded = (typeof BookFonts !== 'undefined' && projectFiles && projectFiles.entries)
            ? BookFonts.list(projectFiles.entries).map((f) => f.family)
            : [];
        return Typography.mergeFontOptions(embedded, Typography.BOOK_FONT_PRESETS);
    }
    return Typography.FONT_PRESETS;
}

function fillFontSelect(sel, presets) {
    if (!sel) return;
    sel.textContent = '';
    sel.add(new Option('(inherit)', ''));
    (presets || Typography.FONT_PRESETS).forEach((p) => sel.add(new Option(p.label, p.value)));
}

function syncToolbarPresets() {
    const presets = currentFontPresets();
    const fontSig = presets.map((p) => p.label + '\x00' + p.value).join('\n');
    if (fontSig !== lastStyleBarFontSig) {
        lastStyleBarFontSig = fontSig;
        activeFontPresets = presets;
        fillFontSelect(tbFontFamily, presets);
        fillFontSelect(cssFontFamily, presets);
    }
    const sizeKind = isReflowableBook() ? 'book' : 'web';
    if (sizeKind !== lastStyleBarSizeKind) {
        lastStyleBarSizeKind = sizeKind;
        fillDatalist('fontSizePresets', sizeKind === 'book' ? Typography.BOOK_FONT_SIZES : Typography.FONT_SIZES);
    }
}

function setFontSelectValue(sel, rawVal) {
    if (!sel) return;
    Array.from(sel.options).forEach((o) => { if (o.dataset.custom === '1') o.remove(); });
    const matched = Typography.matchFontPreset(rawVal, activeFontPresets);
    if (!matched) {
        sel.value = '';
        return;
    }
    const known = Array.from(sel.options).some((o) => o.value === matched);
    if (!known) {
        const opt = new Option(matched, matched);
        opt.dataset.custom = '1';
        sel.add(opt);
    }
    sel.value = matched;
}

function readCurrentCssState() {
    const node = selectedPcId ? HtmlAst.findById(currentHtmlAst, selectedPcId) : null;
    let decls = {};
    if (activeCssTarget === 'inline') {
        decls = node && node.attrs ? CssAst.parseInlineStyle(node.attrs.style || '') : {};
    } else if (activeCssTarget) {
        decls = CssAst.getDeclarations(currentCssAst, activeCssTarget);
    }
    return { node: node, decls: decls, comp: lastComputedStyle || {} };
}

function refreshStyleToolbarTargets(options, cssLabel) {
    if (!tbCssTarget) return;
    tbCssTarget.textContent = '';
    (options || []).forEach((opt) => {
        const el = document.createElement('option');
        el.value = opt;
        el.textContent = opt === 'inline' ? 'inline style' : opt + ' (' + (cssLabel || 'styles.css') + ')';
        el.selected = opt === activeCssTarget;
        tbCssTarget.appendChild(el);
    });
    tbCssTarget.value = activeCssTarget;
}

function refreshStyleToolbar(node, decls, comp) {
    syncToolbarPresets();
    const d = decls || {};
    const c = comp || {};
    if (tbCssTarget && activeCssTarget) {
        if (!Array.from(tbCssTarget.options).some((o) => o.value === activeCssTarget)) {
            const label = activeCssTarget === 'inline' ? 'inline style' : activeCssTarget + ' (' + (activeCssFile || 'styles.css') + ')';
            tbCssTarget.prepend(new Option(label, activeCssTarget));
        }
        tbCssTarget.value = activeCssTarget;
    }
    setFontSelectValue(tbFontFamily, d['font-family'] || '');
    setFontSelectValue(cssFontFamily, d['font-family'] || '');

    if (tbFontSize) {
        tbFontSize.value = d['font-size'] || '';
        tbFontSize.placeholder = c.fontSize || 'size';
    }

    const boldOn = d['font-weight'] ? Typography.isBoldValue(d['font-weight']) : Typography.isBoldValue(c.fontWeight);
    const italicOn = d['font-style'] ? Typography.isItalicValue(d['font-style']) : Typography.isItalicValue(c.fontStyle);
    const dec = Typography.decorationLines(d['text-decoration'] || d['text-decoration-line'] || c.textDecoration);

    if (tbBold) tbBold.setAttribute('aria-pressed', String(boldOn));
    if (tbItalic) tbItalic.setAttribute('aria-pressed', String(italicOn));
    if (tbUnderline) tbUnderline.setAttribute('aria-pressed', String(dec.underline));
    if (tbStrike) tbStrike.setAttribute('aria-pressed', String(dec.lineThrough));

    const toggleState = { bold: boldOn, italic: italicOn, underline: dec.underline, strike: dec.lineThrough };
    cssStyleToggleBtns.forEach((btn) => {
        btn.setAttribute('aria-pressed', String(Boolean(toggleState[btn.dataset.styleCmd])));
    });

    const activeAlign = Typography.normalizeAlign(d['text-align'] || c.textAlign);
    tbAlignBtns.forEach((btn) => btn.setAttribute('aria-pressed', String(btn.dataset.align === activeAlign)));

    const lhVal = d['line-height'] || '';
    const lhHint = c.lineHeight && c.lineHeight !== 'normal' ? c.lineHeight : 'normal';
    if (tbLineHeight) { tbLineHeight.value = lhVal; tbLineHeight.placeholder = lhHint; }
    if (cssLineHeight) { cssLineHeight.value = lhVal; cssLineHeight.placeholder = lhHint; }

    const lsVal = d['letter-spacing'] || '';
    const lsHint = c.letterSpacing && c.letterSpacing !== 'normal' ? c.letterSpacing : '0em';
    if (tbLetterSpacing) { tbLetterSpacing.value = lsVal; tbLetterSpacing.placeholder = lsHint; }
    if (cssLetterSpacing) { cssLetterSpacing.value = lsVal; cssLetterSpacing.placeholder = lsHint; }

    const colorHex = rgbToHex(d['color']) || rgbToHex(c.color);
    const rawColor = d['color'];
    if (tbColor && colorHex) tbColor.value = colorHex;
    if (tbColorBar) tbColorBar.style.background = (rawColor && !/^var\(/i.test(rawColor.trim())) ? rawColor : (colorHex || 'var(--text-strong)');

    const bgHex = rgbToHex(d['background-color']) || rgbToHex(c.backgroundColor);
    const rawBg = d['background-color'];
    if (tbBgColor && bgHex) tbBgColor.value = bgHex;
    if (tbBgBar) tbBgBar.style.background = (rawBg && !/^var\(/i.test(rawBg.trim())) ? rawBg : (bgHex || 'transparent');
}

function runStyleToggle(cmd) {
    const { node, decls, comp } = readCurrentCssState();
    const tag = node ? node.tag : '';
    if (cmd === 'bold') {
        applyCssPropertyChange('font-weight', Typography.toggleBold(decls['font-weight'], comp.fontWeight));
    } else if (cmd === 'italic') {
        applyCssPropertyChange('font-style', Typography.toggleItalic(decls['font-style'], comp.fontStyle));
    } else if (cmd === 'underline') {
        applyCssPropertyChange('text-decoration', Typography.toggleDecoration(decls['text-decoration'] || decls['text-decoration-line'], comp.textDecoration, 'underline', tag));
    } else if (cmd === 'strike') {
        applyCssPropertyChange('text-decoration', Typography.toggleDecoration(decls['text-decoration'] || decls['text-decoration-line'], comp.textDecoration, 'line-through', tag));
    }
}

function bindCommitInput(el, prop) {
    if (!el) return;
    el.addEventListener('change', () => applyCssPropertyChange(prop, el.value));
    el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            applyCssPropertyChange(prop, el.value);
        }
    });
}

fillDatalist('lineHeightPresets', Typography.LINE_HEIGHTS);
fillDatalist('letterSpacingPresets', Typography.LETTER_SPACINGS);
syncToolbarPresets();

if (tbCssTarget) {
    tbCssTarget.addEventListener('change', () => {
        activeCssTarget = tbCssTarget.value;
        pinnedCssTarget = null;
        if (cssTargetSelect) cssTargetSelect.value = activeCssTarget;
        const node = selectedPcId ? HtmlAst.findById(currentHtmlAst, selectedPcId) : null;
        populateCssValues(node);
    });
}

[tbFontFamily, cssFontFamily].forEach((sel) => {
    if (sel) sel.addEventListener('change', () => applyCssPropertyChange('font-family', sel.value));
});

bindCommitInput(tbFontSize, 'font-size');
bindCommitInput(tbLineHeight, 'line-height');
bindCommitInput(tbLetterSpacing, 'letter-spacing');
bindCommitInput(cssLineHeight, 'line-height');
bindCommitInput(cssLetterSpacing, 'letter-spacing');

function stepToolbarFontSize(delta) {
    const { decls, comp } = readCurrentCssState();
    const opts = isReflowableBook() ? { preferRelative: true } : null;
    applyCssPropertyChange('font-size', Typography.stepFontSize(decls['font-size'], comp.fontSize, delta, opts));
}

if (tbFontDec) tbFontDec.addEventListener('click', () => stepToolbarFontSize(-1));
if (tbFontInc) tbFontInc.addEventListener('click', () => stepToolbarFontSize(1));

if (tbBold) tbBold.addEventListener('click', () => runStyleToggle('bold'));
if (tbItalic) tbItalic.addEventListener('click', () => runStyleToggle('italic'));
if (tbUnderline) tbUnderline.addEventListener('click', () => runStyleToggle('underline'));
if (tbStrike) tbStrike.addEventListener('click', () => runStyleToggle('strike'));
cssStyleToggleBtns.forEach((btn) => btn.addEventListener('click', () => runStyleToggle(btn.dataset.styleCmd)));

tbAlignBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
        const { decls } = readCurrentCssState();
        applyCssPropertyChange('text-align', Typography.toggleAlign(decls['text-align'], btn.dataset.align));
    });
});

if (tbColor) {
    tbColor.addEventListener('input', () => {
        applyCssPropertyChange('color', tbColor.value, { coalesceHistory: true });
    });
}
if (tbBgColor) {
    tbBgColor.addEventListener('input', () => {
        applyCssPropertyChange('background-color', tbBgColor.value, { coalesceHistory: true });
    });
}

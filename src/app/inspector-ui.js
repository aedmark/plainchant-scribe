const inspTabs = Array.from(document.querySelectorAll('.insp-tab'));
const inspPropsPane = document.getElementById('inspPropsPane');
const inspCssPane = document.getElementById('inspCssPane');
const inspSelectedTag = document.getElementById('inspSelectedTag');
const inspMoveUpBtn = document.getElementById('inspMoveUpBtn');
const inspMoveDownBtn = document.getElementById('inspMoveDownBtn');
const inspDupBtn = document.getElementById('inspDupBtn');
const inspWrapBtn = document.getElementById('inspWrapBtn');
const inspDeleteBtn = document.getElementById('inspDeleteBtn');

const propId = document.getElementById('propId');
const propClass = document.getElementById('propClass');
const propText = document.getElementById('propText');
const propHref = document.getElementById('propHref');
const propFollowBtn = document.getElementById('propFollowBtn');
const propSrc = document.getElementById('propSrc');
const propSrcBrowseBtn = document.getElementById('propSrcBrowseBtn');
const propAlt = document.getElementById('propAlt');
const propTitle = document.getElementById('propTitle');

const cssTargetSelect = document.getElementById('cssTargetSelect');
const cssJumpRuleBtn = document.getElementById('cssJumpRuleBtn');
const cssCustomSelector = document.getElementById('cssCustomSelector');
const cssAddRuleBtn = document.getElementById('cssAddRuleBtn');
const cssBoxSummary = document.getElementById('cssBoxSummary');

const cssInputs = {
    'display': document.getElementById('cssDisplay'),
    'padding': document.getElementById('cssPadding'),
    'margin': document.getElementById('cssMargin'),
    'gap': document.getElementById('cssGap'),
    'width': document.getElementById('cssWidth'),
    'max-width': document.getElementById('cssMaxWidth'),
    'font-size': document.getElementById('cssFontSize'),
    'text-align': document.getElementById('cssTextAlign'),
    'border-radius': document.getElementById('cssRadius'),
    'color': document.getElementById('cssColor'),
    'background-color': document.getElementById('cssBg'),
    'background-image': document.getElementById('cssBgImage')
};
const cssColorPicker = document.getElementById('cssColorPicker');
const cssBgPicker = document.getElementById('cssBgPicker');

let activeInspectorTab = 'props';
let activeCssTarget = '';
let pinnedCssTarget = null;
let lastComputedStyle = null;

function rgbToHex(color) {
    if (!color || typeof color !== 'string') return null;
    const trimmed = color.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase();
    if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
        return ('#' + trimmed[1] + trimmed[1] + trimmed[2] + trimmed[2] + trimmed[3] + trimmed[3]).toLowerCase();
    }
    const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/.exec(trimmed);
    if (!m) return null;
    if (m[4] !== undefined && parseFloat(m[4]) === 0) return null;
    const hex = (n) => Math.max(0, Math.min(255, parseInt(n, 10))).toString(16).padStart(2, '0');
    return '#' + hex(m[1]) + hex(m[2]) + hex(m[3]);
}

function setStageComputedStyle(computed) {
    lastComputedStyle = computed || null;
    const node = selectedPcId ? HtmlAst.findById(currentHtmlAst, selectedPcId) : null;
    populateCssValues(node);
}

function switchInspectorTab(tab, options) {
    const forceOpen = Boolean(options && options.forceOpen);
    if (forceOpen && typeof toggleInspector === 'function' && inspectorPanel.hidden) {
        toggleInspector(true);
    }
    if (activeInspectorTab === tab && !inspectorFloating && !forceOpen) {
        setInspectorCollapsed(!inspectorCollapsed);
        return;
    }
    if (inspectorCollapsed) {
        setInspectorCollapsed(false);
    }
    activeInspectorTab = tab;
    inspTabs.forEach((b) => b.setAttribute('aria-selected', String(b.dataset.insp === tab)));
    inspPropsPane.hidden = tab !== 'props';
    inspCssPane.hidden = tab !== 'css';
    inspPartsPane.hidden = tab !== 'parts';
    if (tab === 'parts') refreshPartsUi();
    inspProblemsPane.hidden = tab !== 'problems';
    if (tab === 'problems') runProblemsCheck();
    inspBookPane.hidden = tab !== 'book';
    if (tab === 'book') refreshBookPanel(true);
    inspChaptersPane.hidden = tab !== 'chapters';
    if (tab === 'chapters') refreshChapters();
    inspLayoutPane.hidden = tab !== 'layout';
    if (tab === 'layout') refreshLayout();
}

function defaultSelectorFor(node) {
    if (!node) return 'body';
    if (node.attrs && node.attrs.id) return '#' + node.attrs.id;
    if (node.attrs && node.attrs.class) {
        const firstClass = node.attrs.class.trim().split(/\s+/)[0];
        if (firstClass) return '.' + firstClass;
    }
    return node.tag;
}

function refreshInspector() {
    const node = selectedPcId ? HtmlAst.findById(currentHtmlAst, selectedPcId) : null;
    const hasNode = Boolean(node && node.tag !== 'html' && node.tag !== 'head');
    const isMovable = Boolean(hasNode && node.tag !== 'body');

    inspSelectedTag.textContent = hasNode ? '<' + DomOutline.formatLabel(node) + '> (line ' + (node.line + 1) + ')' : 'No element selected';
    inspSelectedTag.title = inspSelectedTag.textContent;
    if (inspMoveUpBtn) inspMoveUpBtn.disabled = !isMovable;
    if (inspMoveDownBtn) inspMoveDownBtn.disabled = !isMovable;
    if (inspDupBtn) inspDupBtn.disabled = !isMovable;
    inspWrapBtn.disabled = !isMovable;
    inspDeleteBtn.disabled = !isMovable;
    inspPartBtn.disabled = !isMovable;

    [propId, propClass, propText, propHref, propSrc, propAlt, propTitle].forEach((input) => {
        if (!input) return;
        input.disabled = !hasNode;
        if (!hasNode) input.value = '';
    });

    if (hasNode) {
        propId.value = node.attrs.id || '';
        propClass.value = node.attrs.class || '';
        const hasElementChildren = node.children.some((c) => c.type === 'element');
        propText.disabled = hasElementChildren || node.selfClosing;
        propText.value = (!hasElementChildren && !node.selfClosing) ? HtmlAst.unescapeHtml(HtmlAst.innerText(currentHtmlAst, node.id).trim()) : '';
        propHref.value = node.attrs.href || '';
        propFollowBtn.disabled = !projectLinkTarget(propHref.value);
        propSrcBrowseBtn.disabled = false;
        propSrc.value = node.attrs.src || '';
        propAlt.value = node.attrs.alt || '';
        if (propTitle) propTitle.value = node.attrs.title || '';
    } else {
        lastComputedStyle = null;
        propFollowBtn.disabled = true;
        propSrcBrowseBtn.disabled = true;
    }

    populateCssTargets(hasNode ? node : null);
    populateCssValues(hasNode ? node : null);
}

function populateCssTargets(node) {
    const options = [];
    if (node) {
        const matched = CssAst.findRulesForElement(currentCssAst, node);
        matched.forEach((r) => {
            if (options.indexOf(r.selector) === -1) options.push(r.selector);
        });
        const def = defaultSelectorFor(node);
        if (options.indexOf(def) === -1) options.unshift(def);
        options.push('inline');
    } else {
        const all = CssAst.listSelectors(currentCssAst, currentHtmlAst);
        all.rules.forEach((r) => options.push(r));
        if (!options.length) options.push('body');
    }

    if (pinnedCssTarget && options.indexOf(pinnedCssTarget) === -1) {
        options.unshift(pinnedCssTarget);
    }

    if (!activeCssTarget || options.indexOf(activeCssTarget) === -1) {
        activeCssTarget = options[0] || 'body';
    }

    cssTargetSelect.textContent = '';
    const cssLabel = activeCssFile || 'styles.css';
    options.forEach((opt) => {
        const el = document.createElement('option');
        el.value = opt;
        el.textContent = opt === 'inline' ? 'element.style (inline)' : opt + ' (' + cssLabel + ')';
        el.selected = opt === activeCssTarget;
        cssTargetSelect.appendChild(el);
    });
    if (typeof refreshStyleToolbarTargets === 'function') refreshStyleToolbarTargets(options, cssLabel);
}

function populateCssValues(node) {
    let decls = {};
    if (activeCssTarget === 'inline') {
        decls = node && node.attrs ? CssAst.parseInlineStyle(node.attrs.style || '') : {};
    } else if (activeCssTarget) {
        decls = CssAst.getDeclarations(currentCssAst, activeCssTarget);
    }

    const comp = lastComputedStyle || {};
    const compMap = {
        'padding': comp.padding,
        'margin': comp.margin,
        'gap': comp.gap,
        'width': comp.width,
        'max-width': comp.maxWidth && comp.maxWidth !== 'none' ? comp.maxWidth : '',
        'font-size': comp.fontSize,
        'border-radius': comp.borderRadius,
        'color': rgbToHex(comp.color) || comp.color,
        'background-color': rgbToHex(comp.backgroundColor) || comp.backgroundColor
    };

    Object.keys(cssInputs).forEach((prop) => {
        const input = cssInputs[prop];
        if (!input) return;
        input.value = decls[prop] || '';
        if (input.tagName === 'INPUT' && compMap[prop]) {
            input.placeholder = String(compMap[prop]);
        }
    });

    const colorHex = rgbToHex(decls['color']) || rgbToHex(comp.color);
    if (colorHex) cssColorPicker.value = colorHex;
    const bgHex = rgbToHex(decls['background-color']) || rgbToHex(comp.backgroundColor);
    if (bgHex) cssBgPicker.value = bgHex;

    if (cssBoxSummary) {
        if (comp.width && comp.height) {
            cssBoxSummary.textContent = 'Box: ' + comp.width + '×' + comp.height +
                ' · pad ' + (comp.padding || '0px') + ' · margin ' + (comp.margin || '0px');
        } else {
            cssBoxSummary.textContent = '';
        }
    }
    if (typeof refreshStyleToolbar === 'function') refreshStyleToolbar(node, decls, comp);
}

function applyCssPropertyChange(prop, value, options) {
    const node = selectedPcId ? HtmlAst.findById(currentHtmlAst, selectedPcId) : null;
    if (activeCssTarget === 'inline') {
        if (!node) return;
        const map = CssAst.parseInlineStyle(node.attrs.style || '');
        if (!value || !String(value).trim()) delete map[prop];
        else map[prop] = String(value).trim();
        const formatted = CssAst.formatInlineStyle(map);
        const nextHtml = HtmlAst.setAttr(projectFiles.html, node.id, 'style', formatted || null);
        applyHtmlTransform(nextHtml, node.id, options);
        return;
    }
    const sel = activeCssTarget || defaultSelectorFor(node);
    const nextCss = CssAst.setProperty(projectFiles.css, sel, prop, value);
    applyCssTransform(nextCss, options);
}

function moveSelectedElement(direction, optId) {
    const id = optId || selectedPcId;
    if (!id) return;
    const res = HtmlAst.moveElement(projectFiles.html, id, direction);
    if (!res.moved) {
        showNotice('Cannot move element further ' + direction);
        return;
    }
    applyHtmlTransform(res.html, res.newId);
    showNotice('Moved element ' + direction);
}

function duplicateSelectedElement(optId) {
    const id = optId || selectedPcId;
    if (!id) return;
    const res = HtmlAst.duplicateElement(projectFiles.html, id);
    if (!res.newId || res.html === projectFiles.html) return;
    applyHtmlTransform(res.html, res.newId);
    showNotice('Duplicated element');
}

function deleteSelectedElement() {
    if (!selectedPcId) return;
    const node = HtmlAst.findById(currentHtmlAst, selectedPcId);
    if (!node || node.tag === 'body' || node.tag === 'html') return;
    const parentId = node.parentId;
    const nextHtml = HtmlAst.removeElement(projectFiles.html, selectedPcId);
    selectedPcId = null;
    applyHtmlTransform(nextHtml, parentId);
    showNotice('Deleted <' + node.tag + '>');
}

function jumpToActiveCssRule() {
    if (activeCssTarget === 'inline') {
        if (selectedPcId) selectElementById(selectedPcId, { revealCode: true, focusEditor: true });
        return;
    }
    const targetFile = activeCssFile || 'styles.css';
    const sel = activeCssTarget;
    let rule = CssAst.findRuleBySelector(currentCssAst, sel);
    if (!rule && sel) {
        const nextCss = (projectFiles.css ? projectFiles.css.replace(/\s*$/, '\n\n') : '') + sel + ' {\n  \n}\n';
        applyCssTransform(nextCss);
        rule = CssAst.findRuleBySelector(currentCssAst, sel);
    }
    if (panesShown() === 'preview') setPanes('both');
    openFileInEditor(targetFile);
    if (rule) {
        highlightCodeRange(rule.start, rule.end);
        editor.focus({ preventScroll: true });
        editor.setSelectionRange(rule.start, rule.end);
        const topPx = textTopIn(editor.value, rule.start);
        editor.scrollTop = Math.max(0, topPx - editor.clientHeight / 3);
        shadeLayer.scrollTop = editor.scrollTop;
    }
}

inspTabs.forEach((b) => b.addEventListener('click', () => switchInspectorTab(b.dataset.insp)));

propId.addEventListener('change', () => {
    if (!selectedPcId) return;
    const val = propId.value.trim();
    applyHtmlTransform(HtmlAst.setAttr(projectFiles.html, selectedPcId, 'id', val || null), selectedPcId);
});

propClass.addEventListener('change', () => {
    if (!selectedPcId) return;
    const val = propClass.value.trim();
    applyHtmlTransform(HtmlAst.setAttr(projectFiles.html, selectedPcId, 'class', val || null), selectedPcId);
});

propText.addEventListener('change', () => {
    if (!selectedPcId) return;
    applyHtmlTransform(HtmlAst.setText(projectFiles.html, selectedPcId, propText.value), selectedPcId);
});

propFollowBtn.addEventListener('click', () => followProjectLink(propHref.value));
propHref.addEventListener('change', () => {
    if (!selectedPcId) return;
    applyHtmlTransform(HtmlAst.setAttr(projectFiles.html, selectedPcId, 'href', propHref.value.trim() || null), selectedPcId);
});

propSrc.addEventListener('change', () => {
    if (!selectedPcId) return;
    applyHtmlTransform(HtmlAst.setAttr(projectFiles.html, selectedPcId, 'src', propSrc.value.trim() || null), selectedPcId);
});

propAlt.addEventListener('change', () => {
    if (!selectedPcId) return;
    applyHtmlTransform(HtmlAst.setAttr(projectFiles.html, selectedPcId, 'alt', propAlt.value.trim() || null), selectedPcId);
});

if (propTitle) {
    propTitle.addEventListener('change', () => {
        if (!selectedPcId) return;
        applyHtmlTransform(HtmlAst.setAttr(projectFiles.html, selectedPcId, 'title', propTitle.value.trim() || null), selectedPcId);
    });
}

if (inspMoveUpBtn) inspMoveUpBtn.addEventListener('click', () => moveSelectedElement('up'));
if (inspMoveDownBtn) inspMoveDownBtn.addEventListener('click', () => moveSelectedElement('down'));
if (inspDupBtn) inspDupBtn.addEventListener('click', () => duplicateSelectedElement());

inspWrapBtn.addEventListener('click', () => {
    if (!selectedPcId) return;
    const nextHtml = HtmlAst.wrapElement(projectFiles.html, selectedPcId, 'div', { class: 'wrapper' });
    applyHtmlTransform(nextHtml, selectedPcId);
});

inspDeleteBtn.addEventListener('click', deleteSelectedElement);

cssTargetSelect.addEventListener('change', () => {
    activeCssTarget = cssTargetSelect.value;
    pinnedCssTarget = null;
    const node = selectedPcId ? HtmlAst.findById(currentHtmlAst, selectedPcId) : null;
    populateCssValues(node);
});

if (cssJumpRuleBtn) cssJumpRuleBtn.addEventListener('click', jumpToActiveCssRule);

cssAddRuleBtn.addEventListener('click', () => {
    const custom = cssCustomSelector.value.trim();
    if (!custom) return;
    activeCssTarget = custom;
    pinnedCssTarget = custom;
    cssCustomSelector.value = '';
    const known = Array.from(cssTargetSelect.options).find((o) => o.value === activeCssTarget);
    if (known) {
        known.selected = true;
    } else {
        const opt = document.createElement('option');
        opt.value = activeCssTarget;
        opt.textContent = activeCssTarget + ' (' + (activeCssFile || 'styles.css') + ')';
        opt.selected = true;
        cssTargetSelect.prepend(opt);
    }
    const node = selectedPcId ? HtmlAst.findById(currentHtmlAst, selectedPcId) : null;
    populateCssValues(node);
});

Object.keys(cssInputs).forEach((prop) => {
    const input = cssInputs[prop];
    if (!input) return;
    input.addEventListener('change', () => applyCssPropertyChange(prop, input.value));
});

cssColorPicker.addEventListener('input', () => {
    cssInputs['color'].value = cssColorPicker.value;
    applyCssPropertyChange('color', cssColorPicker.value, { coalesceHistory: true });
});

cssBgPicker.addEventListener('input', () => {
    cssInputs['background-color'].value = cssBgPicker.value;
    applyCssPropertyChange('background-color', cssBgPicker.value, { coalesceHistory: true });
});

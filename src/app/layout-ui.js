const cssLayoutGroup = document.getElementById('cssLayoutGroup');
const layoutSelects = {
    'flex-direction': document.getElementById('cssFlexDir'),
    'flex-wrap': document.getElementById('cssFlexWrap'),
    'justify-content': document.getElementById('cssJustify'),
    'align-items': document.getElementById('cssAlign')
};
const LAYOUT_ALIASES = { normal: { 'justify-content': 'flex-start', 'align-items': 'stretch' }, start: 'flex-start', end: 'flex-end', 'self-start': 'flex-start', 'self-end': 'flex-end', 'wrap-reverse': 'wrap' };

function layoutShownValue(prop, value, info) {
    const alias = LAYOUT_ALIASES[value];
    if (alias && typeof alias === 'object') return alias[prop] || value;
    return alias && !(info.kind === 'grid' && prop !== 'justify-content' && prop !== 'align-items') ? alias : value;
}

function showLayoutInfo(info) {
    const live = Boolean(info && info.display && info.id === selectedPcId && stageMode === 'design');
    cssLayoutGroup.hidden = !live;
    if (!live) return;
    const current = { 'flex-direction': info.direction, 'flex-wrap': info.wrap, 'justify-content': info.justify, 'align-items': info.align };
    Object.keys(layoutSelects).forEach((prop) => {
        const select = layoutSelects[prop];
        select.closest('.insp-field').hidden = info.kind === 'grid' && (prop === 'flex-direction' || prop === 'flex-wrap');
        const value = layoutShownValue(prop, current[prop], info);
        if (!Array.from(select.options).some((o) => o.value === value)) select.add(new Option(value, value));
        select.value = value;
    });
}

Object.keys(layoutSelects).forEach((prop) => {
    layoutSelects[prop].addEventListener('change', () => applyCssPropertyChange(prop, layoutSelects[prop].value));
});

window.addEventListener('message', (e) => {
    if (e.source !== stageFrame.contentWindow) return;
    const data = e.data || {};
    if (data.type === 'pc-layout-info') {
        showLayoutInfo(data);
    } else if (data.type === 'pc-layout-gap' && data.id === selectedPcId && typeof data.prop === 'string' && Number.isFinite(data.value)) {
        applyCssPropertyChange(data.prop, data.value + 'px');
        if (cssInputs[data.prop]) cssInputs[data.prop].value = data.value + 'px';
        showNotice('Set ' + data.prop + ' to ' + data.value + 'px.');
    }
});
document.querySelectorAll('.mode-btn').forEach((b) => b.addEventListener('click', () => { if (b.dataset.mode !== 'design') cssLayoutGroup.hidden = true; }));

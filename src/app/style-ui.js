// The Layout tab (P4-01, D-031): paragraph, line height, justification, hyphenation, and widows and orphans, written
// by BookStyle as one marked block at the end of the book's main stylesheet. Each change is one undo step.

const inspLayoutPane = document.getElementById('inspLayoutPane');
const layoutInputs = Array.from(inspLayoutPane.querySelectorAll('[data-layout]'));

function layoutTarget() {
    return isBookProject() ? BookStyle.stylesheet(projectFiles.entries) : null;
}

function layoutLanguage() {
    const model = Book.read(projectFiles.entries).model;
    return model ? model.metadata.language : 'en';
}

function showLayout(settings, path) {
    const s = BookStyle.normalise(settings);
    layoutInputs.forEach((el) => {
        const v = s[el.dataset.layout];
        if (el.type === 'checkbox') el.checked = !!v;
        else el.value = v == null ? '' : String(v);
    });
    const preset = BookStyle.presetOf(s);
    inspLayoutPane.querySelectorAll('[data-layout-preset]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.layoutPreset === preset)));
    inspLayoutPane.querySelector('[data-layout="size"]').disabled = s.paragraph === 'none';
    document.getElementById('layoutWhere').textContent = path ? 'Written at the end of ' + path + '.' : 'This book has no stylesheet to write to.';
}

function refreshLayout() {
    if (!isBookProject() || inspLayoutPane.hidden) return;
    if (inspLayoutPane.contains(document.activeElement) && document.activeElement.type === 'text') return;
    const lh = inspLayoutPane.querySelector('[data-layout="lineHeight"]');
    if (!lh.options.length) {
        const add = (v, t) => { const o = document.createElement('option'); o.value = v; o.textContent = t; lh.appendChild(o); };
        add('', 'Leave to the reader');
        BookStyle.LINE_HEIGHTS.forEach((v) => add(String(v), String(v)));
    }
    const path = layoutTarget();
    const settings = path ? BookStyle.read(projectFiles.entries[path]) : null;
    showLayout(settings || BookStyle.PRESETS.plain.settings, path);
}

function writeLayout(settings) {
    syncBufferFromEditor();
    const path = layoutTarget();
    if (!path) { showNotice('This book has no stylesheet for the layout block.', true); return; }
    const next = BookStyle.apply(projectFiles.entries[path], settings, layoutLanguage());
    if (next === projectFiles.entries[path]) { refreshLayout(); return; }
    applyFileText(path, next);
    refreshLayout();
}

function layoutFromInputs() {
    const s = {};
    layoutInputs.forEach((el) => { s[el.dataset.layout] = el.type === 'checkbox' ? el.checked : el.value; });
    return s;
}

layoutInputs.forEach((el) => el.addEventListener('change', () => {
    if (el.dataset.layout === 'size' && !(Number(el.value) > 0)) { showNotice('The indent or space is a number of em, such as 1.5.', true); refreshLayout(); return; }
    writeLayout(layoutFromInputs());
}));
inspLayoutPane.querySelectorAll('[data-layout-preset]').forEach((b) => b.addEventListener('click', () => writeLayout(BookStyle.PRESETS[b.dataset.layoutPreset].settings)));

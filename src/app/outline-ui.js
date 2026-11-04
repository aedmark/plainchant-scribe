const outlineModal = document.getElementById('outline-modal');
const outlineList = document.getElementById('outline-list');
const outlineFilter = document.getElementById('outlineFilter');
const domStatsBadge = document.getElementById('domStatsBadge');

function renderOutline() {
    syncBufferFromEditor();
    const st = Project.stats(projectFiles);
    if (domStatsBadge) {
        domStatsBadge.textContent = st.elements + ' elements · ' + st.rules + ' CSS rules · ' + st.jsLines + ' JS lines';
    }
    const all = DomOutline.build(currentHtmlAst);
    const items = DomOutline.filter(all, outlineFilter.value);
    outlineList.textContent = '';

    if (!items.length) {
        const empty = document.createElement('p');
        empty.className = 'empty-msg';
        empty.textContent = outlineFilter.value.trim() ? 'No matching DOM elements.' : 'No body elements yet.';
        outlineList.appendChild(empty);
        return;
    }

    items.forEach((item) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'outline-item' + (item.id === selectedPcId ? ' current' : '');
        btn.style.paddingLeft = (0.75 + item.depth * 1.1) + 'rem';

        const tagSpan = document.createElement('code');
        tagSpan.className = 'outline-tag';
        tagSpan.textContent = '<' + item.label + '>';

        const textSpan = document.createElement('span');
        textSpan.className = 'outline-text';
        textSpan.textContent = item.text ? ' ' + item.text : '';

        const lineSpan = document.createElement('span');
        lineSpan.className = 'outline-line';
        lineSpan.textContent = 'L' + (item.line + 1);

        btn.append(tagSpan, textSpan, lineSpan);
        btn.addEventListener('click', () => {
            closeModal(outlineModal);
            selectElementById(item.id, { revealCode: true, focusEditor: true });
        });
        outlineList.appendChild(btn);
    });
}

function openOutline() {
    outlineFilter.value = '';
    renderOutline();
    openModal(outlineModal, { focus: '#outlineFilter' });
}

document.getElementById('outlineBtn').addEventListener('click', openOutline);
outlineFilter.addEventListener('input', renderOutline);

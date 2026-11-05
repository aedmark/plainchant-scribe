// Figures, tables, poems, and quotes (P4-05, D-035): the Layout tab's buttons, and the Assets panel's Insert in a book,
// open one dialog whose fields follow the kind. BookBlocks writes the block after the paragraph selected on the Stage;
// a figure's image joins the manifest in the same undo step. The first block turns on the reflow-safe styling.

const blockModal = document.getElementById('block-modal');
const BLOCK_TITLES = { figure: 'Insert a figure', table: 'Insert a table', poem: 'Insert a poem', quote: 'Insert a block quote' };
let blockPending = null;

function bookImages() {
    const all = Object.keys(projectFiles.entries).concat(Object.keys(projectAssets || {}));
    return Array.from(new Set(all)).filter((p) => BookBlocks.mediaTypeFor(p)).sort();
}

function openBlockDialog(kind, preset) {
    const node = selectedPcId ? HtmlAst.findById(currentHtmlAst, selectedPcId) : null;
    if (!node || !/\.xhtml?$/i.test(activeHtmlFile)) { showNotice('Select a paragraph in a chapter on the Stage first; the ' + kind + ' goes after it.', true); return; }
    blockPending = { kind: kind, path: activeHtmlFile, start: node.start };
    document.getElementById('block-title').textContent = BLOCK_TITLES[kind];
    document.getElementById('blockWhere').textContent = 'It goes after the selected ' + (node.tag || 'element') + ' in ' + activeHtmlFile.split('/').pop() + '.';
    blockModal.querySelectorAll('[data-kind]').forEach((el) => { el.hidden = el.dataset.kind !== kind; });
    document.getElementById('blockError').hidden = true;
    let focus = '#blockOkBtn';
    if (kind === 'figure') {
        const sel = document.getElementById('blockImage');
        const images = bookImages();
        sel.textContent = '';
        images.forEach((p) => { const o = document.createElement('option'); o.value = p; o.textContent = p; sel.appendChild(o); });
        if (preset && preset.image) sel.value = preset.image;
        document.getElementById('blockNoImages').hidden = images.length > 0;
        ['blockAlt', 'blockFigCaption'].forEach((id) => { document.getElementById(id).value = ''; });
        document.getElementById('blockDecorative').checked = false;
        focus = '#blockAlt';
    } else if (kind === 'table') {
        document.getElementById('blockTableCaption').value = '';
        focus = '#blockRows';
    } else if (kind === 'poem') {
        document.getElementById('blockPoem').value = '';
        focus = '#blockPoem';
    } else {
        ['blockQuote', 'blockAttribution'].forEach((id) => { document.getElementById(id).value = ''; });
        focus = '#blockQuote';
    }
    openModal(blockModal, { focus: focus, onClose: () => { blockPending = null; } });
}

function blockOptions(kind) {
    const v = (id) => document.getElementById(id).value;
    if (kind === 'figure') return { image: v('blockImage'), alt: v('blockAlt'), decorative: document.getElementById('blockDecorative').checked, caption: v('blockFigCaption') };
    if (kind === 'table') return { rows: Number(v('blockRows')), cols: Number(v('blockCols')), header: document.getElementById('blockHeader').checked, caption: v('blockTableCaption') };
    if (kind === 'poem') return { text: v('blockPoem') };
    return { text: v('blockQuote'), attribution: v('blockAttribution') };
}

document.getElementById('blockDecorative').addEventListener('change', (e) => { document.getElementById('blockAlt').disabled = e.target.checked; });

document.getElementById('blockForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const job = blockPending;
    if (!job) return;
    const err = document.getElementById('blockError');
    syncBufferFromEditor();
    let next;
    try { next = BookBlocks.insert(projectFiles.entries, job.path, job.start, job.kind, blockOptions(job.kind), Object.keys(projectAssets || {})).entries; } catch (x) { err.textContent = x.message; err.hidden = false; return; }
    const sheet = BookStyle.stylesheet(next);
    const s = sheet ? (BookStyle.read(next[sheet]) || BookStyle.normalise(BookStyle.PRESETS.plain.settings)) : null;
    if (s && !s.blocks) {
        s.blocks = true;
        const model = Book.read(next).model;
        next = Object.assign({}, next, { [sheet]: BookStyle.apply(next[sheet], s, model ? model.metadata.language : 'en') });
    }
    closeModal(blockModal);
    commitFileChange(next, { tree: projectFiles.tree, openTabs: openTabs, activeFile: activeFile, activeHtmlFile: activeHtmlFile });
    refreshLayout();
    showNotice('Inserted a ' + (job.kind === 'quote' ? 'block quote' : job.kind) + '.');
});

inspLayoutPane.querySelectorAll('[data-block]').forEach((b) => b.addEventListener('click', () => openBlockDialog(b.dataset.block)));

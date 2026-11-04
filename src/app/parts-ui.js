const inspPartsPane = document.getElementById('inspPartsPane');
const inspPartBtn = document.getElementById('inspPartBtn');
const partsList = document.getElementById('partsList');
const partsCountBadge = document.getElementById('partsCountBadge');

function lineIndentOf(text, offset) {
    const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
    return /^[ \t]*/.exec(text.slice(lineStart))[0];
}

function commitPartEntries(next) {
    pushUndoState();
    projectFiles.entries = next;
    editor.value = next[activeFile] != null ? next[activeFile] : editor.value;
    syncMirrors();
    render(false);
    scheduleAutoSave();
    if (typeof syncLatestHistoryState === 'function') syncLatestHistoryState();
}

function propagatePartEdits() {
    if (!/\.html?$/i.test(activeFile) || !Parts.isPart(projectFiles.entries, activeFile)) return;
    const res = Parts.sync(projectFiles.entries, { part: activeFile });
    if (!res.changed.length) return;
    projectFiles.entries = res.entries;
    syncMirrors();
}

function partCandidates() {
    const scan = Parts.scan(projectFiles.entries);
    const paths = new Set(Object.keys(scan.parts));
    Object.keys(projectFiles.entries).forEach((p) => { if (/^parts\/.+\.html?$/i.test(p)) paths.add(p); });
    return { scan: scan, paths: Array.from(paths).sort() };
}

function refreshPartsUi() {
    if (!partsList) return;
    ensureEntries();
    const { scan, paths } = partCandidates();
    const loose = scan.regions.filter((r) => r.state !== 'synced').length + scan.invalid.length;
    partsCountBadge.hidden = loose === 0;
    partsCountBadge.textContent = String(loose);
    partsCountBadge.classList.toggle('has-error', loose > 0);
    if (inspPartsPane.hidden) return;

    partsList.textContent = '';
    if (!paths.length && !scan.invalid.length) {
        const empty = document.createElement('div');
        empty.className = 'console-empty';
        empty.textContent = 'No shared parts yet. Select an element and choose Make Part…';
        partsList.appendChild(empty);
        return;
    }
    const addRow = (text, actions, cls) => {
        const row = document.createElement('div');
        row.className = 'console-row ' + (cls || '');
        const msg = document.createElement('span');
        msg.className = 'console-msg';
        msg.textContent = text;
        row.appendChild(msg);
        actions.forEach(([label, title, fn]) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'mini';
            btn.textContent = label;
            btn.title = title;
            btn.addEventListener('click', fn);
            row.appendChild(btn);
        });
        partsList.appendChild(row);
    };
    paths.forEach((path) => {
        const uses = scan.parts[path] || 0;
        const canInsert = !Parts.isPart(projectFiles.entries, activeHtmlFile) && activeHtmlFile !== path;
        addRow(path + ' — used on ' + uses + ' region' + (uses === 1 ? '' : 's'), [
            ['Open', 'Edit the part file', () => openFileInEditor(path)],
            ['Insert', canInsert ? 'Insert this part into the current page' : 'Open a regular page to insert into', () => { if (canInsert) insertPart(path); }]
        ]);
        scan.regions.filter((r) => r.path === path && r.state === 'differs').forEach((r) => {
            addRow('  ' + r.page + ' differs from the part', [
                ['Use part', 'Replace this page’s copy with the part file', () => commitPartEntries(Parts.sync(projectFiles.entries, r).entries)],
                ['Update part', 'Make the part match this page and update every page', () => commitPartEntries(Parts.pull(projectFiles.entries, r.page, r.index).entries)]
            ], 'console-warn');
        });
    });
    scan.regions.filter((r) => r.state === 'missing').forEach((r) => {
        addRow(r.page + ': part file "' + r.src + '" was not found', [['Open page', 'Open the page', () => openFileInEditor(r.page)]], 'console-error');
    });
    scan.invalid.forEach((b) => {
        addRow(b.page + ': unmatched or nested pc:part marker' + (b.src ? ' for "' + b.src + '"' : ''), [['Open page', 'Open the page', () => openFileInEditor(b.page)]], 'console-error');
    });
}

function insertPart(path) {
    const text = projectFiles.entries[path];
    if (typeof text !== 'string') return;
    const node = selectedPcId ? HtmlAst.findById(currentHtmlAst, selectedPcId) : null;
    const usable = node && node.tag !== 'html' && node.tag !== 'body' && node.tag !== 'head';
    const html = projectFiles.html;
    const indent = usable ? lineIndentOf(html, node.start) : '  ';
    const snippet = Parts.wrap(Parts.relPath(activeHtmlFile, path), text, indent);
    applyHtmlTransform(HtmlAst.insertElement(html, usable ? selectedPcId : null, usable ? 'after' : null, snippet));
    showNotice('Inserted shared part ' + path);
}

function makePartFromSelection() {
    const node = selectedPcId ? HtmlAst.findById(currentHtmlAst, selectedPcId) : null;
    if (!node || ['html', 'head', 'body'].indexOf(node.tag) !== -1) {
        showNotice('Select a page element (not html, head, or body) to make a shared part.', true);
        return;
    }
    if (Parts.isPart(projectFiles.entries, activeHtmlFile)) {
        showNotice('Open a regular page, not a shared part file, to make a part.', true);
        return;
    }
    const html = projectFiles.html;
    const found = Parts.find(html);
    const touches = found.regions.some((r) => r.openStart < node.end && r.closeEnd > node.start);
    if (touches || found.invalid.length) {
        showNotice('That element overlaps an existing shared part or an unmatched marker.', true);
        return;
    }
    const fallback = 'parts/' + (node.attrs && node.attrs.id ? node.attrs.id : node.tag) + '.html';
    const answer = window.prompt('Shared part file (kept in the project, reused by every page that includes it):', fallback);
    if (!answer || !answer.trim()) return;
    const path = answer.trim().replace(/^\/+/, '');
    if (!/\.html?$/i.test(path) || path.split('/').indexOf('..') !== -1) {
        showNotice('Use a project-relative .html path such as parts/header.html.', true);
        return;
    }
    if (path in projectFiles.entries) {
        showNotice(path + ' already exists. Choose a new name, or use Insert on the Parts tab.', true);
        return;
    }
    const outer = html.slice(node.start, node.end);
    const region = Parts.wrap(Parts.relPath(activeHtmlFile, path), outer, lineIndentOf(html, node.start));
    applyHtmlTransform(html.slice(0, node.start) + region + html.slice(node.end), null);
    projectFiles.entries[path] = outer + '\n';
    if (Array.isArray(projectFiles.tree)) projectFiles.tree.push({ path: path, kind: 'file', is_text: true });
    renderExplorer();
    refreshPartsUi();
    scheduleAutoSave();
    if (typeof syncLatestHistoryState === 'function') syncLatestHistoryState();
    showNotice('Created shared part ' + path);
}

inspPartBtn.addEventListener('click', makePartFromSelection);

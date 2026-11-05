const editor = document.getElementById('editor');
const renderTarget = document.getElementById('render-target');
const stageFrame = document.getElementById('stageFrame');
const stageFrameWrap = document.getElementById('stage-frame-wrap');
const fileTabsBox = document.getElementById('fileTabs');
const fileExplorer = document.getElementById('fileExplorer');
const toggleExplorerBtn = document.getElementById('toggleExplorerBtn');
const explorerTitle = document.getElementById('explorerTitle');
const explorerFilter = document.getElementById('explorerFilter');
const explorerTree = document.getElementById('explorerTree');
const newFileBtn = document.getElementById('newFileBtn');

function newId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

// Pages the Stage can show: HTML pages, and a book's XHTML documents (P2-01).
const isPagePath = (filePath) => /\.(?:html?|xhtml)$/i.test(String(filePath || ''));

function langForFile(filePath) {
    const lower = String(filePath || '').toLowerCase();
    if (lower.endsWith('.css')) return 'css';
    if (lower.endsWith('.js') || lower.endsWith('.mjs') || lower.endsWith('.json')) return 'js';
    return 'html';
}

let currentScriptId = newId();
let autoSaveTimer;
let projectFiles = Project.starter();
let openTabs = ['index.html', 'styles.css', 'script.js'];
let activeFile = 'index.html';
let activeHtmlFile = 'index.html';
let activeCssFile = 'styles.css';
let activeTab = 'html';
let projectBaseUrl = '';
let selectedPcId = null;
let stageViewport = 'full';
let currentHtmlAst = HtmlAst.parse(projectFiles.html);
let currentCssAst = CssAst.parse(projectFiles.css);

let noticeTimer;
function showNotice(message, isError = false) {
    const notice = document.getElementById('notice');
    if (!notice) return;
    notice.textContent = message;
    notice.classList.toggle('error', isError);
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { notice.textContent = ''; }, isError ? 10000 : 5000);
}

function ensureEntries() {
    if (!projectFiles.entries || typeof projectFiles.entries !== 'object') {
        projectFiles.entries = Project.normalizeEntries(projectFiles);
    }
}

function syncMirrors() {
    ensureEntries();
    if (!(activeHtmlFile in projectFiles.entries)) {
        const firstHtml = Project.isBookEntries(projectFiles.entries)
            ? bookChapterFor(projectFiles.entries, null)
            : Object.keys(projectFiles.entries).find((k) => /\.html?$/i.test(k));
        activeHtmlFile = firstHtml || 'index.html';
    }
    activeCssFile = Project.primaryCssFile(projectFiles, activeHtmlFile);
    projectFiles.activeHtml = activeHtmlFile;
    projectFiles.activeCss = activeCssFile;
    projectFiles.html = projectFiles.entries[activeHtmlFile] != null ? projectFiles.entries[activeHtmlFile] : (projectFiles.html || '');
    projectFiles.css = projectFiles.entries[activeCssFile] != null ? projectFiles.entries[activeCssFile] : (projectFiles.css || '');
    projectFiles.js = projectFiles.entries['script.js'] != null ? projectFiles.entries['script.js'] : (projectFiles.js || '');
}

function syncBufferFromEditor() {
    ensureEntries();
    projectFiles.entries[activeFile] = editor.value;
    syncMirrors();
}

function defaultTabsForEntries(entries) {
    const keys = Object.keys(entries || {});
    if (Project.isBookEntries(entries)) {
        // A book opens on its first chapter, that chapter's stylesheet, and the package document.
        const chapter = bookChapterFor(entries, null);
        const read = Book.read(entries);
        const bookTabs = [chapter, chapter && Project.primaryCssFile({ entries: entries }, chapter), read.model && read.model.opfPath];
        const unique = bookTabs.filter((p, i) => p && p in entries && bookTabs.indexOf(p) === i);
        return unique.length ? unique : keys.slice(0, 3);
    }
    const htmlKey = keys.includes('index.html') ? 'index.html' : (keys.find((k) => /\.html?$/i.test(k)) || 'index.html');
    const cssKey = Project.primaryCssFile({ entries: entries }, htmlKey);
    const jsKey = keys.includes('script.js') ? 'script.js' : keys.find((k) => /\.m?js$/i.test(k));
    const tabs = [];
    if (htmlKey && (htmlKey in entries)) tabs.push(htmlKey);
    if (cssKey && (cssKey in entries) && !tabs.includes(cssKey)) tabs.push(cssKey);
    if (jsKey && (jsKey in entries) && !tabs.includes(jsKey)) tabs.push(jsKey);
    keys.forEach((k) => {
        if (tabs.length < 5 && /\.html?$/i.test(k) && !tabs.includes(k)) tabs.push(k);
    });
    return tabs.length ? tabs : (keys.slice(0, 3).length ? keys.slice(0, 3) : ['index.html']);
}

function loadProjectIntoEditor(rawOrFiles, options = {}) {
    const unpacked = typeof rawOrFiles === 'string' ? Project.unpack(rawOrFiles) : Object.assign({}, rawOrFiles);
    projectFiles = {
        html: unpacked.html || '',
        css: unpacked.css || '',
        js: unpacked.js || '',
        entries: Project.normalizeEntries(unpacked),
        tree: Array.isArray(unpacked.tree) ? unpacked.tree : null
    };
    projectBaseUrl = options.baseUrl || '';
    openTabs = defaultTabsForEntries(projectFiles.entries);
    activeFile = openTabs[0] || 'index.html';
    activeHtmlFile = isPagePath(activeFile)
        ? activeFile
        : (Project.isBookEntries(projectFiles.entries) ? bookChapterFor(projectFiles.entries, null) : Object.keys(projectFiles.entries).find((k) => /\.html?$/i.test(k))) || 'index.html';
    activeTab = langForFile(activeFile);
    syncMirrors();
    editor.value = projectFiles.entries[activeFile] != null ? projectFiles.entries[activeFile] : '';
    currentHtmlAst = HtmlAst.parse(projectFiles.html);
    currentCssAst = CssAst.parse(projectFiles.css);
    renderFileTabs();
    renderExplorer();
    if (typeof resetHistory === 'function') resetHistory();
    if (typeof adoptProjectAssets === 'function') adoptProjectAssets(options.assets);
    if (typeof markFilesSaved === 'function') markFilesSaved();
}

function renderFileTabs() {
    if (!fileTabsBox) return;
    fileTabsBox.textContent = '';
    openTabs.forEach((filePath) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'file-tab';
        btn.setAttribute('role', 'tab');
        btn.dataset.file = filePath;
        btn.dataset.tab = langForFile(filePath);
        btn.setAttribute('aria-selected', String(filePath === activeFile));

        const label = document.createElement('span');
        label.className = 'tab-label';
        label.textContent = filePath.split('/').pop();
        btn.title = filePath;
        btn.appendChild(label);

        if (openTabs.length > 1) {
            const closeSpan = document.createElement('span');
            closeSpan.className = 'tab-close';
            closeSpan.textContent = '×';
            closeSpan.title = 'Close tab';
            closeSpan.addEventListener('click', (e) => {
                e.stopPropagation();
                closeFileTab(filePath);
            });
            btn.appendChild(closeSpan);
        }

        btn.addEventListener('click', () => openFileInEditor(filePath));
        fileTabsBox.appendChild(btn);
    });
    if (typeof refreshDirtyMarks === 'function') refreshDirtyMarks();
}

function closeFileTab(filePath) {
    if (openTabs.length <= 1) return;
    syncBufferFromEditor();
    const idx = openTabs.indexOf(filePath);
    if (idx === -1) return;
    openTabs.splice(idx, 1);
    if (activeFile === filePath) {
        const nextFile = openTabs[Math.max(0, idx - 1)] || openTabs[0];
        openFileInEditor(nextFile);
    } else {
        renderFileTabs();
    }
}

function openFileInEditor(filePath) {
    ensureEntries();
    if (!(filePath in projectFiles.entries)) return;
    syncBufferFromEditor();
    if (!openTabs.includes(filePath)) openTabs.push(filePath);
    expandExplorerTo(filePath);
    activeFile = filePath;
    activeTab = langForFile(filePath);
    const switchedHtml = isPagePath(filePath) && filePath !== activeHtmlFile;
    if (isPagePath(filePath)) {
        activeHtmlFile = filePath;
        selectedPcId = null;
    }
    syncMirrors();
    editor.value = projectFiles.entries[activeFile] || '';
    renderFileTabs();
    renderExplorer();
    if (switchedHtml) {
        render(false);
    } else {
        drawShade();
        syncElementState();
    }
    if (typeof syncLatestHistoryState === 'function') syncLatestHistoryState();
}

function switchFileTab(tabOrFile) {
    ensureEntries();
    if (tabOrFile in projectFiles.entries) {
        openFileInEditor(tabOrFile);
        return;
    }
    if (tabOrFile === 'html') {
        openFileInEditor(activeHtmlFile || 'index.html');
    } else if (tabOrFile === 'css') {
        syncMirrors();
        if (!(activeCssFile in projectFiles.entries)) projectFiles.entries[activeCssFile] = '';
        openFileInEditor(activeCssFile);
    } else if (tabOrFile === 'js') {
        const jsFile = Object.keys(projectFiles.entries).find((k) => /\.m?js$/i.test(k)) || 'script.js';
        if (!(jsFile in projectFiles.entries)) projectFiles.entries[jsFile] = '';
        openFileInEditor(jsFile);
    }
}

const explorerCollapsed = new Set();

function expandExplorerTo(path) {
    for (let at = path.split('/').slice(0, -1).join('/'); at; at = at.split('/').slice(0, -1).join('/')) explorerCollapsed.delete(at);
}

function toggleExplorerDir(path) {
    if (!explorerCollapsed.delete(path)) explorerCollapsed.add(path);
    renderExplorer();
}

function renderExplorer() {
    if (!explorerTree) return;
    ensureEntries();
    const query = (explorerFilter && explorerFilter.value || '').trim().toLowerCase();
    const rawTree = Array.isArray(projectFiles.tree) && projectFiles.tree.length
        ? projectFiles.tree
        : Object.keys(projectFiles.entries).sort().map((p) => ({ path: p, kind: 'file', is_text: true }));

    explorerTree.textContent = '';
    const hidden = (path) => !query && Array.from(explorerCollapsed).some((dir) => path.indexOf(dir + '/') === 0);
    const filtered = rawTree.filter((item) => (!query || item.path.toLowerCase().includes(query)) && !hidden(item.path));

    if (!filtered.length) {
        const empty = document.createElement('p');
        empty.className = 'explorer-empty';
        empty.textContent = 'No matching files';
        explorerTree.appendChild(empty);
        return;
    }

    filtered.forEach((item) => {
        const depth = item.path.split('/').length - 1;
        const name = item.path.split('/').pop();
        if (item.kind === 'dir') {
            const dirRow = document.createElement('div');
            dirRow.className = 'explorer-dir';
            dirRow.dataset.path = item.path;
            dirRow.style.paddingLeft = (0.5 + depth * 0.75) + 'rem';
            const dirLabel = document.createElement('span');
            dirLabel.className = 'explorer-dir-name';
            const collapsed = !query && explorerCollapsed.has(item.path);
            dirLabel.textContent = (collapsed ? '▸ ' : '▾ ') + name + '/';
            dirLabel.setAttribute('role', 'button');
            dirLabel.tabIndex = 0;
            dirLabel.setAttribute('aria-expanded', String(!collapsed));
            dirLabel.title = (collapsed ? 'Expand ' : 'Collapse ') + item.path;
            dirLabel.addEventListener('click', () => toggleExplorerDir(item.path));
            dirLabel.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExplorerDir(item.path); }
            });
            dirRow.appendChild(dirLabel);
            if (typeof decorateExplorerDir === 'function') decorateExplorerDir(dirRow);
            explorerTree.appendChild(dirRow);
            return;
        }
        const btn = document.createElement('button');
        btn.type = 'button';
        const isCurrent = item.path === activeFile;
        const isPreviewedHtml = item.path === activeHtmlFile && isPagePath(item.path);
        btn.className = 'explorer-item' + (isCurrent ? ' active' : '') + (isPreviewedHtml ? ' previewed' : '');
        btn.style.paddingLeft = (0.6 + depth * 0.75) + 'rem';
        btn.title = item.path;

        const badge = document.createElement('span');
        badge.className = 'file-badge';
        const ext = (name.split('.').pop() || '').toLowerCase();
        badge.textContent = ['html', 'htm'].includes(ext) ? 'HTML'
            : ext === 'css' ? 'CSS'
            : ['js', 'mjs'].includes(ext) ? 'JS'
            : ext === 'json' ? 'JSON'
            : ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'avif'].includes(ext) ? 'IMG'
            : ext.slice(0, 4).toUpperCase();

        const label = document.createElement('span');
        label.className = 'explorer-name';
        label.textContent = name;

        btn.append(badge, label);
        btn.addEventListener('click', () => {
            if (item.path in projectFiles.entries) {
                openFileInEditor(item.path);
            } else if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'avif'].includes(ext)) {
                openAssetManager();
                assetSearch.value = item.path;
                renderAssets();
            } else {
                showNotice('Binary file: ' + item.path);
            }
        });
        const row = document.createElement('div');
        row.className = 'explorer-row';
        row.dataset.path = item.path;
        row.appendChild(btn);
        if (typeof decorateExplorerRow === 'function') decorateExplorerRow(row, item.path in projectFiles.entries);
        explorerTree.appendChild(row);
    });
    if (typeof refreshDirtyMarks === 'function') refreshDirtyMarks();
}

function applyHtmlTransform(newHtml, keepSelectId, options = {}) {
    ensureEntries();
    syncMirrors();
    if (newHtml === projectFiles.html) return;
    if (bookEditRefused(newHtml)) return;
    if (options.coalesceHistory && typeof recordHistoryBurst === 'function') {
        recordHistoryBurst();
    } else if (typeof pushUndoState === 'function') {
        pushUndoState();
    }
    projectFiles.entries[activeHtmlFile] = newHtml;
    projectFiles.html = newHtml;

    if (options.skipStageRender) {
        if (activeFile === activeHtmlFile) {
            editor.value = newHtml;
        }
        currentHtmlAst = HtmlAst.parse(projectFiles.html);
        drawShade();
        if (keepSelectId !== undefined) selectedPcId = keepSelectId;
        const node = selectedPcId ? HtmlAst.findById(currentHtmlAst, selectedPcId) : null;
        if (node && activeFile === activeHtmlFile) {
            const blockLines = editor.value.slice(node.start, node.end).split('\n').length;
            highlightCodeRange(node.start, blockLines <= 16 ? node.end : node.openEnd);
        }
        refreshInspector();
        updateBreadcrumbs();
        scheduleAutoSave();
        if (typeof syncLatestHistoryState === 'function') syncLatestHistoryState();
        return;
    }

    if (activeFile === activeHtmlFile) {
        const edit = Editing.diffEdit(editor.value, newHtml, editor.selectionStart, editor.selectionEnd);
        applyEdit(edit, { keepFocus: true, skipHistory: true });
    } else {
        render(false);
        scheduleAutoSave();
    }
    if (keepSelectId !== undefined) {
        selectedPcId = keepSelectId;
        refreshInspector();
        updateBreadcrumbs();
    }
    if (typeof syncLatestHistoryState === 'function') syncLatestHistoryState();
}

function applyCssTransform(newCss) {
    ensureEntries();
    syncMirrors();
    if (newCss === projectFiles.css) return;
    if (typeof pushUndoState === 'function') pushUndoState();
    projectFiles.entries[activeCssFile] = newCss;
    projectFiles.css = newCss;
    if (activeFile === activeCssFile) {
        const edit = Editing.diffEdit(editor.value, newCss, editor.selectionStart, editor.selectionEnd);
        applyEdit(edit, { keepFocus: true, skipHistory: true });
    } else {
        render(false);
        scheduleAutoSave();
    }
    if (typeof syncLatestHistoryState === 'function') syncLatestHistoryState();
}

function scheduleAutoSave() {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => {
        saveScript(true);
    }, 1500);
    if (typeof refreshDirtyMarks === 'function') refreshDirtyMarks();
}

function render(typed) {
    syncBufferFromEditor();
    if (typeof propagatePartEdits === 'function') propagatePartEdits();
    currentHtmlAst = HtmlAst.parse(projectFiles.html);
    currentCssAst = CssAst.parse(projectFiles.css);
    drawShade();
    scheduleStageRender(typed);
    if (selectedPcId && !HtmlAst.findById(currentHtmlAst, selectedPcId)) {
        selectedPcId = null;
    }
    updateBreadcrumbs();
    refreshInspector();
    if (typeof refreshPartsUi === 'function') refreshPartsUi();
    if (typeof scheduleProblemsCheck === 'function') scheduleProblemsCheck();
    if (typeof refreshBookPanel === 'function') refreshBookPanel(false);
    if (typeof refreshChapters === 'function') refreshChapters();
    if (typeof refreshLayout === 'function') refreshLayout();
    if (typeof schedulePreviewPush === 'function') schedulePreviewPush();
}

if (toggleExplorerBtn && fileExplorer) {
    toggleExplorerBtn.addEventListener('click', () => {
        const nextHidden = !fileExplorer.hidden;
        fileExplorer.hidden = nextHidden;
        toggleExplorerBtn.setAttribute('aria-pressed', String(!nextHidden));
        placeShade();
    });
}

if (explorerFilter) {
    explorerFilter.addEventListener('input', renderExplorer);
}

if (newFileBtn) {
    newFileBtn.addEventListener('click', async () => {
        const name = await askText({
            title: 'New file',
            hint: 'File name (e.g. about.html, theme.css, utils.js)',
            value: 'page.html',
            confirm: 'Create',
            validate: (text) => (text.replace(/^\/+/, '') ? '' : 'Enter a file name.')
        });
        if (!name) return;
        const clean = name.trim().replace(/^\/+/, '');
        ensureEntries();
        if (!(clean in projectFiles.entries)) {
            projectFiles.entries[clean] = clean.endsWith('.html')
                ? Project.blank().html
                : (clean.endsWith('.css') ? '/* ' + clean + ' */\n' : '// ' + clean + '\n');
            if (Array.isArray(projectFiles.tree)) {
                projectFiles.tree.push({ path: clean, kind: 'file', is_text: true });
            }
        }
        openFileInEditor(clean);
        scheduleAutoSave();
    });
}

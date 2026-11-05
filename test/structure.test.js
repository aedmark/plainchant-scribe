const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'app.html'), 'utf8');
const appDir = path.join(root, 'src', 'app');
const onDisk = fs.readdirSync(appDir).filter((f) => f.endsWith('.js')).sort();
const listed = Array.from(html.matchAll(/<script src="src\/app\/([^"]+)"><\/script>/g)).map((m) => m[1]);
const MAX_LINES = 500;

test('structure: app.html loads every file in src/app exactly once, and no file that does not exist', () => {
    assert.deepEqual(listed.slice().sort(), onDisk, 'the script tags and src/app/ disagree');
    assert.equal(new Set(listed).size, listed.length, 'a script is listed twice');
});

test('structure: the app scripts are loaded after the src/ modules they use, and main.js is last', () => {
    const order = Array.from(html.matchAll(/<script src="([^"]+)"><\/script>/g)).map((m) => m[1]);
    [
        'src/html-ast.js', 'src/css-ast.js', 'src/code-shade.js', 'src/dom-outline.js',
        'src/project.js', 'src/editing.js', 'src/suggest.js', 'src/library.js',
        'src/store.js', 'src/versions.js', 'src/filesync.js', 'src/importing.js',
        'src/xml-ast.js', 'src/book-template.js', 'src/book.js', 'src/opf-edit.js', 'src/nav.js', 'src/book-stage.js', 'src/example-book.js', 'src/book-meta.js', 'src/book-chapters.js', 'src/book-contents.js', 'src/book-cover.js', 'src/book-style.js', 'src/font-info.js', 'src/book-fonts.js', 'src/book-notes.js', 'src/book-blocks.js', 'src/css-lint.js', 'src/book-export.js', 'src/epub.js', 'src/markdown-import.js'
    ].forEach((m) => {
        assert.ok(order.indexOf(m) !== -1 && order.indexOf(m) < order.indexOf('src/app/core.js'), m + ' must load before the app scripts');
    });
    assert.equal(order[order.length - 1], 'src/app/main.js');
    assert.equal(order.indexOf('src/app/core.js'), order.indexOf('src/importing.js') + 1, 'core.js must be the first app script');
});

test('structure: no inline script has crept into app.html', () => {
    const inline = Array.from(html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)).filter((m) => m[1].trim() !== '');
    assert.equal(inline.length, 0, inline.length + ' inline script(s) with code');
});

test('structure: each app script is valid JavaScript', () => {
    listed.forEach((f) => {
        try { new vm.Script(fs.readFileSync(path.join(appDir, f), 'utf8'), { filename: f }); }
        catch (e) { assert.ok(false, f + ': ' + e.message); }
    });
});

test('structure: together they are one program, so no name is declared twice across files', () => {
    const combined = listed.map((f) => fs.readFileSync(path.join(appDir, f), 'utf8')).join('\n;\n');
    try { new vm.Script(combined, { filename: 'src/app/*.js (concatenated in load order)' }); }
    catch (e) { assert.ok(false, e.message); }
});

test('structure: no app script has grown past ' + MAX_LINES + ' lines', () => {
    listed.forEach((f) => {
        const lines = fs.readFileSync(path.join(appDir, f), 'utf8').split('\n').length;
        assert.ok(lines <= MAX_LINES, f + ' is ' + lines + ' lines');
    });
});

test('structure: the app stylesheet is linked and no inline <style> is in app.html', () => {
    const links = Array.from(html.matchAll(/<link rel="stylesheet" href="(src\/[^"]+)">/g)).map((m) => m[1]);
    assert.deepEqual(links, ['src/styles.css']);
    assert.ok(fs.existsSync(path.join(root, 'src', 'styles.css')), 'src/styles.css is linked but missing');
    assert.ok(!/<style[\s>]/.test(html), 'an inline <style> block is present');
});

const readRoot = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const css = readRoot('src/styles.css');
const fontUrls = Array.from(css.matchAll(/url\('\.\.\/(fonts\/[^']+)'\)/g)).map((m) => m[1]);
const manifest = JSON.parse(readRoot('manifest.webmanifest'));

test('offline: the page and the stylesheet load nothing from another site', () => {
    assert.ok(!/(?:src|href)="(?:https?:)?\/\//i.test(html), 'app.html links to another site');
    assert.ok(!/url\(\s*['"]?(?:https?:)?\/\//i.test(css), 'styles.css loads something from another site');
    assert.ok(!/@import/.test(css), 'styles.css imports another stylesheet');
});

test('offline: the service worker keeps a copy of exactly the files the app uses, and all of them exist', () => {
    const sw = readRoot('sw.js');
    const swListed = Array.from(sw.match(/const APP_FILES = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)).map((m) => m[1]);
    assert.equal(new Set(swListed).size, swListed.length, 'a file is listed twice');
    const pageLinks = Array.from(html.matchAll(/<link [^>]*href="([^"]+)"/g)).map((m) => m[1]);
    const scripts = Array.from(html.matchAll(/<script src="([^"]+)"[^>]*><\/script>/g)).map((m) => m[1]);
    const expected = ['./', 'index.html', 'app.html', 'src/home.css', 'manifest.webmanifest'].concat(pageLinks, scripts, fontUrls, manifest.icons.map((i) => i.src));
    assert.deepEqual(swListed.slice().sort(), Array.from(new Set(expected)).sort());
    swListed.filter((f) => f !== './').forEach((f) => assert.ok(fs.existsSync(path.join(root, f)), f + ' is listed but missing'));
});

test('structure: link following (Ctrl/Cmd+Click and the Follow Link button) is wired in, and Live JS mode and the Console are gone (P0-04)', () => {
    assert.includes(html, 'id="propFollowBtn"');
    assert.ok(listed.indexOf('stage-links.js') > listed.indexOf('stage.js'), 'stage-links.js loads after stage.js');
    ['id="modeLiveBtn"', 'data-insp="console"', 'id="inspConsolePane"', 'src/app/console-ui.js', 'src/app/stage-live.js'].forEach((needle) => assert.excludes(html, needle));
    assert.ok(!fs.existsSync(path.join(appDir, 'console-ui.js')) && !fs.existsSync(path.join(appDir, 'stage-live.js')), 'the removed scripts are not on disk');
    const stage = fs.readFileSync(path.join(appDir, 'stage.js'), 'utf8');
    ['pc-navigate', 'pc-follow-link'].forEach((type) => assert.includes(stage, type));
});

test('structure: the Parts tab, Make Part button, and parts scripts are wired in (P7-10)', () => {
    ['data-insp="parts"', 'id="partsCountBadge"', 'id="inspPartsPane"', 'id="partsList"', 'id="inspPartBtn"'].forEach((needle) => assert.includes(html, needle));
    const order = Array.from(html.matchAll(/<script src="([^"]+)"><\/script>/g)).map((m) => m[1]);
    assert.ok(order.indexOf('src/parts.js') > order.indexOf('src/project.js'), 'parts.js loads after project.js');
    assert.ok(order.indexOf('src/parts.js') < order.indexOf('src/app/core.js'), 'parts.js loads before the app scripts');
    assert.ok(listed.indexOf('parts-ui.js') > listed.indexOf('inspector-ui.js'), 'parts-ui.js loads after inspector-ui.js');
});

test('structure: the line-number gutter and find bar are wired in (P6-01)', () => {
    ['id="editorGutter"', 'id="findBar"', 'id="findInput"', 'id="replaceInput"', 'id="replaceBtn"', 'id="replaceAllBtn"', 'id="findCaseBtn"', 'id="findCount"'].forEach((needle) => assert.includes(html, needle));
    const order = Array.from(html.matchAll(/<script src="([^"]+)"><\/script>/g)).map((m) => m[1]);
    assert.ok(order.indexOf('src/finding.js') !== -1 && order.indexOf('src/finding.js') < order.indexOf('src/app/core.js'), 'finding.js loads before the app scripts');
    assert.ok(listed.indexOf('find.js') > listed.indexOf('shade.js'), 'find.js loads after shade.js');
});

test('structure: the floating Inspector wraps its header and clips overflow so controls stay inside the window', () => {
    const rule = (selector) => {
        const m = css.match(new RegExp('(?:^|\\n)' + selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}'));
        assert.ok(m, selector + ' rule is missing');
        return m[1];
    };
    ['.inspector-header', '.inspector-tabs', '.insp-actions', '.inspector-selection-badge'].forEach((sel) => {
        assert.includes(rule(sel), 'flex-wrap: wrap', sel + ' must wrap');
    });
    assert.includes(rule('.inspector-panel.floating'), 'overflow: hidden');
});

test('structure: the Inspector can dock bottom, top, left, right, or float, with a menu and a side resizer (P7-16)', () => {
    ['id="canvasBody"', 'id="inspDockBtn"', 'id="dockMenu"', 'id="inspectorResizer"'].forEach((needle) => assert.includes(html, needle));
    ['bottom', 'top', 'left', 'right', 'float'].forEach((dock) => assert.includes(html, 'data-dock="' + dock + '"'));
    assert.ok(listed.indexOf('dock-ui.js') > listed.indexOf('panes.js'), 'dock-ui.js loads after panes.js');
    const settings = readRoot('src/app/settings.js');
    assert.includes(settings, "inspectorDock: ['bottom', 'top', 'left', 'right', 'float']");
    ['.canvas-body[data-dock="left"]', '.inspector-panel.dock-top', '.inspector-panel.dock-left', '.inspector-panel.dock-right'].forEach((sel) => assert.includes(css, sel));
    assert.ok(/\.dock-left \.insp-grid,\s*\.dock-right \.insp-grid \{ grid-template-columns: minmax\(0, 1fr\); \}/.test(css), 'side docks use one column');
});

test('structure: the Explorer file menu, dirty markers, and explorer-ui.js are wired in (P6-02)', () => {
    ['id="fileMenu"', 'data-file-cmd="rename"', 'data-file-cmd="duplicate"', 'data-file-cmd="delete"'].forEach((needle) => assert.includes(html, needle));
    assert.ok(listed.indexOf('explorer-ui.js') > listed.indexOf('typing.js'), 'explorer-ui.js loads after typing.js');
    const core = readRoot('src/app/core.js');
    ['refreshDirtyMarks', 'decorateExplorerRow', 'markFilesSaved'].forEach((hook) => assert.includes(core, hook));
    assert.includes(readRoot('src/app/persistence.js'), 'markFilesSaved(savedCopy)');
    assert.includes(readRoot('src/app/typing.js'), 'tree: Array.isArray(projectFiles.tree)');
    assert.includes(css, '.file-tab.dirty .tab-label::after');
});

test('structure: the Problems tab, links.js, and problems-ui.js are wired in (P7-04)', () => {
    ['data-insp="problems"', 'id="problemsCountBadge"', 'id="inspProblemsPane"', 'id="problemsList"', 'id="problemsRecheckBtn"'].forEach((needle) => assert.includes(html, needle));
    const order = Array.from(html.matchAll(/<script src="([^"]+)"><\/script>/g)).map((m) => m[1]);
    assert.ok(order.indexOf('src/links.js') > order.indexOf('src/project.js') && order.indexOf('src/links.js') < order.indexOf('src/app/core.js'), 'links.js loads after project.js and before the app scripts');
    assert.ok(listed.indexOf('problems-ui.js') > listed.indexOf('inspector-ui.js'), 'problems-ui.js loads after inspector-ui.js');
    assert.includes(readRoot('src/app/core.js'), 'scheduleProblemsCheck');
});

test('structure: the project-wide search scope, results list, and find-project.js are wired in (P7-05)', () => {
    ['id="findScopeBtn"', 'id="findResults"', 'id="findResultsList"', 'id="findResultsSummary"'].forEach((needle) => assert.includes(html, needle));
    assert.ok(listed.indexOf('find-project.js') > listed.indexOf('find.js'), 'find-project.js loads after find.js');
    const find = readRoot('src/app/find.js');
    ['onFindChanged', 'setFindProject', 'replaceAcrossProject', 'hideFindResults'].forEach((hook) => assert.includes(find, hook));
});

test('structure: the Export dialog offers a whole-project .zip built by zip.js (P7-13)', () => {
    ['id="zipExportSection"', 'id="exportZipBtn"'].forEach((needle) => assert.includes(html, needle));
    const order = Array.from(html.matchAll(/<script src="([^"]+)"><\/script>/g)).map((m) => m[1]);
    assert.ok(order.indexOf('src/zip.js') !== -1 && order.indexOf('src/zip.js') < order.indexOf('src/app/core.js'), 'zip.js loads before the app scripts');
    assert.ok(listed.indexOf('zip-ui.js') > listed.indexOf('tauri-files.js'), 'zip-ui.js loads after tauri-files.js (it uses hasTauri)');
    assert.includes(readRoot('src/app/zip-ui.js'), 'Zip.build');
});

test('structure: the Problems filter, hints.js, and the problemsFilter setting are wired in (P7-11)', () => {
    ['id="problemsFilterBar"', 'data-filter="accessibility"', 'data-filter="markup"'].forEach((needle) => assert.includes(html, needle));
    const order = Array.from(html.matchAll(/<script src="([^"]+)"><\/script>/g)).map((m) => m[1]);
    assert.ok(order.indexOf('src/hints.js') !== -1 && order.indexOf('src/hints.js') < order.indexOf('src/importing.js'), 'hints.js loads before importing.js');
    assert.includes(readRoot('src/app/problems-ui.js'), 'hintChecker.check(entries)', 'the Problems tab runs the hint checker');
    assert.includes(readRoot('src/app/settings.js'), "problemsFilter: 'all'");
});

test('structure: the Explorer + Folder button, folder rows, and explorer-move.js are wired in (P7-08)', () => {
    assert.includes(html, 'id="newFolderBtn"');
    assert.ok(listed.indexOf('explorer-move.js') > listed.indexOf('asset-ui.js') && listed.indexOf('explorer-move.js') > listed.indexOf('explorer-ui.js'), 'explorer-move.js loads after explorer-ui.js and asset-ui.js');
    assert.includes(readRoot('src/app/core.js'), 'decorateExplorerDir', 'directory rows are decorated');
    assert.includes(readRoot('src-tauri/src/main.rs'), 'dirs: Option<Vec<String>>', 'the desktop export creates empty folders');
});

test('structure: the Assets modal, Browse button, image library, and asset-ui.js are wired in (P7-02)', () => {
    ['id="assets-modal"', 'id="assetsBtn"', 'id="assetGrid"', 'id="assetSearch"', 'id="assetAddBtn"', 'id="assetFileInput"', 'id="propSrcBrowseBtn"'].forEach((needle) => assert.includes(html, needle));
    const order = Array.from(html.matchAll(/<script src="([^"]+)"><\/script>/g)).map((m) => m[1]);
    assert.ok(order.indexOf('src/imagelib.js') !== -1 && order.indexOf('src/imagelib.js') < order.indexOf('src/app/core.js'), 'imagelib.js loads before the app scripts');
    assert.ok(listed.indexOf('asset-ui.js') > listed.indexOf('assets.js') && listed.indexOf('asset-ui.js') > listed.indexOf('explorer-ui.js'), 'asset-ui.js loads after assets.js and explorer-ui.js');
    assert.includes(readRoot('src/app/import.js'), 'addImageFiles');
    assert.includes(readRoot('src/app/assets.js'), 'function addProjectAsset');
    assert.includes(readRoot('src/store.js'), 'putAsset: putAsset');
    assert.includes(html, 'id="cssBgImageBrowseBtn"');
    assert.includes(html, 'id="cssBgImage"');
    assert.includes(readRoot('src/app/typing.js'), 'restoreProjectAssets(snap.assets)', 'asset changes are part of undo history');
    assert.includes(readRoot('src-tauri/src/main.rs'), 'assets: Option<BTreeMap<String, String>>', 'the desktop export writes added images');
});

test('structure: the Preview dialog, preview.js, the Tauri preview commands, and the push hooks are wired in (P7-12)', () => {
    ['id="previewBtn"', 'id="preview-modal"', 'id="previewTabBtn"', 'id="previewToggleBtn"', 'id="previewUrls"'].forEach((needle) => assert.includes(html, needle));
    const order = Array.from(html.matchAll(/<script src="([^"]+)"><\/script>/g)).map((m) => m[1]);
    assert.ok(order.indexOf('src/preview.js') !== -1 && order.indexOf('src/preview.js') < order.indexOf('src/app/core.js'), 'preview.js loads before the app scripts');
    assert.ok(listed.indexOf('preview-ui.js') > listed.indexOf('tauri-files.js'), 'preview-ui.js loads after tauri-files.js (it uses hasTauri and encodeProjectAssets)');
    const ui = readRoot('src/app/preview-ui.js');
    ['preview_start', 'preview_update', 'preview_stop', 'preview_open'].forEach((cmd) => {
        assert.includes(ui, cmd);
        assert.includes(readRoot('src-tauri/src/main.rs'), 'preview::' + cmd);
    });
    assert.includes(readRoot('src/app/core.js'), 'schedulePreviewPush');
    assert.includes(readRoot('src/app/assets.js'), 'schedulePreviewPush');
    const rust = readRoot('src-tauri/src/preview.rs');
    assert.ok(!/bind\("0\.0\.0\.0:0"\)/.test(readRoot('src-tauri/src/main.rs')), 'the always-on asset server stays on loopback');
    assert.includes(readRoot('src-tauri/src/main.rs'), '"127.0.0.1:0"');
    assert.includes(rust, 'strip_prefix(prefix.as_str())');
});

test('structure: the Format button, format.js, and the Alt+Shift+F shortcut are wired in (P7-14)', () => {
    assert.includes(html, 'id="formatBtn"');
    const order = Array.from(html.matchAll(/<script src="([^"]+)"><\/script>/g)).map((m) => m[1]);
    assert.ok(order.indexOf('src/format.js') !== -1 && order.indexOf('src/format.js') < order.indexOf('src/app/core.js'), 'format.js loads before the app scripts');
    assert.ok(listed.indexOf('format-ui.js') !== -1, 'format-ui.js is loaded');
    const ui = readRoot('src/app/format-ui.js');
    ['Format.byPath', 'Editing.diffEdit', "e.code === 'KeyF'"].forEach((needle) => assert.includes(ui, needle));
});

test('structure: the Help guide renders the shortcut cheat sheet from shortcuts.js (P7-15)', () => {
    ['id="shortcutList"', 'id="shortcutsHeading"'].forEach((needle) => assert.includes(html, needle));
    const order = Array.from(html.matchAll(/<script src="([^"]+)"><\/script>/g)).map((m) => m[1]);
    assert.ok(order.indexOf('src/shortcuts.js') !== -1 && order.indexOf('src/shortcuts.js') < order.indexOf('src/app/core.js'), 'shortcuts.js loads before the app scripts');
    assert.includes(readRoot('src/app/help.js'), 'Shortcuts.GROUPS');
});

test('structure: Explorer folders collapse and an image click opens Assets instead of inserting', () => {
    const core = readRoot('src/app/core.js');
    ['explorerCollapsed', 'toggleExplorerDir', 'expandExplorerTo', 'aria-expanded'].forEach((needle) => assert.includes(core, needle));
    assert.ok(!core.includes("'Inserted <img> for '"), 'the Explorer no longer inserts an image when it is clicked');
    assert.includes(core, 'openAssetManager();');
    assert.includes(readRoot('src/app/explorer-move.js'), 'expandExplorerTo');
});

test('structure: the File and Edit menus hold the moved toolbar buttons and menus.js drives them (D-032)', () => {
    ['id="fileMenuBtn"', 'id="editMenuBtn"', 'id="fileMenuPanel"', 'id="editMenuPanel"'].forEach((needle) => assert.includes(html, needle));
    const panel = (id) => html.slice(html.indexOf('id="' + id + '"'), html.indexOf('class="menu-wrap"', html.indexOf('id="' + id + '"')) === -1 ? html.indexOf('class="insert-dropdown-wrap"') : html.indexOf('class="menu-wrap"', html.indexOf('id="' + id + '"')));
    ['newBtn', 'libraryBtn', 'folderBtn', 'exportBtn', 'previewBtn'].forEach((id) => assert.includes(panel('fileMenuPanel'), 'id="' + id + '"'));
    ['undoBtn', 'redoBtn', 'copyBtn', 'formatBtn', 'menuFindBtn', 'menuReplaceBtn', 'menuFindProjectBtn'].forEach((id) => assert.includes(panel('editMenuPanel'), 'id="' + id + '"'));
    const strip = html.slice(html.indexOf('class="tab-strip"'), html.indexOf('id="file-bar"'));
    assert.ok(!strip.includes('formatBtn'), 'the Format button is not in the tab strip');
    assert.ok(listed.indexOf('menus.js') > listed.indexOf('typing.js') && listed.indexOf('menus.js') > listed.indexOf('find.js'), 'menus.js loads after typing.js and find.js');
});

test('structure: Open file / Open folder / Open project, saved folder links, and Reload from disk are wired in (D-033)', () => {
    ['id="openFileBtn"', 'id="folderBtn"', 'id="libraryBtn"', 'id="fileReloadBtn"'].forEach((needle) => assert.includes(html, needle));
    const panel = html.slice(html.indexOf('id="fileMenuPanel"'), html.indexOf('</div>', html.indexOf('id="fileMenuPanel"')));
    ['openFileBtn', 'folderBtn', 'libraryBtn'].forEach((id) => assert.includes(panel, 'id="' + id + '"'));
    const order = Array.from(html.matchAll(/<script src="([^"]+)"><\/script>/g)).map((m) => m[1]);
    assert.ok(order.indexOf('src/projectlink.js') !== -1 && order.indexOf('src/projectlink.js') < order.indexOf('src/app/core.js'), 'projectlink.js loads before the app scripts');
    assert.ok(listed.indexOf('project-links.js') > listed.indexOf('tauri-files.js'), 'project-links.js loads after tauri-files.js');
    const tauri = readRoot('src/app/tauri-files.js');
    ['folderOwner', 'openExistingFolderProject', 'adoptExportFolder', 'markLinkSynced', 'detachProjectFolder'].forEach((needle) => assert.includes(tauri, needle));
    assert.includes(readRoot('src/app/persistence.js'), 'Store.loadLinks');
    assert.includes(readRoot('src/app/persistence.js'), 'restoreProjectLink');
    assert.includes(readRoot('src-tauri/src/main.rs'), 'use_project_folder,');
    assert.includes(readRoot('src/app/project-links.js'), "tauriInvoke('use_project_folder'");
});

test('structure: the home page is a self-contained how-to whose links and anchors resolve (index.html)', () => {
    const home = readRoot('index.html');
    assert.ok(!/<script\b/i.test(home) && !/<style\b/i.test(home), 'index.html has no inline or external scripts or inline styles');
    const local = Array.from(home.matchAll(/(?:href|src)="([^"#:]+)(?:#[^"]*)?"/g)).map((m) => m[1]).filter((u) => !/^(https?:|mailto:)/.test(u));
    assert.ok(local.length >= 4, 'the page links to its stylesheet, app, and manual');
    local.forEach((u) => assert.ok(fs.existsSync(path.join(root, u)), 'index.html links to a missing file: ' + u));
    const ids = new Set(Array.from(home.matchAll(/\bid="([^"]+)"/g)).map((m) => m[1]));
    Array.from(home.matchAll(/href="#([^"]+)"/g)).forEach((m) => assert.ok(ids.has(m[1]), 'index.html links to a missing anchor #' + m[1]));
    ['href="app.html"', 'href="docs/manual.html"', '<h1 id="title">'].forEach((needle) => assert.includes(home, needle));
    assert.ok(!/(?:src|href)="(?:https?:)?\/\/(?!github\.com\/aedmark\/)/i.test(home), 'the only outside links are to the project repositories');
    const homeCss = readRoot('src/home.css');
    assert.ok(!/url\(\s*['"]?(?:https?:)?\/\//i.test(homeCss) && !/@import/.test(homeCss), 'home.css loads nothing from another site');
});

test('structure: the syntax colour layer is emptied when the language changes or the layer and its keys disagree', () => {
    const shade = readRoot('src/app/shade.js');
    assert.includes(shade, "if (shadeLang !== activeTab) {\n            shadeLayer.textContent = '';");
    assert.includes(shade, 'shadeLayer.children.length !== shadeKeys.length');
    assert.ok(!/if \(shadeLang !== activeTab\) shadeKeys = \[\];/.test(shade), 'resetting only the keys leaves the old lines in the layer');
});

test('structure: Prism is vendored unmodified with its licence, loaded before code-shade.js with auto-highlighting off, and credited in LICENSE (D-034)', () => {
    const order = Array.from(html.matchAll(/<script src="([^"]+)"[^>]*><\/script>/g)).map((m) => m[1]);
    assert.ok(order.indexOf('src/vendor/prism/prism.js') !== -1 && order.indexOf('src/vendor/prism/prism.js') < order.indexOf('src/code-shade.js'), 'prism.js loads before code-shade.js');
    assert.includes(html, '<script src="src/vendor/prism/prism.js" data-manual></script>');
    const prism = readRoot('src/vendor/prism/prism.js');
    ['Prism.languages.markup = {', 'Prism.languages.css = {', 'Prism.languages.javascript = '].forEach((needle) => assert.includes(prism, needle));
    assert.includes(readRoot('src/vendor/prism/LICENSE'), 'Copyright (c) 2012 Lea Verou');
    const license = readRoot('LICENSE');
    ['Prism', 'prismjs.com', 'Lea Verou', 'MIT License'].forEach((needle) => assert.includes(license, needle));
    const shade = readRoot('src/code-shade.js');
    assert.includes(shade, 'Prism.tokenize');
    assert.ok(!/\.highlight\(|highlightElement|innerHTML/.test(shade + readRoot('src/app/shade.js')), 'Prism output is never turned into HTML');
});

test('structure: the product is named Plainchant Scribe everywhere the app, its storage, and its desktop shell are named (P0-03)', () => {
    const files = ['app.html', 'index.html', 'manifest.webmanifest', 'sw.js', 'package.json', 'src-tauri/Cargo.toml', 'src-tauri/tauri.conf.json', 'src-tauri/src/main.rs'];
    const walk = (dir) => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
    walk('src').filter((f) => /\.(js|css|md)$/.test(f)).forEach((f) => files.push(f));
    files.forEach((f) => assert.ok(!/plainchant[-_ ]web|plainchantWeb|io\.plainchant\.web/i.test(readRoot(f)), f + ' still uses the Plainchant Web name'));
    assert.includes(readRoot('src-tauri/tauri.conf.json'), '"identifier": "io.plainchant.scribe"');
    assert.includes(readRoot('src/store.js'), "'plainchant_scribe'");
    assert.includes(readRoot('sw.js'), "'plainchant-scribe-v1'");
    assert.includes(readRoot('src/app/settings.js'), "'plainchant_scribe_settings'");
    assert.includes(readRoot('src/app/persistence.js'), "'plainchant_scribe_emergency'");
});

// Runs sw.js in a sandbox with fake caches and network. The harness is synchronous, so promises are a synchronous
// stand-in that can also reject.
function runServiceWorker(network) {
    const settle = (ok, value) => ({
        then(onOk, onBad) {
            const f = ok ? onOk : onBad;
            if (!f) return settle(ok, value);
            try { return lift(f(value)); } catch (err) { return settle(false, err); }
        },
        catch(onBad) { return this.then(null, onBad); }
    });
    const lift = (v) => (v && typeof v.then === 'function' ? v : settle(true, v));
    const Sync = { resolve: lift, reject: (e) => settle(false, e), all: (list) => { const out = []; list.forEach((p, i) => lift(p).then((v) => { out[i] = v; })); return lift(out); } };
    const handlers = {}, opened = [], fetched = [], added = [];
    const origin = 'http://localhost:8081';
    const store = { 'plainchant-scribe-v0': {}, 'plainchant-scribe-v1': { [origin + '/app.html']: 'cached app' }, 'plainchant-web-v1': { [origin + '/app.html']: 'web app', [origin + '/missing.js']: 'web file' }, 'other-app': {} };
    const caches = {
        keys: () => Sync.resolve(Object.keys(store)),
        delete: (k) => { delete store[k]; return Sync.resolve(true); },
        open: (k) => {
            opened.push(k);
            store[k] = store[k] || {};
            return Sync.resolve({ match: (key) => Sync.resolve(store[k][key]), put: (key, res) => { store[k][key] = res; return Sync.resolve(); }, addAll: (reqs) => { added.push.apply(added, reqs); return Sync.resolve(); } });
        },
        match: () => { throw new Error('caches.match searches every app\'s cache on the origin'); }
    };
    function Request(url, init) { this.url = url; this.cache = init && init.cache; }
    const Response = { error: () => 'network error' };
    const fetch = (url, init) => { fetched.push([url, init]); return network(url); };
    const self = { location: { origin: origin }, addEventListener: (type, fn) => { handlers[type] = fn; }, skipWaiting: () => {}, clients: { claim: () => Sync.resolve() } };
    vm.runInNewContext(readRoot('sw.js'), { self: self, caches: caches, fetch: fetch, Request: Request, Response: Response, URL: URL, Promise: Sync });
    const get = (url, method) => {
        let answer, intercepted = false;
        handlers.fetch({ request: { method: method || 'GET', url: url }, respondWith: (p) => { intercepted = true; p.then((v) => { answer = v; }); } });
        return { answer: answer, intercepted: intercepted };
    };
    return { handlers: handlers, store: store, opened: opened, fetched: fetched, added: added, get: get, origin: origin, Sync: Sync };
}

test('offline: the service worker touches only Scribe\'s own caches, so an app on the same origin keeps its cache', () => {
    const sw = runServiceWorker((url) => { throw new Error('no network in this test: ' + url); });
    sw.handlers.activate({ waitUntil: () => {} });
    assert.deepEqual(Object.keys(sw.store).sort(), ['other-app', 'plainchant-scribe-v1', 'plainchant-web-v1'], 'only an old Scribe cache is deleted');
    const offline = runServiceWorker(() => offline.Sync.reject(new Error('offline')));
    assert.equal(offline.get(offline.origin + '/missing.js').answer, 'network error', 'a miss offline is not answered from another app\'s cache');
    assert.ok(offline.opened.every((k) => k === 'plainchant-scribe-v1'), offline.opened.join());
});

test('offline: app files come from the network first and refresh the cache, so an update shows on the next load (P0-07)', () => {
    const fresh = { ok: true, body: 'new app', clone: () => ({ ok: true, body: 'new app (copy)' }) };
    const sw = runServiceWorker((url) => sw.Sync.resolve(/missing/.test(url) ? { ok: false, status: 404, clone: () => { throw new Error('a failed response is not stored'); } } : fresh));
    const r = sw.get(sw.origin + '/app.html?fresh=2#top');
    assert.ok(r.intercepted);
    assert.equal(r.answer, fresh, 'online, the network answers even though a cached copy exists');
    assert.deepEqual(sw.fetched[0], [sw.origin + '/app.html?fresh=2#top', { cache: 'no-cache', credentials: 'same-origin' }], 'revalidated past the browser\'s HTTP cache');
    assert.deepEqual(sw.store['plainchant-scribe-v1'][sw.origin + '/app.html'], { ok: true, body: 'new app (copy)' }, 'the stored copy is refreshed, keyed without the query');
    assert.equal(sw.store['plainchant-web-v1'][sw.origin + '/app.html'], 'web app', 'another app\'s cache is untouched');
    assert.equal(sw.get(sw.origin + '/missing.js').answer.status, 404, 'a 404 passes through');
    assert.equal(sw.store['plainchant-scribe-v1'][sw.origin + '/missing.js'], undefined);
    assert.equal(sw.get('https://fonts.example.org/a.woff2').intercepted, false, 'other origins are not handled');
    assert.equal(sw.get(sw.origin + '/app.html', 'POST').intercepted, false);
    const offline = runServiceWorker(() => offline.Sync.reject(new Error('offline')));
    assert.equal(offline.get(offline.origin + '/app.html?x=1').answer, 'cached app', 'offline, the stored copy answers');
    offline.handlers.install({ waitUntil: () => {} });
    assert.equal(offline.added.length, (readRoot('sw.js').match(/^    '[^']+',?$/gm) || []).length, 'install stores every app file');
    assert.ok(offline.added.every((req) => req.cache === 'reload'), 'install skips the browser\'s HTTP cache');
});

test('offline: the dev server port is not Plainchant Web\'s 8080, so the two apps never share an origin', () => {
    const serve = JSON.parse(readRoot('package.json')).scripts.serve;
    assert.ok(/http\.server 8081$/.test(serve), serve);
});

test('structure: the features Scribe does not use are gone: flex/grid handles, breakpoints, pseudo-state bar, Insert palette, Live JS, Console (P0-04)', () => {
    ['src/layout.js', 'src/app/stage-layout.js', 'src/app/layout-ui.js', 'src/app/css-media.js', 'src/app/css-states.js', 'src/app/insert-drag.js', 'src/app/console-ui.js', 'src/app/stage-live.js'].forEach((f) => assert.ok(!fs.existsSync(path.join(root, f)), f + ' should have been removed'));
    ['id="cssLayoutGroup"', 'id="cssMediaBar"', 'id="cssStateBar"', 'id="insertMenuBtn"', 'id="ctxInsertTrigger"', 'id="modeLiveBtn"', 'id="consoleList"'].forEach((needle) => assert.excludes(html, needle));
    const code = ['src/app/stage.js', 'src/app/typing.js', 'src/app/inspector-ui.js', 'src/project.js', 'src/editing.js', 'src/css-ast.js', 'src/dom-outline.js'].map(readRoot).join('\n');
    ['buildLayoutBridgeScript', 'insertSnippet', 'setInsertMenuOpen', 'buildLiveBridgeScript', 'consoleBridge', 'forceStates', 'withState', 'MEDIA_PRESETS', 'dropPlacement', 'SNIPPETS', 'liveJs'].forEach((needle) => assert.excludes(code, needle));
    assert.ok(html.includes('id="previewBtn"') && html.includes('data-insp="parts"'), 'the preview (send to reader) and shared parts are kept (D-009)');
});

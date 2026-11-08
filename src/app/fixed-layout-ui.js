// Fixed layout (P7-01, D-052): the Book tab's Page layout section makes the whole book pre-paginated with one page size
// and a spread setting (BookLayout), each change one undo step. On the Stage a fixed page is drawn at its viewport
// size and scaled to fit, without the reader settings, which do not apply to it; when the book asks for spreads and the
// Stage is wide enough, the facing page is shown beside it, read-only, and a click on it opens it.

const fxlBox = document.getElementById('fxlBox');
const fxlOptions = document.getElementById('fxlOptions');
const fxlPreset = document.getElementById('fxlPreset');
const fxlWidth = document.getElementById('fxlWidth');
const fxlHeight = document.getElementById('fxlHeight');
const fxlSpread = document.getElementById('fxlSpread');
const stageFacing = document.getElementById('stageFacing');
const stageFacingHit = document.getElementById('stageFacingHit');
let stageFacingShown = { path: null, entries: null, url: null };

const layoutAssets = () => Object.keys(projectAssets || {});

function refreshLayoutUi() {
    if (!isBookProject()) return;
    let s;
    try { s = BookLayout.state(projectFiles.entries, layoutAssets()); } catch (e) { return; }
    if (!fxlPreset.options.length) {
        BookLayout.PRESETS.forEach((p) => { const o = document.createElement('option'); o.value = p.id; o.textContent = p.label + ' (' + p.width + ' × ' + p.height + ')'; fxlPreset.appendChild(o); });
        const custom = document.createElement('option');
        custom.value = 'custom';
        custom.textContent = 'Custom size';
        fxlPreset.appendChild(custom);
    }
    fxlBox.checked = s.on;
    fxlOptions.hidden = !s.on;
    const preset = BookLayout.PRESETS.find((p) => p.width === s.width && p.height === s.height);
    fxlPreset.value = preset ? preset.id : 'custom';
    fxlWidth.value = s.width || '';
    fxlHeight.value = s.height || '';
    // An imported book may leave the spread to the reading system (auto) or use the deprecated portrait value.
    const known = BookLayout.SPREADS.indexOf(s.spread) !== -1;
    fxlSpread.querySelector('option[value=""]').hidden = known;
    fxlSpread.value = known ? s.spread : '';
}

function layoutAction(run, notice) {
    syncBufferFromEditor();
    let next;
    try { next = run(projectFiles.entries, layoutAssets()); } catch (e) { showNotice(e.message, true); refreshLayoutUi(); return; }
    if (next !== projectFiles.entries) {
        commitFileChange(next, { tree: projectFiles.tree, openTabs: openTabs, activeFile: activeFile, activeHtmlFile: activeHtmlFile });
        showNotice(notice);
    }
    refreshLayoutUi();
}

function chosenSize() {
    const preset = BookLayout.PRESETS.find((p) => p.id === fxlPreset.value);
    return preset ? { width: preset.width, height: preset.height } : { width: Number(fxlWidth.value), height: Number(fxlHeight.value) };
}

fxlBox.addEventListener('change', async () => {
    if (fxlBox.checked) {
        const size = BookLayout.PRESETS[0];
        layoutAction((e, a) => BookLayout.enable(e, a, { width: size.width, height: size.height, spread: 'landscape' }), 'The book is now fixed layout: every page is ' + size.width + ' × ' + size.height + ' pixels. Readers cannot resize its text.');
        return;
    }
    const pages = BookLayout.state(projectFiles.entries, layoutAssets()).docs.length;
    if (!await askConfirm({ title: 'Make the book reflowable?', text: 'The page size is removed from ' + pages + (pages === 1 ? ' page' : ' pages') + ', and positioned layouts will flow as text. Undo brings it all back.', confirm: 'Make reflowable' })) { fxlBox.checked = true; return; }
    layoutAction((e, a) => BookLayout.disable(e, a), 'The book is reflowable again.');
});
fxlPreset.addEventListener('change', () => {
    if (fxlPreset.value === 'custom') { fxlWidth.focus(); return; }
    const s = chosenSize();
    layoutAction((e, a) => BookLayout.setSize(e, a, s.width, s.height), 'Every page is now ' + s.width + ' × ' + s.height + ' pixels.');
});
[fxlWidth, fxlHeight].forEach((input) => input.addEventListener('change', () => {
    const s = { width: Number(fxlWidth.value), height: Number(fxlHeight.value) };
    layoutAction((e, a) => BookLayout.setSize(e, a, s.width, s.height), 'Every page is now ' + s.width + ' × ' + s.height + ' pixels.');
}));
fxlSpread.addEventListener('change', () => {
    if (!fxlSpread.value) return;
    const label = fxlSpread.options[fxlSpread.selectedIndex].textContent.toLowerCase();
    layoutAction((e, a) => BookLayout.setSpread(e, a, fxlSpread.value), 'Spreads: ' + label + '.');
});

// The active page's size when it is a fixed-layout page: { width, height }, with nulls for device-width/height.
function fixedPageSize(path) {
    if (!isBookProject() || !path) return null;
    if (BookLayout.fixedDocs(projectFiles.entries, layoutAssets()).indexOf(path) === -1) return null;
    return BookLayout.pageSize(projectFiles.entries[path]) || { width: null, height: null };
}

const isFixedStagePage = () => Boolean(fixedPageSize(activeHtmlFile));

// The page beside the active one when the book shows spreads here: { path, side } or null.
function facingPage(wide) {
    const s = BookLayout.state(projectFiles.entries, layoutAssets());
    if (!(s.spread === 'both' || ((s.spread === 'landscape' || s.spread === 'portrait') && wide))) return null;
    const pair = BookLayout.spreads(projectFiles.entries, layoutAssets()).find((p) => p.indexOf(activeHtmlFile) !== -1);
    if (!pair) return null;
    const other = pair[0] === activeHtmlFile ? pair[1] : pair[0];
    return other ? { path: other, side: pair[0] === other ? 'left' : 'right' } : null;
}

function placePage(frame, size, scale, left) {
    frame.style.width = size.width + 'px';
    frame.style.height = size.height + 'px';
    frame.style.transform = scale < 1 ? 'scale(' + scale + ')' : '';
    frame.style.left = left + 'px';
    frame.style.top = '0px';
}

function hideFacing() {
    stageFacing.hidden = true;
    stageFacingHit.hidden = true;
    if (stageFacingShown.url) URL.revokeObjectURL(stageFacingShown.url);
    stageFacingShown = { path: null, entries: null, url: null };
    if (stageFacing.hasAttribute('src')) stageFacing.removeAttribute('src');
}

// The facing page is a plain copy: no Design bridge, and its sandbox runs no scripts at all.
function showFacing(path) {
    if (stageFacingShown.path !== path || stageFacingShown.entries !== projectFiles.entries) {
        const res = BookStage.assemble(projectFiles.entries, path, projectAssetUrls, {});
        if (!res.ok) { hideFacing(); return false; }
        const old = stageFacingShown.url;
        const url = URL.createObjectURL(new Blob([res.xhtml], { type: 'application/xhtml+xml' }));
        stageFacingShown = { path: path, entries: projectFiles.entries, url: url };
        stageFacing.src = url;
        if (old) URL.revokeObjectURL(old);
    }
    stageFacing.hidden = false;
    stageFacingHit.hidden = false;
    stageFacingHit.title = 'Open ' + path.split('/').pop();
    stageFacingHit.setAttribute('aria-label', 'Open the facing page, ' + path.split('/').pop());
    return true;
}

// Called by layoutDevice: returns true when the active page is fixed and has been laid out here.
function layoutFixedPage() {
    const size = fixedPageSize(activeHtmlFile);
    if (!size) { hideFacing(); return false; }
    deviceSwitch.hidden = true;
    deviceRotate.disabled = true;
    stageFrameWrap.dataset.vp = 'full';
    if (!size.width || !size.height) { clearDeviceFrame(); hideFacing(); return true; }
    stageFrameWrap.dataset.device = 'fixed';
    const availW = Math.max(1, stageFrameWrap.clientWidth - 2), availH = Math.max(1, stageFrameWrap.clientHeight - 2);
    const facing = facingPage(availW > availH);
    const pages = facing ? 2 : 1;
    const scale = Math.min(1, availW / (size.width * pages), availH / size.height);
    const start = Math.max(0, (availW - size.width * scale * pages) / 2);
    const right = start + size.width * scale;
    placePage(stageFrame, size, scale, facing && facing.side === 'left' ? right : start);
    if (facing && showFacing(facing.path)) {
        const at = facing.side === 'left' ? start : right;
        placePage(stageFacing, BookLayout.pageSize(projectFiles.entries[facing.path]) || size, scale, at);
        Object.assign(stageFacingHit.style, { left: at + 'px', top: '0px', width: size.width * scale + 'px', height: size.height * scale + 'px' });
    } else hideFacing();
    return true;
}

stageFacingHit.addEventListener('click', () => { if (stageFacingShown.path) goToChapter(stageFacingShown.path); });

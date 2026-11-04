const panesSwitch = document.getElementById('panesSwitch');
const panesButtons = Array.from(panesSwitch.querySelectorAll('button[data-panes]'));
const canvasTools = document.querySelector('.canvas-tools');
const voidButtons = document.querySelector('.pane-void .button-group');
const modeButtons = Array.from(document.querySelectorAll('.mode-btn'));
const viewportButtons = Array.from(document.querySelectorAll('.vp-btn'));
const inspectorToggleBtn = document.getElementById('inspectorToggleBtn');
const inspectorPanel = document.getElementById('inspectorPanel');
const inspectorHeader = document.getElementById('inspectorHeader');
const inspDockBtn = document.getElementById('inspDockBtn');
const canvasBody = document.getElementById('canvasBody');
const inspectorResizer = document.getElementById('inspectorResizer');
const inspCollapseBtn = document.getElementById('inspCollapseBtn');
const inspCloseBtn = document.getElementById('inspCloseBtn');
const PANES_KEYS = { Digit1: 'write', Digit2: 'both', Digit3: 'preview' };

let inspectorCollapsed = false;
let inspectorFloating = false;
let inspectorDock = 'bottom';
const DOCK_LABELS = { bottom: 'Bottom', top: 'Top', left: 'Left', right: 'Right', float: 'Float' };
let floatDrag = null;

function panesShown() {
    if (mobileMQ.matches) return document.body.dataset.view === 'preview' ? 'preview' : 'write';
    return settings.panes;
}

function showPanes() {
    if (mobileMQ.matches) delete document.body.dataset.panes;
    else document.body.dataset.panes = settings.panes;
    panesButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.panes === settings.panes)));
    const home = panesShown() === 'write' && !mobileMQ.matches ? voidButtons : canvasTools;
    if (panesSwitch.parentElement !== home) {
        const had = panesSwitch.contains(document.activeElement) ? document.activeElement : null;
        home.insertBefore(panesSwitch, home.firstChild);
        if (had) had.focus();
    }
    placeShade();
}

function setPanes(panes, toEditor) {
    setSetting('panes', panes);
    showPanes();
    if (toEditor && panesShown() !== 'preview') editor.focus({ preventScroll: true });
}

function setStageMode(mode) {
    if (mode !== 'design' && mode !== 'live') return;
    stageMode = mode;
    modeButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
    scheduleStageRender(false);
    showNotice(mode === 'live' ? 'Live JS Mode active: scripts are running.' : 'Design Mode active: click elements to inspect or double-click to edit.');
}

function setStageViewport(vp) {
    stageViewport = vp;
    viewportButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.vp === vp)));
    stageFrameWrap.dataset.vp = vp;
}

function toggleInspector(force) {
    const next = typeof force === 'boolean' ? force : inspectorPanel.hidden;
    inspectorPanel.hidden = !next;
    if (next && inspectorCollapsed) {
        setInspectorCollapsed(false);
    }
    inspectorToggleBtn.setAttribute('aria-pressed', String(next));
    setSetting('inspector', next);
}

function setInspectorCollapsed(collapsed) {
    inspectorCollapsed = Boolean(collapsed);
    inspectorPanel.classList.toggle('collapsed', inspectorCollapsed);
    if (inspCollapseBtn) {
        inspCollapseBtn.textContent = inspectorCollapsed ? '▴' : '▾';
        inspCollapseBtn.title = inspectorCollapsed ? 'Expand Inspector' : 'Collapse Inspector';
    }
}

function setInspectorDock(dock, remember) {
    if (!DOCK_LABELS[dock]) return;
    inspectorDock = dock;
    inspectorFloating = dock === 'float';
    canvasBody.dataset.dock = dock;
    Object.keys(DOCK_LABELS).forEach((d) => inspectorPanel.classList.toggle('dock-' + d, d === dock));
    inspectorPanel.classList.toggle('floating', inspectorFloating);
    if (!inspectorFloating) {
        inspectorPanel.style.left = '';
        inspectorPanel.style.top = '';
    } else if (inspectorCollapsed) {
        setInspectorCollapsed(false);
    }
    inspectorResizer.hidden = dock !== 'left' && dock !== 'right';
    inspDockBtn.textContent = DOCK_LABELS[dock] + ' \u25be';
    if (remember !== false) setSetting('inspectorDock', dock);
}

panesButtons.forEach((b) => b.addEventListener('click', () => setPanes(b.dataset.panes)));
modeButtons.forEach((b) => b.addEventListener('click', () => setStageMode(b.dataset.mode)));
viewportButtons.forEach((b) => b.addEventListener('click', () => setStageViewport(b.dataset.vp)));
inspectorToggleBtn.addEventListener('click', () => toggleInspector());

if (inspCloseBtn) {
    inspCloseBtn.addEventListener('click', () => toggleInspector(false));
}
if (inspCollapseBtn) {
    inspCollapseBtn.addEventListener('click', () => setInspectorCollapsed(!inspectorCollapsed));
}
if (inspectorHeader) {
    inspectorHeader.addEventListener('pointerdown', (e) => {
        if (!inspectorFloating || e.target.closest('button')) return;
        const rect = inspectorPanel.getBoundingClientRect();
        floatDrag = {
            startX: e.clientX,
            startY: e.clientY,
            origLeft: rect.left,
            origTop: rect.top
        };
        inspectorHeader.setPointerCapture(e.pointerId);
    });
    inspectorHeader.addEventListener('pointermove', (e) => {
        if (!floatDrag) return;
        const left = Math.max(8, Math.min(window.innerWidth - 260, floatDrag.origLeft + (e.clientX - floatDrag.startX)));
        const top = Math.max(8, Math.min(window.innerHeight - 80, floatDrag.origTop + (e.clientY - floatDrag.startY)));
        inspectorPanel.style.left = left + 'px';
        inspectorPanel.style.top = top + 'px';
    });
    ['pointerup', 'pointercancel'].forEach((ev) => {
        inspectorHeader.addEventListener(ev, () => { floatDrag = null; });
    });
}

document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && e.code === 'KeyI') {
        e.preventDefault();
        toggleInspector();
        return;
    }
    const panes = PANES_KEYS[e.code];
    if (!panes || !(e.ctrlKey || e.metaKey) || !e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (!mobileMQ.matches) setPanes(panes, true);
    else if (panes !== 'both') setView(panes);
});
mobileMQ.addEventListener('change', showPanes);
showPanes();
setInspectorDock(settings.inspectorDock, false);
toggleInspector(settings.inspector !== false);

const dockMenu = document.getElementById('dockMenu');
const INSPECTOR_MIN_WIDTH = 240;
let resizeDrag = null;

function closeDockMenu() {
    dockMenu.hidden = true;
    inspDockBtn.setAttribute('aria-expanded', 'false');
}

function openDockMenu() {
    dockMenu.querySelectorAll('[data-dock]').forEach((item) => item.setAttribute('aria-checked', String(item.dataset.dock === inspectorDock)));
    dockMenu.hidden = false;
    const anchor = inspDockBtn.getBoundingClientRect();
    const width = dockMenu.offsetWidth;
    const height = dockMenu.offsetHeight;
    const left = Math.max(8, Math.min(anchor.right - width, window.innerWidth - width - 8));
    const below = anchor.bottom + 4;
    const top = below + height > window.innerHeight - 8 ? Math.max(8, anchor.top - height - 4) : below;
    dockMenu.style.left = left + 'px';
    dockMenu.style.top = top + 'px';
    inspDockBtn.setAttribute('aria-expanded', 'true');
    const current = dockMenu.querySelector('[aria-checked="true"]');
    if (current) current.focus();
}

function clampInspectorWidth(px) {
    const room = canvasBody.getBoundingClientRect().width;
    const max = Math.max(INSPECTOR_MIN_WIDTH, Math.min(640, room - 200));
    return Math.round(Math.max(INSPECTOR_MIN_WIDTH, Math.min(max, px)));
}

function applyInspectorWidth(px) {
    inspectorPanel.style.setProperty('--inspector-w', clampInspectorWidth(px) + 'px');
}

inspDockBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (dockMenu.hidden) openDockMenu();
    else closeDockMenu();
});
dockMenu.addEventListener('click', (e) => {
    const item = e.target.closest('[data-dock]');
    if (!item) return;
    closeDockMenu();
    setInspectorDock(item.dataset.dock);
});
dockMenu.addEventListener('keydown', (e) => {
    const items = Array.from(dockMenu.querySelectorAll('[data-dock]'));
    const at = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        items[(at + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus();
    } else if (e.key === 'Escape') {
        e.preventDefault();
        closeDockMenu();
        inspDockBtn.focus();
    }
});
document.addEventListener('click', (e) => {
    if (!dockMenu.hidden && !dockMenu.contains(e.target)) closeDockMenu();
});
window.addEventListener('resize', closeDockMenu);

inspectorResizer.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    resizeDrag = { startX: e.clientX, startWidth: inspectorPanel.getBoundingClientRect().width };
    inspectorResizer.setPointerCapture(e.pointerId);
});
inspectorResizer.addEventListener('pointermove', (e) => {
    if (!resizeDrag) return;
    const delta = e.clientX - resizeDrag.startX;
    applyInspectorWidth(resizeDrag.startWidth + (inspectorDock === 'left' ? delta : -delta));
});
['pointerup', 'pointercancel'].forEach((type) => inspectorResizer.addEventListener(type, () => {
    if (!resizeDrag) return;
    resizeDrag = null;
    setSetting('inspectorWidth', Math.round(inspectorPanel.getBoundingClientRect().width));
}));
inspectorResizer.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const grow = (e.key === 'ArrowRight') === (inspectorDock === 'left');
    applyInspectorWidth(inspectorPanel.getBoundingClientRect().width + (grow ? 16 : -16));
    setSetting('inspectorWidth', Math.round(inspectorPanel.getBoundingClientRect().width));
});

applyInspectorWidth(settings.inspectorWidth);

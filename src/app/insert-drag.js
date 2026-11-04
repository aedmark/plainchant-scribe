const INSERT_DRAG_THRESHOLD = 6;
const INSERT_EDGE_SCROLL_ZONE = 36;
const insertGhost = document.createElement('div');
insertGhost.className = 'insert-ghost';
insertGhost.setAttribute('aria-hidden', 'true');
insertGhost.hidden = true;
document.body.appendChild(insertGhost);

let insertDrag = null;
let insertEdgeTimer = null;
let insertEdgeSpeed = 0;
let swallowInsertClick = false;

function stageDocument() {
    try { return stageFrame.contentDocument; } catch (e) { return null; }
}

function clearInsertIndicator() {
    const doc = stageDocument();
    if (!doc) return;
    doc.querySelectorAll('[data-pc-drop-target]').forEach((el) => el.removeAttribute('data-pc-drop-target'));
}

function stopInsertEdgeScroll() {
    clearInterval(insertEdgeTimer);
    insertEdgeTimer = null;
    insertEdgeSpeed = 0;
}

function setInsertEdgeScroll(speed) {
    insertEdgeSpeed = speed;
    if (!speed) { stopInsertEdgeScroll(); return; }
    if (insertEdgeTimer) return;
    insertEdgeTimer = setInterval(() => {
        const win = stageFrame.contentWindow;
        if (win && insertEdgeSpeed) win.scrollBy(0, insertEdgeSpeed);
    }, 30);
}

function describeInsertDrop(point) {
    const rect = stageFrame.getBoundingClientRect();
    const inStage = point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
    if (!inStage) return { drop: null, hint: '' };
    if (stageMode !== 'design') return { drop: null, hint: 'Switch the Stage to Design mode to drop here' };
    const doc = stageDocument();
    if (!doc) return { drop: null, hint: '' };
    const hit = doc.elementFromPoint(point.x - rect.left, point.y - rect.top);
    let el = hit && hit.closest ? hit.closest('[data-pc-id]') : null;
    if (!el || el === doc.documentElement) el = doc.body;
    const node = el ? HtmlAst.findById(currentHtmlAst, el.getAttribute('data-pc-id')) : null;
    if (!node) return { drop: null, hint: '' };
    const box = el.getBoundingClientRect();
    const place = DomOutline.dropPlacement(node, box.height ? (point.y - rect.top - box.top) / box.height : 0.5);
    el.setAttribute('data-pc-drop-target', place.zone);
    const edge = point.y - rect.top < INSERT_EDGE_SCROLL_ZONE ? -14 : (rect.bottom - point.y < INSERT_EDGE_SCROLL_ZONE ? 14 : 0);
    setInsertEdgeScroll(edge);
    return { drop: { id: node.id, tag: node.tag, position: place.position, zone: place.zone }, hint: '' };
}

function endInsertDrag() {
    insertDrag = null;
    stopInsertEdgeScroll();
    clearInsertIndicator();
    insertGhost.hidden = true;
    document.body.classList.remove('insert-dragging');
}

function dropInsertedSnippet(kind, drop) {
    const snippet = Editing.SNIPPETS[kind];
    if (!snippet) return;
    const res = HtmlAst.insertElementAt(projectFiles.html, drop.id, drop.position, snippet);
    if (res.html === projectFiles.html) return;
    applyHtmlTransform(res.html, res.id);
    showNotice('Inserted <' + kind + '> ' + drop.zone + ' <' + drop.tag + '>');
}

insertBar.addEventListener('pointerdown', (e) => {
    const item = e.target.closest('.ins-btn[data-insert]');
    if (!item || e.button !== 0) return;
    insertDrag = {
        kind: item.dataset.insert,
        label: (item.querySelector('span') || item).textContent,
        pointerId: e.pointerId,
        x: e.clientX, y: e.clientY,
        active: false,
        drop: null
    };
});

document.addEventListener('pointermove', (e) => {
    if (!insertDrag || e.pointerId !== insertDrag.pointerId) return;
    if (!insertDrag.active) {
        if (Math.hypot(e.clientX - insertDrag.x, e.clientY - insertDrag.y) < INSERT_DRAG_THRESHOLD) return;
        insertDrag.active = true;
        try { document.body.setPointerCapture(e.pointerId); } catch (err) { /* the drag still follows the pointer inside the page */ }
        setInsertMenuOpen(false);
        document.body.classList.add('insert-dragging');
        insertGhost.hidden = false;
    }
    e.preventDefault();
    clearInsertIndicator();
    const outcome = describeInsertDrop({ x: e.clientX, y: e.clientY });
    if (!outcome.drop) stopInsertEdgeScroll();
    insertDrag.drop = outcome.drop;
    insertGhost.textContent = outcome.hint || (insertDrag.label + (outcome.drop ? ' → ' + outcome.drop.zone + ' <' + outcome.drop.tag + '>' : ''));
    insertGhost.classList.toggle('no-drop', !outcome.drop);
    insertGhost.style.left = Math.min(e.clientX + 14, window.innerWidth - 220) + 'px';
    insertGhost.style.top = (e.clientY + 14) + 'px';
});

document.addEventListener('pointerup', (e) => {
    if (!insertDrag || e.pointerId !== insertDrag.pointerId) return;
    const finished = insertDrag;
    const wasDrag = finished.active;
    endInsertDrag();
    if (!wasDrag) return;
    swallowInsertClick = true;
    setTimeout(() => { swallowInsertClick = false; }, 0);
    if (finished.drop) dropInsertedSnippet(finished.kind, finished.drop);
});

document.addEventListener('pointercancel', (e) => {
    if (insertDrag && e.pointerId === insertDrag.pointerId) endInsertDrag();
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && insertDrag && insertDrag.active) {
        e.preventDefault();
        endInsertDrag();
        swallowInsertClick = true;
        setTimeout(() => { swallowInsertClick = false; }, 0);
    }
}, true);

document.addEventListener('click', (e) => {
    if (swallowInsertClick) {
        e.preventDefault();
        e.stopPropagation();
    }
}, true);

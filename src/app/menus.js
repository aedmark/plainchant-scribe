const appMenus = Array.from(document.querySelectorAll('.menu-wrap')).map((wrap) => ({
    wrap: wrap,
    button: wrap.querySelector(':scope > .btn'),
    panel: wrap.querySelector(':scope > .menu-panel')
}));

function setAppMenu(menu, open) {
    menu.panel.hidden = !open;
    menu.button.setAttribute('aria-expanded', String(open));
}

function closeAppMenus(except) {
    appMenus.forEach((menu) => { if (menu !== except) setAppMenu(menu, false); });
}

appMenus.forEach((menu) => {
    menu.button.addEventListener('click', (e) => {
        e.stopPropagation();
        const open = menu.panel.hidden;
        closeAppMenus(menu);
        setAppMenu(menu, open);
        if (open) {
            const first = menu.panel.querySelector('.menu-item:not(:disabled)');
            if (first) first.focus({ preventScroll: true });
        }
    });
    menu.panel.addEventListener('click', () => setAppMenu(menu, false));
    menu.wrap.addEventListener('keydown', (e) => {
        const items = Array.from(menu.panel.querySelectorAll('.menu-item:not(:disabled)'));
        const at = items.indexOf(document.activeElement);
        if (e.key === 'Escape' && !menu.panel.hidden) {
            e.stopPropagation();
            setAppMenu(menu, false);
            menu.button.focus({ preventScroll: true });
        } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !menu.panel.hidden) {
            e.preventDefault();
            const down = e.key === 'ArrowDown';
            items[at === -1 ? (down ? 0 : items.length - 1) : (at + (down ? 1 : items.length - 1)) % items.length].focus();
        }
    });
});

document.addEventListener('click', (e) => {
    if (!e.target.closest('.menu-wrap')) closeAppMenus();
});

document.getElementById('menuFindBtn').addEventListener('click', () => openFind(false));
document.getElementById('menuReplaceBtn').addEventListener('click', () => openFind(true));
document.getElementById('menuFindProjectBtn').addEventListener('click', () => openFind(false, true));

const contextMenu = document.getElementById('contextMenu');
const ctxHeaderLabel = document.getElementById('ctxHeaderLabel');

function closeContextMenu() {
    if (!contextMenu || contextMenu.hidden) return;
    contextMenu.hidden = true;
}

function openContextMenuAt(clientX, clientY) {
    if (!contextMenu) return;
    const node = selectedPcId ? HtmlAst.findById(currentHtmlAst, selectedPcId) : null;
    const hasNode = Boolean(node && node.tag !== 'html' && node.tag !== 'head');
    const isMovable = Boolean(hasNode && node.tag !== 'body');

    if (ctxHeaderLabel) {
        ctxHeaderLabel.textContent = hasNode ? '<' + DomOutline.formatLabel(node) + '>' : '<body>';
    }

    contextMenu.querySelectorAll('[data-ctx-cmd]').forEach((btn) => {
        const cmd = btn.dataset.ctxCmd;
        if (cmd === 'move-up' || cmd === 'move-down' || cmd === 'duplicate' || cmd === 'wrap' || cmd === 'delete') {
            btn.disabled = !isMovable;
        } else if (cmd === 'undo') {
            btn.disabled = Boolean(undoBtn && undoBtn.disabled);
        } else if (cmd === 'redo') {
            btn.disabled = Boolean(redoBtn && redoBtn.disabled);
        }
    });

    contextMenu.hidden = false;
    const menuWidth = contextMenu.offsetWidth || 220;
    const menuHeight = contextMenu.offsetHeight || 290;
    const maxX = Math.max(8, window.innerWidth - menuWidth - 8);
    const maxY = Math.max(8, window.innerHeight - menuHeight - 8);
    const x = Math.max(8, Math.min(clientX, maxX));
    const y = Math.max(8, Math.min(clientY, maxY));

    contextMenu.style.left = x + 'px';
    contextMenu.style.top = y + 'px';
    contextMenu.classList.toggle('flip-left', x + menuWidth + 260 > window.innerWidth);
}

if (contextMenu) {
    contextMenu.addEventListener('click', (e) => {
        const act = e.target.closest('[data-ctx-cmd]');
        if (!act || act.disabled) return;
        const cmd = act.dataset.ctxCmd;
        closeContextMenu();
        if (cmd === 'move-up') moveSelectedElement('up');
        else if (cmd === 'move-down') moveSelectedElement('down');
        else if (cmd === 'duplicate') duplicateSelectedElement();
        else if (cmd === 'wrap' && selectedPcId) {
            applyHtmlTransform(HtmlAst.wrapElement(projectFiles.html, selectedPcId, 'div', { class: 'wrapper' }), selectedPcId);
        } else if (cmd === 'inspect-css') {
            switchInspectorTab('css', { forceOpen: true });
            jumpToActiveCssRule();
        } else if (cmd === 'undo') performUndo();
        else if (cmd === 'redo') performRedo();
        else if (cmd === 'delete') deleteSelectedElement();
    });
}

editor.addEventListener('contextmenu', (e) => {
    if (activeTab !== 'html') return;
    e.preventDefault();
    syncElementState();
    openContextMenuAt(e.clientX, e.clientY);
});

document.addEventListener('click', (e) => {
    if (contextMenu && !contextMenu.hidden && !contextMenu.contains(e.target)) {
        closeContextMenu();
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeContextMenu();
});

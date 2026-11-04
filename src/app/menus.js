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
        if (typeof setInsertMenuOpen === 'function') setInsertMenuOpen(false);
        setAppMenu(menu, open);
        if (open) menu.panel.querySelector('.menu-item:not(:disabled)').focus({ preventScroll: true });
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
document.getElementById('insertMenuBtn').addEventListener('click', () => closeAppMenus());

document.getElementById('menuFindBtn').addEventListener('click', () => openFind(false));
document.getElementById('menuReplaceBtn').addEventListener('click', () => openFind(true));
document.getElementById('menuFindProjectBtn').addEventListener('click', () => openFind(false, true));

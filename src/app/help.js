const helpModal = document.getElementById('help-modal');
const helpBtn = document.getElementById('helpBtn');
const helpLoadStarter = document.getElementById('helpLoadStarter');

function openHelp() {
    openModal(helpModal);
}

function renderShortcuts() {
    const box = document.getElementById('shortcutList');
    Shortcuts.GROUPS.forEach((group) => {
        const section = document.createElement('section');
        const title = document.createElement('h4');
        title.textContent = group.title;
        const rows = document.createElement('dl');
        group.items.forEach((item) => {
            const keys = document.createElement('dt');
            item.keys.forEach((combo, i) => {
                if (i) keys.append(' or ');
                const kbd = document.createElement('kbd');
                kbd.textContent = combo;
                keys.appendChild(kbd);
            });
            const action = document.createElement('dd');
            action.textContent = item.action;
            rows.append(keys, action);
        });
        section.append(title, rows);
        box.appendChild(section);
    });
}

renderShortcuts();
helpBtn.addEventListener('click', openHelp);
helpLoadStarter.addEventListener('click', () => {
    loadStarterProject();
    closeModal(helpModal);
    showNotice('Loaded starter landing page project.');
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'F1' || ((e.ctrlKey || e.metaKey) && e.key === '/')) {
        e.preventDefault();
        openHelp();
    }
});

const SETTINGS_KEY = 'plainchant_scribe_settings';
const SETTING_DEFAULTS = {
    theme: 'system',
    size: 'normal',
    colours: true,
    indent: true,
    panes: 'both',
    inspector: true,
    inspectorDock: 'bottom',
    inspectorWidth: 320,
    problemsFilter: 'all',
    readerSize: 100,
    readerMargins: 'normal',
    readerTheme: 'light'
};
const SETTING_CHOICES = {
    panes: ['both', 'write', 'preview'],
    theme: ['system', 'light', 'dark'],
    size: ['small', 'normal', 'large', 'larger'],
    inspectorDock: ['bottom', 'top', 'left', 'right', 'float'],
    problemsFilter: ['all', 'links', 'accessibility', 'markup'],
    readerSize: BookStage.READER.sizes,
    readerMargins: Object.keys(BookStage.READER.margins),
    readerTheme: Object.keys(BookStage.READER.themes)
};
const TEXT_SCALE = { small: 0.875, normal: 1, large: 1.15, larger: 1.3 };
const settingsModal = document.getElementById('settings-modal');
const settingBoxes = {
    colours: document.getElementById('setColours'),
    indent: document.getElementById('setIndent')
};
const systemLight = window.matchMedia('(prefers-color-scheme: light)');

function validSetting(name, value) {
    if (!(name in SETTING_DEFAULTS)) return false;
    if (SETTING_CHOICES[name]) return SETTING_CHOICES[name].indexOf(value) !== -1;
    return typeof value === typeof SETTING_DEFAULTS[name];
}

function readSettings() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {}; } catch (e) {
    }
    const out = Object.assign({}, SETTING_DEFAULTS);
    Object.keys(SETTING_DEFAULTS).forEach((k) => { if (validSetting(k, saved[k])) out[k] = saved[k]; });
    return out;
}

let settings = readSettings();

function themeShown() {
    if (settings.theme === 'system') return systemLight.matches ? 'light' : 'dark';
    return settings.theme;
}

function applyLook() {
    const root = document.documentElement;
    root.dataset.theme = themeShown();
    root.style.setProperty('--editor-scale', String(TEXT_SCALE[settings.size]));
    const bar = document.querySelector('meta[name="theme-color"]');
    if (bar) bar.setAttribute('content', getComputedStyle(root).getPropertyValue('--bg-void').trim() || '#f4efe4');
}

function setSetting(name, value) {
    if (!validSetting(name, value)) return;
    settings = Object.assign({}, settings, { [name]: value });
    const differs = {};
    Object.keys(settings).forEach((k) => { if (settings[k] !== SETTING_DEFAULTS[k]) differs[k] = settings[k]; });
    try {
        if (Object.keys(differs).length) localStorage.setItem(SETTINGS_KEY, JSON.stringify(differs));
        else localStorage.removeItem(SETTINGS_KEY);
    } catch (e) {
    }
    showSettings();
    if (name === 'colours') setShadeOn(settings.colours);
    if (name === 'theme' || name === 'size') applyLook();
    if (name === 'size') {
        placeShade();
        checkShade();
    }
}

function showSettings() {
    Object.keys(settingBoxes).forEach((k) => {
        if (settingBoxes[k]) settingBoxes[k].checked = settings[k];
    });
    settingsModal.querySelectorAll('input[type="radio"]').forEach((r) => {
        r.checked = settings[r.name] === r.value;
    });
}

function openSettings() {
    showSettings();
    openModal(settingsModal);
}

applyLook();

document.getElementById('settingsBtn').addEventListener('click', openSettings);
Object.keys(settingBoxes).forEach((k) => {
    if (settingBoxes[k]) settingBoxes[k].addEventListener('change', () => setSetting(k, settingBoxes[k].checked));
});
settingsModal.querySelectorAll('input[type="radio"]').forEach((r) => {
    r.addEventListener('change', () => { if (r.checked) setSetting(r.name, r.value); });
});
systemLight.addEventListener('change', () => { if (settings.theme === 'system') applyLook(); });

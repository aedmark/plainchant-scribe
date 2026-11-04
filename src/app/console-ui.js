const inspConsolePane = document.getElementById('inspConsolePane');
const consoleList = document.getElementById('consoleList');
const consoleCountBadge = document.getElementById('consoleCountBadge');
const consoleFilterButtons = Array.from(document.querySelectorAll('.console-filter'));
const CONSOLE_MAX_ENTRIES = 500;

let consoleEntries = [];
let consoleFilter = 'all';
let consoleUnread = 0;

function consoleMatchesFilter(entry) {
    if (consoleFilter === 'all') return true;
    if (consoleFilter === 'log') return entry.level === 'log' || entry.level === 'info';
    return entry.level === consoleFilter;
}

function renderConsole() {
    consoleList.textContent = '';
    const shown = consoleEntries.filter(consoleMatchesFilter);
    if (!shown.length) {
        const empty = document.createElement('div');
        empty.className = 'console-empty';
        empty.textContent = stageMode === 'design'
            ? 'Scripts do not run in Design mode. Switch the Stage to Live JS to see console output.'
            : 'No console output yet.';
        consoleList.appendChild(empty);
    }
    shown.forEach((entry) => {
        const row = document.createElement('div');
        row.className = 'console-row console-' + entry.level;
        const badge = document.createElement('span');
        badge.className = 'console-level';
        badge.textContent = entry.level;
        const time = document.createElement('span');
        time.className = 'console-time';
        time.textContent = new Date(entry.time).toLocaleTimeString([], { hour12: false });
        const msg = document.createElement('span');
        msg.className = 'console-msg';
        msg.textContent = entry.args.join(' ');
        row.append(badge, time, msg);
        if (entry.source && entry.line) {
            const link = document.createElement('button');
            link.type = 'button';
            link.className = 'console-src';
            link.textContent = entry.source + ':' + entry.line;
            link.title = 'Jump to this line in the Code editor';
            link.addEventListener('click', () => jumpToSourceLine(entry.source, entry.line));
            row.appendChild(link);
        }
        consoleList.appendChild(row);
    });
    consoleList.scrollTop = consoleList.scrollHeight;
}

function renderConsoleBadge() {
    consoleCountBadge.hidden = consoleUnread === 0;
    consoleCountBadge.textContent = String(consoleUnread);
    consoleCountBadge.classList.toggle('has-error', consoleEntries.some((e) => e.level === 'error'));
}

function addConsoleEntry(data) {
    const level = ['log', 'info', 'warn', 'error'].indexOf(data.level) !== -1 ? data.level : 'log';
    consoleEntries.push({
        level: level,
        args: Array.isArray(data.args) ? data.args.map(String) : [],
        line: typeof data.line === 'number' ? data.line : null,
        source: typeof data.source === 'string' ? data.source : null,
        time: typeof data.time === 'number' ? data.time : Date.now()
    });
    if (consoleEntries.length > CONSOLE_MAX_ENTRIES) consoleEntries.shift();
    if (activeInspectorTab === 'console' && !inspectorCollapsed) {
        consoleUnread = 0;
    } else {
        consoleUnread = Math.min(consoleUnread + 1, CONSOLE_MAX_ENTRIES);
    }
    renderConsoleBadge();
    renderConsole();
    if (level === 'error') showNotice('JS Error: ' + (data.args && data.args[0] || ''), true);
}

function clearConsole() {
    consoleEntries = [];
    consoleUnread = 0;
    renderConsoleBadge();
    renderConsole();
}

function markConsoleRead() {
    consoleUnread = 0;
    renderConsoleBadge();
    renderConsole();
}

function jumpToSourceLine(file, line) {
    if (panesShown() === 'preview') setPanes('both');
    openFileInEditor(file);
    const lines = editor.value.split('\n');
    const idx = Math.min(Math.max(line - 1, 0), lines.length - 1);
    const from = lines.slice(0, idx).reduce((n, l) => n + l.length + 1, 0);
    editor.focus({ preventScroll: true });
    editor.setSelectionRange(from, from + lines[idx].length);
    editor.scrollTop = Math.max(0, textTopIn(editor.value, from) - editor.clientHeight / 3);
    shadeLayer.scrollTop = editor.scrollTop;
}

consoleFilterButtons.forEach((b) => b.addEventListener('click', () => {
    consoleFilter = b.dataset.consoleFilter;
    consoleFilterButtons.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    renderConsole();
}));
document.getElementById('consoleClearBtn').addEventListener('click', clearConsole);

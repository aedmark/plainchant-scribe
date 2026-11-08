let startup = null;

async function start() {
    fitToViewport();
    await restoreLastScript();
    render(false);
    syncElementState();
    resetHistory();
    startSafekeeping();
    listenForDesktopBooks();
}

function whenReady() {
    return startup || Promise.resolve();
}

window.addEventListener('DOMContentLoaded', () => { startup = start(); });

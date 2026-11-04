// Device presets on the Stage (P2-04, D-022). For books, Fit, Phone, E-ink, and Tablet replace the inherited viewport
// switch: the Stage frame is drawn at the device's screen size in CSS px, so pages break as they would there, and is
// scaled down (never up) to fit. E-ink is also greyscale (a filter on the frame) with animation off (readerCss).

const deviceSwitch = document.getElementById('deviceSwitch');
const deviceRotate = document.getElementById('deviceRotate');
const viewportSwitch = document.getElementById('viewportSwitch');

function clearDeviceFrame() {
    delete stageFrameWrap.dataset.device;
    ['width', 'height', 'transform', 'left', 'top'].forEach((k) => { stageFrame.style[k] = ''; });
}

function layoutDevice() {
    const book = isBookProject();
    const p = readerPrefs();
    deviceSwitch.hidden = !book;
    viewportSwitch.hidden = book;
    // A book's Fit fills the Stage; a web project keeps the width its own switch chose.
    stageFrameWrap.dataset.vp = book ? 'full' : stageViewport;
    deviceSwitch.querySelectorAll('[data-device]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.device === p.device)));
    const size = book ? BookStage.deviceSize(p) : null;
    deviceRotate.disabled = !size;
    deviceRotate.setAttribute('aria-pressed', String(p.orientation === 'landscape'));
    if (!size) { clearDeviceFrame(); return; }
    stageFrameWrap.dataset.device = p.device;
    const scale = BookStage.fitScale(size, stageFrameWrap.clientWidth - 2, stageFrameWrap.clientHeight - 2);
    stageFrame.style.width = size.width + 'px';
    stageFrame.style.height = size.height + 'px';
    stageFrame.style.transform = scale < 1 ? 'scale(' + scale + ')' : '';
    stageFrame.style.left = Math.max(0, (stageFrameWrap.clientWidth - size.width * scale) / 2) + 'px';
    stageFrame.style.top = '0px';
    deviceSwitch.title = size.label + ', ' + size.width + ' × ' + size.height + (scale < 1 ? ', shown at ' + Math.round(scale * 100) + '%' : '');
}

deviceSwitch.querySelectorAll('[data-device]').forEach((b) => b.addEventListener('click', () => setReaderPref('readerDevice', b.dataset.device)));
deviceRotate.addEventListener('click', () => setReaderPref('readerOrientation', readerPrefs().orientation === 'landscape' ? 'portrait' : 'landscape'));
if (typeof ResizeObserver === 'function') new ResizeObserver(() => { if (stageFrameWrap.dataset.device) layoutDevice(); }).observe(stageFrameWrap);

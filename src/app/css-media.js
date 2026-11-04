const cssMediaBar = document.getElementById('cssMediaBar');
const cssMediaHint = document.getElementById('cssMediaHint');
const cssMediaButtons = Array.from(cssMediaBar.querySelectorAll('.css-media-btn'));

let activeCssMedia = '';

function cssEditMedia() {
    return activeCssTarget === 'inline' ? '' : activeCssMedia;
}

function cssMediaPreset(query) {
    return CssAst.MEDIA_PRESETS.find((p) => p.query === query) || null;
}

function refreshCssMediaUi() {
    const inline = activeCssTarget === 'inline';
    if (inline && activeCssMedia) activeCssMedia = '';
    cssMediaButtons.forEach((btn) => {
        btn.setAttribute('aria-pressed', String(btn.dataset.media === activeCssMedia));
        btn.disabled = inline && btn.dataset.media !== '';
    });
    if (inline) {
        cssMediaHint.textContent = 'Inline styles cannot be scoped to a breakpoint.';
    } else if (!activeCssMedia) {
        cssMediaHint.textContent = '';
    } else {
        const rule = CssAst.findRuleBySelector(currentCssAst, cssEditSelector(), activeCssMedia);
        cssMediaHint.textContent = 'Editing inside @media ' + activeCssMedia + (rule ? '' : ' (new rule on first change)') + ' · the Stage is resized to match';
    }
}

function setCssMedia(query) {
    const preset = cssMediaPreset(query);
    activeCssMedia = preset ? preset.query : '';
    setStageViewport(preset ? preset.key : 'full');
    refreshCssMediaUi();
    if (typeof refreshCssStateUi === 'function') refreshCssStateUi(selectedNodeForCss());
    populateCssValues(selectedNodeForCss());
}

cssMediaButtons.forEach((btn) => btn.addEventListener('click', () => setCssMedia(btn.dataset.media)));

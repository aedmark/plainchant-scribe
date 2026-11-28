function projectLinkTarget(rawHref) {
    ensureEntries();
    const target = Project.resolveRelativePath(activeHtmlFile, rawHref);
    return target && /\.html?$/i.test(target) && target in projectFiles.entries ? target : null;
}

function followProjectLink(rawHref) {
    if (isBookProject()) { followBookLink(rawHref); return; }
    const target = projectLinkTarget(rawHref);
    if (target) {
        openFileInEditor(target);
        showNotice('Opened ' + target);
        return;
    }
    const resolved = Project.resolveRelativePath(activeHtmlFile, rawHref);
    if (!resolved) showNotice('"' + rawHref + '" is not a link to a project page.', true);
    else if (!/\.html?$/i.test(resolved)) showNotice(resolved + ' is not an HTML page, so it was not opened.', true);
    else showNotice(resolved + ' was not found in this project.', true);
}

function followSelectedLink(pcId) {
    const node = HtmlAst.findById(currentHtmlAst, pcId || selectedPcId);
    if (node && node.attrs && node.attrs.href) followProjectLink(node.attrs.href);
}

// Live-patches an inlined stylesheet on the Stage without reloading the iframe or resetting scroll/page position.
function patchStageCss() {
    if (stageTimer || !stageFrame || !stageFrame.contentWindow) return false;
    try {
        const doc = stageFrame.contentDocument;
        if (!doc) return false;
        if (isBookProject()) {
            if (!stageBookUrl || !activeCssFile || typeof projectFiles.entries[activeCssFile] !== 'string') return false;
            // Fixed-layout spreads draw a second facing iframe; fall back to full redraw so both pages update together.
            if (typeof stageFacing !== 'undefined' && stageFacing && !stageFacing.hidden) return false;
            const hit = Array.from(doc.querySelectorAll('style[data-pc-href]')).find((s) => s.getAttribute('data-pc-href') === activeCssFile);
            if (!hit) return false;
            const css = BookStage.rewriteCss(projectFiles.entries[activeCssFile], activeCssFile, projectFiles.entries, projectAssetUrls, new Set([activeCssFile]), 0);
            stageFrame.contentWindow.postMessage({ type: 'pc-patch-css', href: activeCssFile, css: css }, '*');
            if (typeof pagedDoc === 'function' && pagedDoc() && typeof goToPage === 'function') {
                requestAnimationFrame(() => goToPage(stagePage.index));
            }
            return true;
        }
        if (!doc.getElementById('pc-project-css')) return false;
        const css = Project.buildPreviewCss(projectFiles, activeCssFile, { assetUrls: projectAssetUrls });
        stageFrame.contentWindow.postMessage({ type: 'pc-patch-css', href: activeCssFile, css: css }, '*');
        return true;
    } catch (e) {
        return false;
    }
}

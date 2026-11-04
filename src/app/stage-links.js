function projectLinkTarget(rawHref) {
    ensureEntries();
    const target = Project.resolveRelativePath(activeHtmlFile, rawHref);
    return target && /\.html?$/i.test(target) && target in projectFiles.entries ? target : null;
}

function followProjectLink(rawHref) {
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

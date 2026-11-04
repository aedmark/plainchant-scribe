function buildLiveBridgeScript() {
    return [
        '(function() {',
        '  function scrollToHash(hash) {',
        '    var id = hash.slice(1);',
        '    try { id = decodeURIComponent(id); } catch (err) {}',
        '    var target = id ? (document.getElementById(id) || document.getElementsByName(id)[0]) : document.documentElement;',
        '    if (target && target.scrollIntoView) target.scrollIntoView();',
        '  }',
        '  document.addEventListener("click", function(e) {',
        '    if (e.defaultPrevented || e.button !== 0) return;',
        '    var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;',
        '    if (!a) return;',
        '    var href = (a.getAttribute("href") || "").trim();',
        '    if (/^([a-z][a-z0-9+.-]*:|\\/\\/)/i.test(href)) return;',
        '    e.preventDefault();',
        '    if (href.charAt(0) === "#") scrollToHash(href);',
        '    else if (href && href.charAt(0) !== "?") window.parent.postMessage({ type: "pc-navigate", href: href }, "*");',
        '  });',
        '  document.addEventListener("submit", function(e) {',
        '    if (!e.defaultPrevented) e.preventDefault();',
        '  });',
        '})();'
    ].join('\n');
}

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

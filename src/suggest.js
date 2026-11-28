(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./html-ast.js'), require('./css-ast.js'));
    else root.Suggest = factory(root.HtmlAst, root.CssAst);
})(typeof self !== 'undefined' ? self : this, function (HtmlAst, CssAst) {
    'use strict';

    const HTML_TAGS = [
        'div', 'section', 'article', 'main', 'header', 'footer', 'nav', 'aside',
        'h1', 'h2', 'h3', 'p', 'span', 'a', 'button', 'ul', 'ol', 'li',
        'img', 'form', 'label', 'input', 'textarea', 'select', 'option', 'dialog', 'canvas'
    ];

    const CSS_PROPS = [
        'display', 'flex-direction', 'justify-content', 'align-items', 'gap',
        'grid-template-columns', 'padding', 'margin', 'width', 'max-width', 'height',
        'background-color', 'color', 'font-size', 'font-weight', 'line-height',
        'border', 'border-radius', 'box-shadow', 'text-align', 'position'
    ];

    function collectClasses(htmlText, projectFiles) {
        const classes = new Set();
        const addCss = (css) => {
            if (!css) return;
            CssAst.listSelectors(css, null).classes.forEach((c) => classes.add(c));
        };
        const entries = projectFiles && projectFiles.entries;
        if (entries && typeof entries === 'object') {
            Object.keys(entries).forEach((p) => {
                if (/\.css$/i.test(p)) addCss(entries[p]);
            });
        } else if (projectFiles && projectFiles.css) {
            addCss(projectFiles.css);
        }
        let m;
        const styleRe = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
        while ((m = styleRe.exec(htmlText)) !== null) addCss(m[1]);
        return Array.from(classes).sort();
    }

    function cssContextIsDecl(before) {
        const stack = [];
        let quote = null;
        let headerStart = 0;
        for (let i = 0; i < before.length; i++) {
            const ch = before[i];
            if (quote) {
                if (ch === quote && before[i - 1] !== '\\') quote = null;
            } else if (ch === '"' || ch === "'") {
                quote = ch;
            } else if (ch === '/' && before[i + 1] === '*') {
                const endC = before.indexOf('*/', i + 2);
                i = endC === -1 ? before.length : endC + 1;
            } else if (ch === '{') {
                const head = before.slice(headerStart, i).trim();
                const isAtBlock = /^@(?:media|supports|layer|document|scope|container)\b/i.test(head);
                stack.push(isAtBlock ? 'at' : 'rule');
                headerStart = i + 1;
            } else if (ch === '}') {
                stack.pop();
                headerStart = i + 1;
            } else if (ch === ';') {
                headerStart = i + 1;
            }
        }
        return stack.length > 0 && stack[stack.length - 1] === 'rule';
    }

    function at(text, caret, lang, projectFiles) {
        const s = String(text || '');
        const before = s.slice(0, caret);
        const mode = String(lang || 'html').toLowerCase();

        if (mode === 'html') {
            const classMatch = before.match(/class=["']([^"']*)$/);
            if (classMatch && projectFiles) {
                const words = classMatch[1].split(/\s+/);
                const partial = words[words.length - 1] || '';
                const allClasses = collectClasses(s, projectFiles);
                const opts = allClasses.filter((c) => c.toLowerCase().startsWith(partial.toLowerCase()) && c !== partial).slice(0, 6);
                if (opts.length) {
                    return {
                        kind: 'class',
                        from: caret - partial.length,
                        to: caret,
                        options: opts,
                        tab: true
                    };
                }
            }
            const tagMatch = before.match(/<([a-zA-Z][a-zA-Z0-9-]*)$/);
            if (tagMatch) {
                const prefix = tagMatch[1].toLowerCase();
                const opts = HTML_TAGS.filter((t) => t.startsWith(prefix)).slice(0, 6);
                if (opts.length) {
                    return {
                        kind: 'tag',
                        from: caret - prefix.length,
                        to: caret,
                        options: opts.map((t) => HtmlAst.VOID_TAGS[t] ? t + '>' : t + '></' + t + '>'),
                        labels: opts,
                        tab: true
                    };
                }
            }
        } else if (mode === 'css') {
            const propMatch = before.match(/(?:^|[\n{;])\s*([a-zA-Z][a-zA-Z-]*)$/);
            if (propMatch && cssContextIsDecl(before)) {
                const prefix = propMatch[1].toLowerCase();
                const opts = CSS_PROPS.filter((p) => p.startsWith(prefix) && p !== prefix).slice(0, 6);
                if (opts.length) {
                    return {
                        kind: 'property',
                        from: caret - prefix.length,
                        to: caret,
                        options: opts.map((p) => p + ': '),
                        labels: opts,
                        tab: true
                    };
                }
            }
        }
        return null;
    }

    function edit(hit, choice) {
        let selOffset = choice.length;
        if (hit.kind === 'tag' && choice.indexOf('></') !== -1) {
            selOffset = choice.indexOf('>') + 1;
        }
        const pos = hit.from + selOffset;
        return {
            from: hit.from,
            to: hit.to,
            insert: choice,
            selStart: pos,
            selEnd: pos
        };
    }

    return {
        HTML_TAGS: HTML_TAGS,
        CSS_PROPS: CSS_PROPS,
        at: at,
        edit: edit
    };
});

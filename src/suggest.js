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

    function at(text, caret, lang, projectFiles) {
        const s = String(text || '');
        const before = s.slice(0, caret);
        const mode = String(lang || 'html').toLowerCase();

        if (mode === 'html') {
            const classMatch = before.match(/class=["']([^"']*)$/);
            if (classMatch && projectFiles) {
                const words = classMatch[1].split(/\s+/);
                const partial = words[words.length - 1] || '';
                const selectors = CssAst.listSelectors(projectFiles.css || '', null);
                const opts = selectors.classes.filter((c) => c.toLowerCase().startsWith(partial.toLowerCase()) && c !== partial).slice(0, 6);
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
                const opts = HTML_TAGS.filter((t) => t.startsWith(prefix) && t !== prefix).slice(0, 6);
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
            if (propMatch && before.lastIndexOf('{') > before.lastIndexOf('}')) {
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

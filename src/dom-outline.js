(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./html-ast.js'));
    else root.DomOutline = factory(root.HtmlAst);
})(typeof self !== 'undefined' ? self : this, function (HtmlAst) {
    'use strict';

    const SKIP_OUTLINE = { html: true, head: true, meta: true, link: true, title: true, style: true, script: true };

    function formatLabel(el) {
        if (!el || el.type !== 'element') return '';
        let s = el.tag;
        if (el.attrs && el.attrs.id) s += '#' + el.attrs.id;
        if (el.attrs && el.attrs.class) {
            const cls = el.attrs.class.trim().split(/\s+/).filter(Boolean);
            if (cls.length) s += '.' + cls.slice(0, 2).join('.');
        }
        return s;
    }

    function shortText(ast, el) {
        if (!el || !el.children) return '';
        const parts = [];
        for (let i = 0; i < el.children.length; i++) {
            const c = el.children[i];
            if (c.type === 'text') {
                const t = c.text.replace(/\s+/g, ' ').trim();
                if (t) parts.push(t);
            }
        }
        const joined = parts.join(' ').trim();
        return joined.length > 48 ? joined.slice(0, 45) + '...' : joined;
    }

    function breadcrumbs(htmlOrAst, targetId) {
        const ast = typeof htmlOrAst === 'string' ? HtmlAst.parse(htmlOrAst) : htmlOrAst;
        if (!ast || !targetId) return [];
        const chain = [];
        let cur = HtmlAst.findById(ast, targetId);
        while (cur && cur.type === 'element') {
            if (cur.tag !== 'html' && cur.tag !== 'head') {
                chain.unshift({
                    id: cur.id,
                    tag: cur.tag,
                    label: formatLabel(cur),
                    line: cur.line,
                    start: cur.start,
                    end: cur.end
                });
            }
            cur = cur.parentId ? HtmlAst.findById(ast, cur.parentId) : null;
        }
        return chain;
    }

    function build(htmlOrAst) {
        const ast = typeof htmlOrAst === 'string' ? HtmlAst.parse(htmlOrAst) : htmlOrAst;
        if (!ast || !ast.root) return [];
        const items = [];

        function walk(node, depth) {
            if (!node || !node.children) return;
            for (let i = 0; i < node.children.length; i++) {
                const child = node.children[i];
                if (child.type !== 'element') continue;
                if (child.tag === 'head' || child.tag === 'meta' || child.tag === 'link' || child.tag === 'title' || child.tag === 'style' || child.tag === 'script') {
                    continue;
                }
                if (child.tag === 'html' || child.tag === 'body') {
                    walk(child, depth);
                    continue;
                }
                items.push({
                    id: child.id,
                    tag: child.tag,
                    label: formatLabel(child),
                    text: shortText(ast, child),
                    depth: depth,
                    line: child.line,
                    start: child.start,
                    end: child.end
                });
                walk(child, depth + 1);
            }
        }

        walk(ast.root, 0);
        return items;
    }

    function filter(items, query) {
        const q = String(query || '').trim().toLowerCase();
        if (!q) return items.slice();
        return items.filter((item) =>
            item.label.toLowerCase().indexOf(q) !== -1 ||
            item.text.toLowerCase().indexOf(q) !== -1 ||
            item.tag.toLowerCase().indexOf(q) !== -1
        );
    }

    return {
        formatLabel: formatLabel,
        breadcrumbs: breadcrumbs,
        build: build,
        filter: filter,
        SKIP_OUTLINE: SKIP_OUTLINE
    };
});

/*
 * BookStyle: layout settings written as one marked block at the end of the book's stylesheet (P4-01, D-031).
 *
 * The block sits between the START and END comments and is rewritten on each change; it wins over earlier rules by
 * coming last, and the rest of the stylesheet is never touched (D-002). read() takes the settings back from the
 * block, so hand edits inside it show in the Layout tab. Settings: { paragraph: 'indent' | 'space' | 'none',
 * size (em), lineHeight (number or null), justify, hyphens, widows (number or null) }.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./xml-ast.js'), require('./book.js'));
    else root.BookStyle = factory(root.XmlAst, root.Book);
})(typeof self !== 'undefined' ? self : this, function (XmlAst, Book) {
    'use strict';

    const START = '/* Scribe layout: written by the Layout tab. Edit it here or there; the rest of this file is yours. */';
    const END = '/* End of Scribe layout */';
    const PRESETS = {
        novel: { label: 'Novel', settings: { paragraph: 'indent', size: 1.5, lineHeight: 1.4, justify: true, hyphens: true, widows: 2 } },
        modern: { label: 'Modern', settings: { paragraph: 'space', size: 1, lineHeight: 1.5, justify: false, hyphens: false, widows: 2 } },
        plain: { label: 'Plain', settings: { paragraph: 'none', size: 1, lineHeight: null, justify: false, hyphens: false, widows: null } }
    };
    const LINE_HEIGHTS = [1.2, 1.3, 1.4, 1.5, 1.6, 1.8];
    const RTL = /^(ar|he|fa|ur|yi|ps|dv)(-|$)/i;

    const num = (v, lo, hi) => { const n = Number(v); return isFinite(n) && n >= lo && n <= hi ? Math.round(n * 100) / 100 : null; };

    function normalise(s) {
        const v = s || {};
        return {
            paragraph: ['indent', 'space', 'none'].indexOf(v.paragraph) !== -1 ? v.paragraph : 'none',
            size: num(v.size, 0.25, 4) || 1,
            lineHeight: v.lineHeight == null || v.lineHeight === '' ? null : num(v.lineHeight, 1, 3),
            justify: !!v.justify,
            hyphens: !!v.hyphens,
            widows: v.widows == null || v.widows === '' ? null : num(v.widows, 1, 5)
        };
    }

    // The CSS for a set of settings, or '' when they ask for nothing (the reader decides).
    function css(settings, language) {
        const s = normalise(settings);
        const p = [];
        if (s.paragraph === 'indent') p.push('  margin-top: 0;', '  margin-bottom: 0;', '  text-indent: ' + s.size + 'em;');
        if (s.paragraph === 'space') p.push('  margin-top: 0;', '  margin-bottom: ' + s.size + 'em;', '  text-indent: 0;');
        if (s.lineHeight != null) p.push('  line-height: ' + s.lineHeight + ';');
        p.push(s.justify ? '  text-align: justify;' : (s.paragraph === 'none' && s.lineHeight == null && !s.hyphens && s.widows == null ? null : '  text-align: ' + (RTL.test(language || '') ? 'right' : 'left') + ';'));
        // Readers differ in which spelling they honour: Apple Books and Kobo take -webkit-, older Adobe-based readers -epub-.
        if (s.hyphens) p.push('  -webkit-hyphens: auto;', '  -epub-hyphens: auto;', '  hyphens: auto;');
        if (s.widows != null) p.push('  widows: ' + s.widows + ';', '  orphans: ' + s.widows + ';');
        const decls = p.filter(Boolean);
        if (!decls.length) return '';
        const lines = ['p {'].concat(decls, ['}']);
        // After a heading or a scene break, a paragraph starts flush.
        if (s.paragraph === 'indent') lines.push('', 'h1 + p, h2 + p, h3 + p, h4 + p, h5 + p, h6 + p, hr + p {', '  text-indent: 0;', '}');
        return lines.join('\n');
    }

    function blockRange(text) {
        const a = text.indexOf(START);
        if (a === -1) return null;
        const b = text.indexOf(END, a);
        return b === -1 ? null : { start: a, end: b + END.length };
    }

    // The settings in the block, or null when the stylesheet has none.
    function read(text) {
        const r = blockRange(String(text || ''));
        if (!r) return null;
        const body = text.slice(r.start + START.length, r.end - END.length);
        const rule = /(^|\n)\s*p\s*\{([^}]*)\}/.exec(body);
        const decl = (prop) => { const m = rule ? new RegExp('(^|[;\\s])' + prop + '\\s*:\\s*([^;]+);').exec(rule[2]) : null; return m ? m[2].trim() : null; };
        const indent = decl('text-indent'), bottom = decl('margin-bottom');
        const em = (v) => { const m = /^([\d.]+)em$/.exec(v || ''); return m ? Number(m[1]) : null; };
        let paragraph = 'none', size = 1;
        if (em(indent) > 0) { paragraph = 'indent'; size = em(indent); } else if (em(bottom) > 0) { paragraph = 'space'; size = em(bottom); }
        const lh = decl('line-height');
        return normalise({
            paragraph: paragraph, size: size,
            lineHeight: lh != null && /^[\d.]+$/.test(lh) ? Number(lh) : null,
            justify: decl('text-align') === 'justify',
            hyphens: decl('hyphens') === 'auto' || decl('-webkit-hyphens') === 'auto',
            widows: decl('widows') != null ? Number(decl('widows')) : null
        });
    }

    // The stylesheet with the block written (replaced in place, or appended), or removed when it would be empty.
    function apply(text, settings, language) {
        const t = String(text || '');
        const body = css(settings, language);
        const block = body ? START + '\n' + body + '\n' + END : '';
        const r = blockRange(t);
        if (r) {
            if (block) return t.slice(0, r.start) + block + t.slice(r.end);
            return t.slice(0, r.start).replace(/\s*$/, '\n') + t.slice(r.end).replace(/^\s*\n/, '');
        }
        if (!block) return t;
        return t.replace(/\s*$/, '') + (t.trim() ? '\n\n' : '') + block + '\n';
    }

    // The preset whose settings these are, or null.
    function presetOf(settings) {
        const s = JSON.stringify(normalise(settings));
        return Object.keys(PRESETS).find((k) => JSON.stringify(normalise(PRESETS[k].settings)) === s) || null;
    }

    // The book's main stylesheet: the first stylesheet the first spine chapter links, else the first CSS item.
    function stylesheet(entries) {
        const r = Book.read(entries);
        if (!r.model) return null;
        const first = r.model.spine.itemrefs.map((x) => x.item).find((it) => it && it.mediaType === 'application/xhtml+xml' && typeof entries[it.path] === 'string');
        if (first) {
            const ast = XmlAst.parse(entries[first.path]);
            const link = ast.wellFormed ? ast.elements.find((el) => el.local === 'link' && /\bstylesheet\b/i.test(XmlAst.getAttr(el, 'rel') || '') && XmlAst.getAttr(el, 'href')) : null;
            const target = link ? Book.resolveHref(first.path, XmlAst.getAttr(link, 'href')) : null;
            if (target && target.path && typeof entries[target.path] === 'string') return target.path;
        }
        const css = r.model.manifest.items.find((i) => i.mediaType === 'text/css' && typeof entries[i.path] === 'string');
        return css ? css.path : null;
    }

    return { START: START, END: END, PRESETS: PRESETS, LINE_HEIGHTS: LINE_HEIGHTS, normalise: normalise, css: css, read: read, apply: apply, presetOf: presetOf, stylesheet: stylesheet };
});

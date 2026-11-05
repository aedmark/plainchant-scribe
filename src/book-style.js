/*
 * BookStyle: layout settings written as one marked block at the end of the book's stylesheet (P4-01, D-031).
 *
 * The block sits between the START and END comments and is rewritten on each change; it wins over earlier rules by
 * coming last, and the rest of the stylesheet is never touched (D-002). read() takes the settings back from the
 * block, so hand edits inside it show in the Layout tab. Settings: { paragraph: 'indent' | 'space' | 'none',
 * size (em), lineHeight (number or null), justify, hyphens, widows (number or null) } and, for openers and breaks
 * (P4-02, D-032), { headingAlign: '' | 'left' | 'center', headingDrop: 'none' | 'some' | 'third', firstLineCaps,
 * dropCap: 0 | 2 | 3, sceneBreak: 'none' | 'space' | 'asterism' | 'stars' | 'fleuron', smallCaps } and, for embedded
 * fonts (P4-03, D-033), { fonts: [{ family, weight, style, src }], bodyFont, bodyFallback, headingFont,
 * headingFallback }, where src is the font file's URL as written relative to the stylesheet, and for notes (P4-04,
 * D-034) { notes: 'footnotes' | 'endnotes', noteStyle } and reflow-safe blocks (P4-05, D-035) { blocks }.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./xml-ast.js'), require('./book.js'));
    else root.BookStyle = factory(root.XmlAst, root.Book);
})(typeof self !== 'undefined' ? self : this, function (XmlAst, Book) {
    'use strict';

    const START = '/* Scribe layout: written by the Layout tab. Edit it here or there; the rest of this file is yours. */';
    const END = '/* End of Scribe layout */';
    const OPENERS = { headingAlign: '', headingDrop: 'none', firstLineCaps: false, dropCap: 0, sceneBreak: 'none', smallCaps: false,
        fonts: [], bodyFont: '', bodyFallback: 'serif', headingFont: '', headingFallback: 'serif', notes: 'footnotes', noteStyle: false, blocks: false };
    const FALLBACKS = ['serif', 'sans-serif'];
    const quoteFamily = (f) => '"' + String(f).replace(/["\\]/g, '') + '"';
    const PRESETS = {
        novel: { label: 'Novel', settings: Object.assign({ paragraph: 'indent', size: 1.5, lineHeight: 1.4, justify: true, hyphens: true, widows: 2 }, OPENERS) },
        modern: { label: 'Modern', settings: Object.assign({ paragraph: 'space', size: 1, lineHeight: 1.5, justify: false, hyphens: false, widows: 2 }, OPENERS) },
        plain: { label: 'Plain', settings: Object.assign({ paragraph: 'none', size: 1, lineHeight: null, justify: false, hyphens: false, widows: null }, OPENERS) }
    };
    // Scene-break ornaments, as CSS content (escapes keep the stylesheet ASCII).
    const BREAKS = { space: null, asterism: '"\\2042"', stars: '"*\\00a0\\00a0*\\00a0\\00a0*"', fleuron: '"\\2766"' };
    const DROP_SIZES = { 2: '2.7em', 3: '3.9em' };
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
            widows: v.widows == null || v.widows === '' ? null : num(v.widows, 1, 5),
            headingAlign: ['left', 'center'].indexOf(v.headingAlign) !== -1 ? v.headingAlign : '',
            headingDrop: ['some', 'third'].indexOf(v.headingDrop) !== -1 ? v.headingDrop : 'none',
            firstLineCaps: !!v.firstLineCaps,
            dropCap: Number(v.dropCap) === 2 || Number(v.dropCap) === 3 ? Number(v.dropCap) : 0,
            sceneBreak: Object.prototype.hasOwnProperty.call(BREAKS, v.sceneBreak) ? v.sceneBreak : 'none',
            smallCaps: !!v.smallCaps,
            fonts: (Array.isArray(v.fonts) ? v.fonts : []).filter((f) => f && f.family && f.src).map((f) => ({
                family: String(f.family).replace(/["\\]/g, '').trim(), weight: num(f.weight, 100, 900) || 400, style: f.style === 'italic' ? 'italic' : 'normal', src: String(f.src)
            })),
            bodyFont: typeof v.bodyFont === 'string' ? v.bodyFont.replace(/["\\]/g, '').trim() : '',
            bodyFallback: FALLBACKS.indexOf(v.bodyFallback) !== -1 ? v.bodyFallback : 'serif',
            headingFont: typeof v.headingFont === 'string' ? v.headingFont.replace(/["\\]/g, '').trim() : '',
            headingFallback: FALLBACKS.indexOf(v.headingFallback) !== -1 ? v.headingFallback : 'serif',
            notes: v.notes === 'endnotes' ? 'endnotes' : 'footnotes',
            noteStyle: !!v.noteStyle,
            blocks: !!v.blocks
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
        const rules = [];
        const rule = (selector, list) => rules.push([selector + ' {'].concat(list, ['}']).join('\n'));
        // Embedded fonts (P4-03): one @font-face per file, then the families chosen for text and headings.
        s.fonts.forEach((f) => rule('@font-face', ['  font-family: ' + quoteFamily(f.family) + ';', '  font-weight: ' + f.weight + ';', '  font-style: ' + f.style + ';', '  src: url("' + f.src.replace(/"/g, '%22') + '");']));
        if (s.bodyFont) rule('body', ['  font-family: ' + quoteFamily(s.bodyFont) + ', ' + s.bodyFallback + ';']);
        if (s.headingFont) rule('h1, h2, h3, h4, h5, h6', ['  font-family: ' + quoteFamily(s.headingFont) + ', ' + s.headingFallback + ';']);
        if (decls.length) rule('p', decls);
        // After a heading or a scene break, a paragraph starts flush.
        if (s.paragraph === 'indent') rule('h1 + p, h2 + p, h3 + p, h4 + p, h5 + p, h6 + p, hr + p', ['  text-indent: 0;']);
        // Chapter openers (P4-02): the chapter title (h1) and the paragraph that follows it.
        const h1 = [];
        if (s.headingAlign) h1.push('  text-align: ' + s.headingAlign + ';');
        // vh for a sink measured on the page, with an em fallback for readers without it.
        if (s.headingDrop === 'some') h1.push('  margin-top: 3em;');
        if (s.headingDrop === 'third') h1.push('  margin-top: 6em;', '  margin-top: 30vh;');
        if (h1.length) rule('h1', h1);
        if (s.firstLineCaps) rule('h1 + p::first-line', ['  font-variant: small-caps;', '  letter-spacing: 0.05em;']);
        if (s.dropCap) rule('h1 + p::first-letter', ['  float: left;', '  font-size: ' + DROP_SIZES[s.dropCap] + ';', '  line-height: 0.85;', '  margin: 0.05em 0.08em 0 0;']);
        if (s.sceneBreak !== 'none') {
            rule('hr', ['  border: 0;', '  height: auto;', '  margin: 1.5em 0;', '  text-align: center;']);
            if (BREAKS[s.sceneBreak]) rule('hr::after', ['  content: ' + BREAKS[s.sceneBreak] + ';', '  display: block;']);
        }
        if (s.smallCaps) rule('.small-caps', ['  font-variant: small-caps;', '  letter-spacing: 0.05em;']);
        // Notes (P4-04): the book-wide placement is a marker the Layout tab reads back; the styling is plain CSS.
        if (s.noteStyle) {
            rule('a.noteref', ['  vertical-align: super;', '  font-size: 0.75em;', '  line-height: 0;', '  text-decoration: none;']);
            rule('aside.footnote, li.endnote', ['  font-size: 0.9em;']);
        }
        // Reflow-safe blocks (P4-05): images fit the screen, and figures, captions, and table rows are not split across
        // pages (CSS Fragmentation 3 break-inside and break-before, with the CSS 2 page-break spellings older readers use).
        if (s.blocks) {
            const start = RTL.test(language || '') ? 'right' : 'left';
            const keep = ['  page-break-inside: avoid;', '  break-inside: avoid;'];
            rule('figure.figure, figure.quote', ['  margin: 1.5em 0;'].concat(keep));
            rule('figure.figure', ['  text-align: center;']);
            rule('figure.figure img', ['  max-width: 100%;', '  max-height: 90vh;', '  height: auto;']);
            rule('figcaption', ['  font-size: 0.9em;', '  text-indent: 0;', '  page-break-before: avoid;', '  break-before: avoid;']);
            rule('table.table', ['  border-collapse: collapse;', '  width: 100%;', '  margin: 1em 0;', '  font-size: 0.9em;']);
            rule('table.table caption', ['  font-weight: bold;', '  margin-bottom: 0.5em;']);
            rule('table.table th, table.table td', ['  border-top: 1px solid;', '  padding: 0.25em 0.5em;', '  text-align: ' + start + ';', '  vertical-align: top;']);
            rule('table.table tr', keep);
            rule('div.poem', ['  margin: 1em 0 1em 1.5em;', '  -webkit-hyphens: none;', '  -epub-hyphens: none;', '  hyphens: none;']);
            rule('div.poem div.stanza', ['  margin: 0 0 1em;']);
            // A wrapped line hangs under its start, so the reader can still see where each line begins.
            rule('div.poem p.line', ['  margin: 0;', '  padding-left: 2em;', '  text-indent: -2em;', '  text-align: ' + start + ';']);
            rule('div.poem p.line.indent', ['  padding-left: 4em;']);
            rule('blockquote', ['  margin: 1em 1.5em;']);
            rule('blockquote > p:first-child', ['  text-indent: 0;']);
            rule('figure.quote blockquote', ['  margin: 0 1.5em;']);
            rule('figure.quote figcaption', ['  margin: 0.5em 1.5em 0;', '  text-align: right;']);
        }
        if (s.notes === 'endnotes') rules.unshift('/* notes: endnotes */');
        return rules.join('\n\n');
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
        const ruleOf = (selector) => new RegExp('(^|\\n)\\s*' + selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}').exec(body);
        const declIn = (r, prop) => { const m = r ? new RegExp('(^|[;\\s])' + prop + '\\s*:\\s*([^;]+);').exec(r[2]) : null; return m ? m[2].trim() : null; };
        const rule = ruleOf('p');
        const decl = (prop) => declIn(rule, prop);
        const h1 = ruleOf('h1'), letter = ruleOf('h1 + p::first-letter'), hr = ruleOf('hr'), after = ruleOf('hr::after');
        const content = declIn(after, 'content');
        const faces = [];
        const faceRe = /@font-face\s*\{([^}]*)\}/g;
        let fm;
        while ((fm = faceRe.exec(body))) {
            const r = [null, null, fm[1]];
            const fam = (declIn(r, 'font-family') || '').replace(/^["']|["']$/g, '');
            const src = /url\(\s*["']?([^"')]+)["']?\s*\)/.exec(declIn(r, 'src') || '');
            if (fam && src) faces.push({ family: fam, weight: Number(declIn(r, 'font-weight')) || 400, style: declIn(r, 'font-style') === 'italic' ? 'italic' : 'normal', src: src[1] });
        }
        const familyOf = (r) => { const v = declIn(r, 'font-family'); if (!v) return ['', 'serif']; const m = /^\s*["']([^"']+)["']\s*(?:,\s*([\w-]+))?/.exec(v); return m ? [m[1], m[2] || 'serif'] : ['', 'serif']; };
        const bodyF = familyOf(ruleOf('body')), headF = familyOf(ruleOf('h1, h2, h3, h4, h5, h6'));
        const top = h1 ? (body.match(/(^|\n)\s*h1\s*\{[^}]*\}/) || [''])[0] : '';
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
            widows: decl('widows') != null ? Number(decl('widows')) : null,
            headingAlign: declIn(h1, 'text-align') || '',
            headingDrop: /30vh/.test(top) ? 'third' : (declIn(h1, 'margin-top') ? 'some' : 'none'),
            firstLineCaps: !!ruleOf('h1 + p::first-line'),
            dropCap: letter ? (declIn(letter, 'font-size') === DROP_SIZES[3] ? 3 : 2) : 0,
            sceneBreak: !hr ? 'none' : (Object.keys(BREAKS).find((k) => BREAKS[k] === content) || (content ? 'asterism' : 'space')),
            smallCaps: !!ruleOf('.small-caps'),
            fonts: faces, bodyFont: bodyF[0], bodyFallback: bodyF[1], headingFont: headF[0], headingFallback: headF[1],
            notes: /\/\*\s*notes:\s*endnotes\s*\*\//.test(body) ? 'endnotes' : 'footnotes',
            noteStyle: !!ruleOf('a.noteref'),
            blocks: !!ruleOf('figure.figure, figure.quote')
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

    // Presets set the paragraph settings; openers, breaks, and small caps are kept (P4-02).
    const PARAGRAPH_KEYS = ['paragraph', 'size', 'lineHeight', 'justify', 'hyphens', 'widows'];
    const pick = (s) => PARAGRAPH_KEYS.map((k) => normalise(s)[k]);

    // The preset whose paragraph settings these are, or null.
    function presetOf(settings) {
        const s = JSON.stringify(pick(settings));
        return Object.keys(PRESETS).find((k) => JSON.stringify(pick(PRESETS[k].settings)) === s) || null;
    }

    // The settings with a preset's paragraph settings applied and everything else kept.
    function withPreset(settings, name) {
        const base = normalise(settings), preset = normalise(PRESETS[name] ? PRESETS[name].settings : {});
        PARAGRAPH_KEYS.forEach((k) => { base[k] = preset[k]; });
        return base;
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

    // Where to put a scene break after the element at `start` in a chapter: that element, or the block it sits in.
    const INLINE = { a: 1, abbr: 1, b: 1, cite: 1, code: 1, em: 1, i: 1, kbd: 1, mark: 1, q: 1, s: 1, small: 1, span: 1, strong: 1, sub: 1, sup: 1, u: 1, img: 1, br: 1 };
    function sceneBreakAfter(text, start) {
        const ast = XmlAst.parse(text || '');
        if (!ast.wellFormed) throw Object.assign(new Error('The chapter is not well-formed; fix it in the code editor first.'), { code: 'not-well-formed' });
        let el = ast.elements.find((e) => e.start === start);
        while (el && INLINE[el.local]) el = ast.byId[el.parentId];
        if (!el || el.type !== 'element' || ['html', 'head', 'body'].indexOf(el.local) !== -1 || el === ast.documentElement) {
            throw Object.assign(new Error('Select a paragraph on the Stage to put the scene break after it.'), { code: 'no-block' });
        }
        const name = el.prefix ? el.prefix + ':hr' : 'hr';
        return XmlAst.applyEdits(text, XmlAst.insert(ast, el, 'after', '<' + name + '/>'));
    }

    return { START: START, END: END, PRESETS: PRESETS, BREAKS: BREAKS, sceneBreakAfter: sceneBreakAfter, withPreset: withPreset, LINE_HEIGHTS: LINE_HEIGHTS, normalise: normalise, css: css, read: read, apply: apply, presetOf: presetOf, stylesheet: stylesheet };
});

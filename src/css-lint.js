/*
 * CssLint: CSS that reading systems handle badly or not at all, in a book's stylesheets and its chapters' style
 * attributes (P4-06, D-036). Report only: nothing is rewritten.
 *
 * One rule is the specification's: EPUB 3.3 §6.3.1.2 says a style sheet MUST NOT include the direction or
 * unicode-bidi property (use the dir attribute and <bdo> instead), so those are errors. The rest are warnings, from
 * EPUB 3.3 §6.3.1.1 ("Fixed and absolute positioning are particularly problematic") and from how reading systems
 * behave: layout that fights the reader's own pages, values that override the reader's settings, and features older
 * Kindle and Adobe-based readers do not support. Each problem is { start, end, line, code, severity, message,
 * category: 'stylesheets' }, with offsets into the file.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./css-ast.js'), require('./xml-ast.js'));
    else root.CssLint = factory(root.CssAst, root.XmlAst);
})(typeof self !== 'undefined' ? self : this, function (CssAst, XmlAst) {
    'use strict';

    // Selectors whose colours apply to the running text, so fixing them breaks a reader's night or sepia theme.
    const TEXT_TARGETS = /^(html|body|p|div|span|section|article|main|\*)$/i;
    const KEEP_COLOUR = /^(inherit|initial|unset|revert|transparent|currentcolor|none)$/i;
    const SIZE_PROPS = { width: 1, 'min-width': 1, height: 1, 'min-height': 1 };

    // Comments become spaces of the same length, so offsets stay true while searches skip them.
    function blankComments(text) {
        return text.replace(/\/\*[\s\S]*?(\*\/|$)/g, (m) => m.replace(/[^\n]/g, ' '));
    }

    function lineStarts(text) {
        const starts = [0];
        for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1);
        return starts;
    }

    function lineOf(starts, offset) {
        let lo = 0, hi = starts.length - 1;
        while (lo <= hi) { const mid = (lo + hi) >> 1; if (starts[mid] <= offset) lo = mid + 1; else hi = mid - 1; }
        return Math.max(1, hi + 1);
    }

    // The last compound of each selector in a list, lower-cased, without pseudo-classes: "main p.intro" -> "p".
    function subjects(selector) {
        return String(selector || '').split(',').map((s) => {
            const last = s.trim().split(/[\s>+~]+/).pop() || '';
            return (/^[A-Za-z*][\w-]*|^\*/.exec(last) || [''])[0];
        });
    }

    // Checks one declaration; `selector` is null for a style attribute. add(code, severity, start, end, message).
    function checkDeclaration(d, selector, add) {
        const prop = d.prop.toLowerCase();
        const value = d.value.replace(/\s*!\s*important\s*$/i, '').trim().toLowerCase();
        const at = (code, severity, message) => add(code, severity, d.start, d.end, message);
        if (prop === 'direction' || prop === 'unicode-bidi') {
            at('css-' + prop, 'error', 'EPUB 3.3 does not allow the ' + prop + ' property in CSS. Set the direction with the dir attribute (or <bdo> for a run of text) in the chapter.');
            return;
        }
        if (/!\s*important\s*$/i.test(d.value)) at('css-important', 'warning', '!important stops readers from applying their own settings, such as text size or theme. Remove it, or make the selector more specific.');
        // Layout breakers.
        if (prop === 'position' && /^(absolute|fixed|sticky)$/.test(value)) at('css-position', 'warning', 'position: ' + value + ' places content against a page the reader controls, so it can cover text or vanish. Let it flow, and use margins or floats.');
        if (SIZE_PROPS[prop] && /(^|\s)[1-9][\d.]*px\b/.test(value)) at('css-fixed-size', 'warning', prop + ' in px does not shrink with the screen. Use % or em, or max-' + prop.replace(/^min-/, '') + ' to cap it.');
        if ((prop === 'height' || prop === 'min-height') && /\d\s*vh\b/.test(value)) at('css-viewport-height', 'warning', prop + ' in vh forces a page-sized block, which readers with their own page margins cut or push to a blank page. Leave the height to the content.');
        if (/^overflow(-x|-y)?$/.test(prop) && /^(hidden|scroll|clip)$/.test(value)) at('css-overflow', 'warning', 'overflow: ' + value + ' can hide text that does not fit a small screen or a larger font size. Let the content flow.');
        if (/^(columns|column-count|column-width)$/.test(prop) && value !== 'auto') at('css-columns', 'warning', prop + ' fights the reader’s own pages and columns. Leave columns to the reader.');
        // Values that override the reader's settings.
        if ((prop === 'font-size' || prop === 'font') && /(^|[\s/])[\d.]+(px|pt)\b/.test(value)) at('css-font-size', 'warning', 'Font sizes in px or pt ignore the reader’s text size. Use em or %, where 1em is the reader’s size (16px is about 1em).');
        if (prop === 'line-height' && /^[\d.]+(px|pt)$/.test(value)) at('css-line-height', 'warning', 'line-height in px or pt does not grow with the text, so lines overlap when the reader enlarges it. Use a plain number such as 1.4.');
        if ((prop === 'color' || prop === 'background-color' || prop === 'background') && !KEEP_COLOUR.test(value) && !/^url\(/.test(value)) {
            const text = selector === null || subjects(selector).some((s) => TEXT_TARGETS.test(s));
            if (text) at('css-text-colour', 'warning', prop + ' on running text overrides the reader’s night and sepia themes, which can leave dark text on a dark page. Leave text and page colours to the reader.');
        }
        // Poorly supported.
        if (prop === 'display' && /^(inline-)?(grid|flex)$/.test(value)) at('css-display', 'warning', 'display: ' + value + ' is missing or partial in older Kindle and Adobe-based readers, where the layout falls apart. Use blocks, or check the book on those readers.');
        if ((prop === 'font-size' || prop === 'font') && /[\d.]\s*(vw|vmin|vmax)\b/.test(value)) at('css-font-size-viewport', 'warning', 'Font sizes in viewport units ignore the reader’s text size. Use em or %.');
    }

    // Problems in a stylesheet's text.
    function checkCss(text) {
        const t = String(text || '');
        const starts = lineStarts(t);
        const problems = [];
        const add = (code, severity, start, end, message) => problems.push({ start: start, end: end, line: lineOf(starts, start), code: code, severity: severity, message: message, category: 'stylesheets' });
        let scan = blankComments(t);
        // @import statements: reported, then blanked so the parser does not read them into the next selector.
        scan = scan.replace(/@import\b[^;{}]*;?/gi, (m, offset) => {
            add('css-import', 'warning', offset, offset + m.length, '@import is not followed by some readers, so the imported styles are lost. Link each stylesheet from the chapters instead.');
            return m.replace(/[^\n]/g, ' ');
        });
        const urlRe = /url\(\s*(["']?)\s*((?:https?:)?\/\/[^"')\s]*)/gi;
        let m;
        while ((m = urlRe.exec(scan))) add('css-remote-url', 'warning', m.index, m.index + m[0].length, 'url(' + m[2] + ') points outside the book. Many readers never fetch it, and EPUB 3.3 asks for the remote-resources property when it is used. Put the file in the book.');
        CssAst.parse(scan).rules.forEach((r) => {
            if (/:hover\b/i.test(r.selector)) add('css-hover', 'warning', r.selectorStart, r.selectorStart + t.slice(r.selectorStart, r.selectorEnd).trimEnd().length, ':hover never happens on a touch screen or an e-ink reader, so what it shows is never seen. Show it all the time, or not at all.');
            r.declarations.forEach((d) => checkDeclaration({ prop: d.prop, value: t.slice(d.valueStart, d.valueEnd), start: d.start, end: d.end }, r.selector, add));
        });
        return problems.sort((a, b) => a.start - b.start);
    }

    // Problems in a chapter's style attributes, with offsets into the chapter.
    function checkInline(text) {
        const t = String(text || '');
        const ast = XmlAst.parse(t);
        if (!ast.wellFormed) return [];
        const starts = lineStarts(t);
        const problems = [];
        const add = (code, severity, start, end, message) => problems.push({ start: start, end: end, line: lineOf(starts, start), code: code, severity: severity, message: message, category: 'stylesheets' });
        ast.elements.forEach((el) => (el.attrs || []).forEach((a) => {
            if (a.local !== 'style' || a.ns || !a.raw.trim()) return;
            // The raw attribute text keeps offsets true; "x{" is two characters before it.
            const shift = a.valueStart - 2;
            const rule = CssAst.parse('x{' + a.raw + '}').rules[0];
            (rule ? rule.declarations : []).forEach((d) => {
                const raw = a.raw.slice(d.valueStart - 2, d.valueEnd - 2).replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
                checkDeclaration({ prop: d.prop, value: raw, start: d.start + shift, end: d.end + shift }, null, add);
            });
        }));
        return problems;
    }

    // A cached checker over a book's files: .css stylesheets and .xhtml chapters' style attributes.
    function createChecker() {
        const cache = new Map();
        function check(entries) {
            const problems = [];
            Object.keys(entries).forEach((file) => {
                const css = /\.css$/i.test(file), xhtml = /\.xhtml?$/i.test(file);
                if ((!css && !xhtml) || typeof entries[file] !== 'string') return;
                const text = entries[file];
                let hit = cache.get(file);
                if (!hit || hit.text !== text) { hit = { text: text, problems: css ? checkCss(text) : checkInline(text) }; cache.set(file, hit); }
                hit.problems.forEach((p) => problems.push(Object.assign({ file: file }, p)));
            });
            return { problems: problems };
        }
        return { check: check };
    }

    return { checkCss: checkCss, checkInline: checkInline, createChecker: createChecker };
});

/*
 * BookLang: the language of parts of a chapter (P6-02, D-045). Pure, no DOM.
 *
 * WCAG 2 3.1.2 (Language of Parts): a passage in another language says so, or a screen reader reads it in the wrong
 * voice. In an XHTML content document that is lang and xml:lang together, with the same value (HTML; EPUBCheck
 * RSC-005 when they differ). Values are BCP 47 tags (RFC 5646 §2.1); wellFormed checks the syntax only, not the
 * IANA registry.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./xml-ast.js'));
    else root.BookLang = factory(root.XmlAst);
}(typeof self !== 'undefined' ? self : this, function (XmlAst) {
    'use strict';

    const XHTML = 'http://www.w3.org/1999/xhtml';
    const XML = 'http://www.w3.org/XML/1998/namespace';

    // RFC 5646 §2.1: langtag, privateuse, or grandfathered, case-insensitive.
    const LANGTAG = new RegExp('^(?:' + [
        '(?:[a-z]{2,3}(?:-[a-z]{3}){0,3}|[a-z]{4}|[a-z]{5,8})' + // language (with up to three extlangs)
        '(?:-[a-z]{4})?' + // script
        '(?:-(?:[a-z]{2}|\\d{3}))?' + // region
        '(?:-(?:[a-z\\d]{5,8}|\\d[a-z\\d]{3}))*' + // variants
        '(?:-[\\da-wy-z](?:-[a-z\\d]{2,8})+)*' + // extensions
        '(?:-x(?:-[a-z\\d]{1,8})+)?', // private use
        'x(?:-[a-z\\d]{1,8})+',
        'en-gb-oed|i-ami|i-bnn|i-default|i-enochian|i-hak|i-klingon|i-lux|i-mingo|i-navajo|i-pwn|i-tao|i-tay|i-tsu|sgn-be-fr|sgn-be-nl|sgn-ch-de|art-lojban|cel-gaulish|no-bok|no-nyn|zh-guoyu|zh-hakka|zh-min|zh-min-nan|zh-xiang'
    ].join('|') + ')$', 'i');

    function wellFormed(tag) {
        if (typeof tag !== 'string' || !LANGTAG.test(tag)) return false;
        // RFC 5646 §2.2.5 and §2.2.6: no variant and no extension singleton appears twice (before any private use).
        const parts = tag.toLowerCase().split('-');
        const x = parts.indexOf('x');
        const head = (x === -1 ? parts : parts.slice(0, x)).slice(1);
        const variants = head.filter((p) => p.length >= 5 || /^\d[a-z\d]{3}$/.test(p));
        const singletons = head.filter((p) => p.length === 1);
        return new Set(variants).size === variants.length && new Set(singletons).size === singletons.length;
    }

    function fail(code, message) {
        const e = new Error(message);
        e.code = code;
        return e;
    }

    // Sets lang and xml:lang on an element, or removes both when tag is ''.
    function setOn(ast, el, tag) {
        if (!tag) return XmlAst.removeAttr(ast, el, 'lang').concat(XmlAst.removeAttr(ast, el, 'xml:lang'));
        return XmlAst.setAttr(ast, el, 'lang', tag).concat(XmlAst.setAttr(ast, el, 'xml:lang', tag));
    }

    // Marks text[start, end) as being in tag. An empty range, or one that is exactly an element's content, sets the
    // innermost element there; otherwise the range is wrapped in a span, which it must not cut through. tag '' clears.
    function apply(text, start, end, tag) {
        const t = String(tag || '').trim();
        if (t && !wellFormed(t)) throw fail('invalid-tag', '"' + t + '" is not a language tag. Use one such as fr, de-CH, or zh-Hant (BCP 47).');
        const ast = XmlAst.parse(text || '');
        if (!ast.wellFormed) throw fail('not-well-formed', 'The chapter is not well-formed; fix it in the code editor first.');
        const body = ast.elements.find((e) => e.local === 'body' && e.ns === XHTML);
        if (!body || start < body.openEnd || end > body.closeStart) throw fail('outside-body', 'Select text in the chapter itself.');
        const inTag = (o) => ast.elements.some((e) => (e.start < o && o < e.openEnd) || (!e.selfClosing && e.closeStart < o && o < e.end));
        if (inTag(start) || inTag(end)) throw fail('in-tag', 'The selection starts or ends inside a tag; select only text.');
        const exact = ast.elements.find((e) => e.ns === XHTML && !e.selfClosing && e.openEnd === start && e.closeStart === end && e !== body);
        const holder = (o) => ast.elements.filter((e) => e.ns === XHTML && !e.selfClosing && e.openEnd <= o && o <= e.closeStart && e.start >= body.start).pop();
        if (start === end || exact) {
            const el = exact || holder(start);
            if (!el || el === body && !t) throw fail('no-element', 'Select some text, or put the cursor in a paragraph.');
            return XmlAst.applyEdits(text, setOn(ast, el, t));
        }
        if (!t) {
            // Clearing a range removes the language from a span that is exactly the selection.
            throw fail('clear-needs-element', 'To remove a language, put the cursor inside the passage and choose no language.');
        }
        const cut = ast.elements.some((e) => e.ns === XHTML && e.start < end && e.end > start && !(e.start >= start && e.end <= end) && !(e.openEnd <= start && end <= e.closeStart));
        if (cut) throw fail('crosses-tags', 'The selection cuts through markup (for example, half of an italic run). Select a run that starts and ends in the same paragraph or element.');
        const open = '<span lang="' + XmlAst.escapeAttr(t, '"') + '" xml:lang="' + XmlAst.escapeAttr(t, '"') + '">';
        return XmlAst.applyEdits(text, [{ start: start, end: start, text: open }, { start: end, end: end, text: '</span>' }]);
    }

    // The language at an offset: the nearest lang or xml:lang on an element around it.
    function at(text, offset) {
        const ast = XmlAst.parse(text || '');
        const around = ast.elements.filter((e) => e.start <= offset && offset <= e.end);
        for (let i = around.length - 1; i >= 0; i--) {
            const v = XmlAst.getAttr(around[i], 'lang') || XmlAst.getAttr(around[i], 'lang', XML);
            if (v) return v;
        }
        return '';
    }

    // Problems-tab rows: lang and xml:lang values that are not well-formed tags.
    function rows(entries, paths) {
        const out = [];
        (paths || Object.keys(entries).filter((p) => /\.xhtml?$/i.test(p))).forEach((path) => {
            const text = entries[path];
            if (typeof text !== 'string') return;
            const ast = XmlAst.parse(text);
            ast.elements.forEach((el) => el.attrs.forEach((a) => {
                const isLang = (a.local === 'lang' && (a.ns === null || a.ns === XML));
                if (!isLang || a.value === '' || wellFormed(a.value)) return;
                out.push({ file: path, start: a.start, end: a.end, line: text.slice(0, a.start).split('\n').length, code: 'lang-invalid', severity: 'warning', category: 'accessibility', message: a.name + '="' + a.value + '" is not a language tag, so a screen reader cannot choose a voice. Use one such as fr, de-CH, or zh-Hant (BCP 47; WCAG 2 3.1.2).' });
            }));
        });
        return out;
    }

    return { wellFormed: wellFormed, apply: apply, at: at, rows: rows };
}));

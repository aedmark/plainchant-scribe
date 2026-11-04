(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./html-ast.js'));
    else root.Editing = factory(root.HtmlAst);
})(typeof self !== 'undefined' ? self : this, function (HtmlAst) {
    'use strict';

    function lineInfo(text, caret) {
        const before = text.slice(0, caret);
        const idx = before.split('\n').length - 1;
        const start = before.lastIndexOf('\n') + 1;
        let end = text.indexOf('\n', caret);
        if (end === -1) end = text.length;
        return { lines: text.split('\n'), idx: idx, start: start, end: end };
    }

    function diffEdit(oldText, newText, selStart, selEnd) {
        const max = Math.min(oldText.length, newText.length);
        let a = 0;
        while (a < max && oldText[a] === newText[a]) a++;
        let b = 0;
        while (b < max - a && oldText[oldText.length - 1 - b] === newText[newText.length - 1 - b]) b++;
        const from = a;
        const to = oldText.length - b;
        const insert = newText.slice(a, newText.length - b);
        const delta = insert.length - (to - from);
        const sStart = typeof selStart === 'number' ? selStart : 0;
        const sEnd = typeof selEnd === 'number' ? selEnd : sStart;
        const carry = function (p) { return p <= from ? p : (p >= to ? p + delta : from + insert.length); };
        return { from: from, to: to, insert: insert, selStart: carry(sStart), selEnd: carry(sEnd) };
    }

    function enter(text, start, end, lang) {
        if (start !== end) return null;
        const info = lineInfo(text, start);
        const lineBefore = text.slice(info.start, start);
        const lineAfter = text.slice(start, info.end);
        const indentMatch = lineBefore.match(/^[ \t]*/);
        const indent = indentMatch ? indentMatch[0] : '';

        const openTag = /<([a-zA-Z][a-zA-Z0-9:-]*)(?:\s[^>]*)?>$/.exec(lineBefore);
        const closeTag = /^<\/([a-zA-Z][a-zA-Z0-9:-]*)\s*>/.exec(lineAfter);
        if (openTag && closeTag && openTag[1].toLowerCase() === closeTag[1].toLowerCase()) {
            const innerIndent = indent + '  ';
            const ins = '\n' + innerIndent + '\n' + indent;
            const caretPos = start + 1 + innerIndent.length;
            return { from: start, to: start, insert: ins, selStart: caretPos, selEnd: caretPos };
        }

        const betweenBraces = /\{\s*$/.test(lineBefore) && /^\s*\}/.test(lineAfter);
        if (betweenBraces) {
            const innerIndent = indent + '  ';
            const ins = '\n' + innerIndent + '\n' + indent;
            const caretPos = start + 1 + innerIndent.length;
            return { from: start, to: start, insert: ins, selStart: caretPos, selEnd: caretPos };
        }

        const openBlock = (lang === 'css' || lang === 'js') && /\{\s*$/.test(lineBefore);
        const openHtmlTag = (!lang || lang === 'html') &&
            /<([a-zA-Z][a-zA-Z0-9:-]*)(?:\s[^>]*)?>$/.exec(lineBefore);
        let extra = '';
        if (openBlock) {
            extra = '  ';
        } else if (openHtmlTag && !HtmlAst.VOID_TAGS[openHtmlTag[1].toLowerCase()] && lineAfter.trim() === '') {
            extra = '  ';
        }

        if (!indent && !extra) return null;
        const ins = '\n' + indent + extra;
        const pos = start + ins.length;
        return { from: start, to: start, insert: ins, selStart: pos, selEnd: pos };
    }

    function expandAbbrev(text, caret, lang) {
        if (lang && lang !== 'html') return null;
        const before = text.slice(0, caret);
        const m = before.match(/(?:^|[\s>])([a-zA-Z][a-zA-Z0-9-]*(?:[.#][a-zA-Z0-9_-]+)*(?:\*\d+)?)$/);
        if (!m) return null;
        const token = m[1];
        const from = caret - token.length;

        const multMatch = token.match(/\*(\d+)$/);
        const count = multMatch ? Math.min(12, Math.max(1, Number(multMatch[1]))) : 1;
        const core = multMatch ? token.slice(0, -multMatch[0].length) : token;

        const tagMatch = core.match(/^[a-zA-Z][a-zA-Z0-9-]*/);
        if (!tagMatch) return null;
        const tag = tagMatch[0].toLowerCase();
        const idMatch = core.match(/#([a-zA-Z0-9_-]+)/);
        const classMatches = core.match(/\.([a-zA-Z0-9_-]+)/g) || [];
        const classes = classMatches.map((c) => c.slice(1));

        let attrs = '';
        if (idMatch) attrs += ' id="' + idMatch[1] + '"';
        if (classes.length) attrs += ' class="' + classes.join(' ') + '"';
        if (tag === 'a') attrs += ' href="#"';
        if (tag === 'img') attrs += ' src="" alt=""';
        if (tag === 'input') attrs += ' type="text"';
        if (tag === 'button') attrs += ' type="button"';

        const isVoid = !!HtmlAst.VOID_TAGS[tag];
        const items = [];
        for (let i = 0; i < count; i++) {
            items.push(isVoid ? '<' + tag + attrs + '>' : '<' + tag + attrs + '></' + tag + '>');
        }
        const info = lineInfo(text, from);
        const indentMatch = text.slice(info.start, from).match(/^[ \t]*/);
        const indent = indentMatch ? indentMatch[0] : '';
        const insert = items.join('\n' + indent);
        const firstClose = isVoid ? insert.length : ('<' + tag + attrs + '>').length;
        const pos = from + firstClose;
        return { from: from, to: caret, insert: insert, selStart: pos, selEnd: pos };
    }

    function blockAt(text, caret) {
        const lines = String(text).split('\n');
        const starts = [];
        let at = 0;
        lines.forEach((l) => { starts.push(at); at += l.length + 1; });
        let i = 0;
        while (i < lines.length - 1 && starts[i + 1] <= caret) i++;
        const blank = (k) => !lines[k].trim();
        if (blank(i)) return { start: starts[i], end: starts[i] + lines[i].length };
        let first = i, last = i;
        while (first > 0 && !blank(first - 1)) first--;
        while (last < lines.length - 1 && !blank(last + 1)) last++;
        return { start: starts[first], end: starts[last] + lines[last].length };
    }

    function paragraphAt(text, line) {
        const s = String(text);
        const lines = s.split('\n');
        const n = Math.max(0, Math.min(Math.floor(line) || 0, lines.length - 1));
        let at = 0;
        for (let i = 0; i < n; i++) at += lines[i].length + 1;
        return {
            start: at,
            end: at + lines[n].length,
            first: n,
            last: n
        };
    }

    return {
        lineInfo: lineInfo,
        diffEdit: diffEdit,
        enter: enter,
        expandAbbrev: expandAbbrev,
        blockAt: blockAt,
        paragraphAt: paragraphAt
    };
});

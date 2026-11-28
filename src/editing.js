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

    const KNOWN_HTML_TAGS = new Set((
        'a abbr address area article aside audio b base bdi bdo blockquote br button canvas caption cite code col colgroup ' +
        'data datalist dd del details dfn dialog div dl dt em embed fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 ' +
        'head header hgroup hr html i iframe img input ins kbd label legend li link main map mark menu meta meter nav noscript ' +
        'object ol optgroup option output p param picture pre progress q rp rt ruby s samp script search section select slot ' +
        'small source span strong style sub summary sup svg table tbody td template textarea tfoot th thead time title tr track ' +
        'u ul var video wbr'
    ).split(' '));

    function inHtmlTextContext(before) {
        let pos = 0;
        const len = before.length;
        while (pos < len) {
            const lt = before.indexOf('<', pos);
            if (lt === -1) return true;
            if (before.startsWith('<!--', lt)) {
                const close = before.indexOf('-->', lt + 4);
                if (close === -1) return false;
                pos = close + 3;
                continue;
            }
            if (before.startsWith('<!', lt) || before.startsWith('<?', lt)) {
                const close = before.indexOf('>', lt + 2);
                if (close === -1) return false;
                pos = close + 1;
                continue;
            }
            const tagStart = /^<\/?\s*([a-zA-Z][a-zA-Z0-9:-]*)/.exec(before.slice(lt));
            if (!tagStart) { pos = lt + 1; continue; }
            const isClose = before[lt + 1] === '/';
            let quote = null;
            let gt = -1;
            for (let i = lt + tagStart[0].length; i < len; i++) {
                const ch = before[i];
                if (quote) {
                    if (ch === quote) quote = null;
                } else if (ch === '"' || ch === "'") {
                    quote = ch;
                } else if (ch === '>') {
                    gt = i;
                    break;
                }
            }
            if (gt === -1) return false;
            const tag = tagStart[1].toLowerCase();
            if (!isClose && (tag === 'script' || tag === 'style' || tag === 'textarea' || tag === 'title')) {
                const tail = before.slice(lt + tagStart[0].length, gt).replace(/\s+$/, '');
                if (!/(?:^|[\s"'])\/$/.test(tail)) {
                    const m = new RegExp('<\\/\\s*' + tag + '\\s*>', 'i').exec(before.slice(gt + 1));
                    if (!m) return false;
                    pos = gt + 1 + m.index + m[0].length;
                    continue;
                }
            }
            pos = gt + 1;
        }
        return true;
    }

    function embeddedLangBefore(before) {
        const check = (tag) => {
            const openRe = new RegExp('<' + tag + '(?:\\s[^>]*)?>', 'gi');
            const closeRe = new RegExp('</\\s*' + tag + '\\s*>', 'gi');
            let lastOpen = -1;
            let lastClose = -1;
            let m;
            while ((m = openRe.exec(before)) !== null) {
                if (!/(?:^|[\s"'])\/>$/.test(m[0])) lastOpen = m.index;
            }
            while ((m = closeRe.exec(before)) !== null) lastClose = m.index;
            return lastOpen > lastClose ? lastOpen : -1;
        };
        const styleAt = check('style');
        const scriptAt = check('script');
        if (styleAt === -1 && scriptAt === -1) return null;
        return styleAt > scriptAt ? 'css' : 'js';
    }

    function enter(text, start, end, lang, indentUnit) {
        if (start !== end) return null;
        const unit = indentUnit || '  ';
        const info = lineInfo(text, start);
        const lineBefore = text.slice(info.start, start);
        const lineAfter = text.slice(start, info.end);
        const indentMatch = lineBefore.match(/^[ \t]*/);
        const indent = indentMatch ? indentMatch[0] : '';

        const openTag = /<([a-zA-Z][a-zA-Z0-9:-]*)(?:\s[^>]*)?>$/.exec(lineBefore);
        const closeTag = /^<\/([a-zA-Z][a-zA-Z0-9:-]*)\s*>/.exec(lineAfter);
        if (openTag && closeTag && openTag[1].toLowerCase() === closeTag[1].toLowerCase()) {
            const innerIndent = indent + unit;
            const ins = '\n' + innerIndent + '\n' + indent;
            const caretPos = start + 1 + innerIndent.length;
            return { from: start, to: start, insert: ins, selStart: caretPos, selEnd: caretPos };
        }

        const betweenBraces = /\{\s*$/.test(lineBefore) && /^\s*\}/.test(lineAfter);
        if (betweenBraces) {
            const innerIndent = indent + unit;
            const ins = '\n' + innerIndent + '\n' + indent;
            const caretPos = start + 1 + innerIndent.length;
            return { from: start, to: start, insert: ins, selStart: caretPos, selEnd: caretPos };
        }

        const effectiveLang = (!lang || lang === 'html') ? (embeddedLangBefore(text.slice(0, start)) || 'html') : lang;
        const openBlock = (effectiveLang === 'css' || effectiveLang === 'js') && /\{\s*$/.test(lineBefore);
        const isSelfClosingLine = /\/\s*>$/.test(lineBefore);
        const openHtmlTag = (!lang || lang === 'html') && effectiveLang === 'html' && !isSelfClosingLine &&
            /<([a-zA-Z][a-zA-Z0-9:-]*)(?:\s[^>]*)?>$/.exec(lineBefore);
        let extra = '';
        if (openBlock) {
            extra = unit;
        } else if (openHtmlTag && !HtmlAst.VOID_TAGS[openHtmlTag[1].toLowerCase()] && lineAfter.trim() === '') {
            extra = unit;
        }

        if (!indent && !extra) return null;
        const ins = '\n' + indent + extra;
        const pos = start + ins.length;
        return { from: start, to: start, insert: ins, selStart: pos, selEnd: pos };
    }

    function expandAbbrev(text, caret, lang) {
        if (lang && lang !== 'html') return null;
        const before = text.slice(0, caret);
        if (!inHtmlTextContext(before)) return null;
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

        if (!multMatch && !idMatch && !classes.length && !KNOWN_HTML_TAGS.has(tag)) return null;

        let sharedAttrs = '';
        if (classes.length) sharedAttrs += ' class="' + classes.join(' ') + '"';
        if (tag === 'a') sharedAttrs += ' href="#"';
        if (tag === 'img') sharedAttrs += ' src="" alt=""';
        if (tag === 'input') sharedAttrs += ' type="text"';
        if (tag === 'button') sharedAttrs += ' type="button"';

        const isVoid = !!HtmlAst.VOID_TAGS[tag];
        const items = [];
        let firstOpenLen = 0;
        for (let i = 0; i < count; i++) {
            const idAttr = idMatch ? (' id="' + (i === 0 ? idMatch[1] : idMatch[1] + '-' + (i + 1)) + '"') : '';
            const openTagStr = '<' + tag + idAttr + sharedAttrs + '>';
            if (i === 0) firstOpenLen = openTagStr.length;
            items.push(isVoid ? openTagStr : openTagStr + '</' + tag + '>');
        }
        const info = lineInfo(text, from);
        const indentMatch = text.slice(info.start, from).match(/^[ \t]*/);
        const indent = indentMatch ? indentMatch[0] : '';
        const insert = items.join('\n' + indent);
        const firstClose = isVoid ? insert.length : firstOpenLen;
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

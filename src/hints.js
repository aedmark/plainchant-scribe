(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./html-ast.js'));
    else root.Hints = factory(root.HtmlAst);
})(typeof self !== 'undefined' ? self : this, function (HtmlAst) {
    'use strict';

    const OPTIONAL_END = new Set(['p', 'li', 'dt', 'dd', 'tr', 'td', 'th', 'thead', 'tbody', 'tfoot', 'colgroup', 'caption', 'option', 'optgroup', 'rt', 'rp', 'html', 'head', 'body']);
    const OBSOLETE = new Set(['center', 'font', 'marquee', 'blink', 'big', 'strike', 'tt', 'frame', 'frameset', 'noframes', 'acronym', 'applet', 'basefont', 'dir', 'isindex', 'nobr']);
    const UNLABELLED_TYPES = /^(hidden|submit|reset|button|image)$/i;
    const HEADING = /^h([1-6])$/;
    const OPEN_TAG = /^<\s*([a-zA-Z][a-zA-Z0-9:-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/;
    const CLOSE_TAG = /^<\/\s*([a-zA-Z][a-zA-Z0-9:-]*)\s*>/;

    function lineIndex(text) {
        const starts = [0];
        for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1);
        return (offset) => {
            let lo = 0;
            let hi = starts.length - 1;
            while (lo < hi) {
                const mid = (lo + hi + 1) >> 1;
                if (starts[mid] <= offset) lo = mid; else hi = mid - 1;
            }
            return lo + 1;
        };
    }

    function scanTags(text) {
        const events = [];
        let pos = 0;
        while (pos < text.length) {
            const lt = text.indexOf('<', pos);
            if (lt === -1) break;
            if (text.startsWith('<!--', lt)) {
                const close = text.indexOf('-->', lt + 4);
                pos = close === -1 ? text.length : close + 3;
                continue;
            }
            if (text.startsWith('<!', lt) || text.startsWith('<?', lt)) {
                const close = text.indexOf('>', lt + 2);
                pos = close === -1 ? text.length : close + 1;
                continue;
            }
            const rest = text.slice(lt);
            const closing = CLOSE_TAG.exec(rest);
            if (closing) {
                events.push({ type: 'close', tag: closing[1].toLowerCase(), start: lt, end: lt + closing[0].length });
                pos = lt + closing[0].length;
                continue;
            }
            const opening = OPEN_TAG.exec(rest);
            if (!opening) { pos = lt + 1; continue; }
            const tag = opening[1].toLowerCase();
            const end = lt + opening[0].length;
            pos = end;
            if (opening[3] === '/' || HtmlAst.VOID_TAGS[tag]) continue;
            if (tag === 'script' || tag === 'style') {
                const raw = new RegExp('<\\/\\s*' + tag + '\\s*>', 'i').exec(text.slice(end));
                if (!raw) { events.push({ type: 'open', tag: tag, start: lt, end: end }); pos = text.length; continue; }
                events.push({ type: 'open', tag: tag, start: lt, end: end });
                events.push({ type: 'close', tag: tag, start: end + raw.index, end: end + raw.index + raw[0].length });
                pos = end + raw.index + raw[0].length;
                continue;
            }
            events.push({ type: 'open', tag: tag, start: lt, end: end });
        }
        return events;
    }

    function balance(text, lineOf, add) {
        const stack = [];
        scanTags(text).forEach((ev) => {
            if (ev.type === 'open') { stack.push(ev); return; }
            let at = -1;
            for (let i = stack.length - 1; i >= 0; i--) if (stack[i].tag === ev.tag) { at = i; break; }
            if (at === -1) {
                add('markup', 'error', ev.start, ev.end, 'Stray </' + ev.tag + '> has no matching <' + ev.tag + '>.');
                return;
            }
            stack.splice(at + 1).forEach((open) => {
                if (!OPTIONAL_END.has(open.tag)) add('markup', 'error', open.start, open.end, '<' + open.tag + '> (line ' + lineOf(open.start) + ') is not closed before </' + ev.tag + '>.');
            });
            stack.pop();
        });
        stack.forEach((open) => {
            if (!OPTIONAL_END.has(open.tag)) add('markup', 'error', open.start, open.end, '<' + open.tag + '> is never closed.');
        });
    }

    function textOf(el) {
        let out = '';
        (el.children || []).forEach((c) => {
            if (c.type === 'text') out += c.text;
            else if (c.type === 'element') {
                if (c.tag === 'script' || c.tag === 'style') return;
                if (c.tag === 'img' && c.attrs.alt) out += c.attrs.alt;
                else if (c.attrs['aria-label'] || c.attrs.title) out += c.attrs['aria-label'] || c.attrs.title;
                else out += textOf(c);
            }
        });
        return out;
    }

    const named = (el) => Boolean(String(el.attrs['aria-label'] || el.attrs['aria-labelledby'] || el.attrs.title || '').trim() || textOf(el).trim());

    function checkHtml(text) {
        const ast = HtmlAst.parse(text);
        const lineOf = lineIndex(text);
        const problems = [];
        const add = (category, severity, start, end, message) => {
            problems.push({ start: start, end: end, line: lineOf(start), kind: category, category: category, severity: severity, message: message, ref: '', target: null });
        };
        const openOf = (el) => [el.start, el.openEnd];
        const labelFor = new Set();
        const ids = new Map();
        ast.elements.forEach((el) => {
            if (el.tag === 'label' && el.attrs.for) labelFor.add(el.attrs.for);
            if (el.attrs.id) {
                if (!ids.has(el.attrs.id)) ids.set(el.attrs.id, el);
            }
        });
        const seen = new Set();
        let previousHeading = 0;
        const hasAncestor = (el, tag) => {
            for (let p = ast.byId[el.parentId]; p && p.tag; p = ast.byId[p.parentId]) if (p.tag === tag) return true;
            return false;
        };
        ast.elements.forEach((el) => {
            const a = el.attrs;
            const span = openOf(el);
            if (a.id) {
                if (seen.has(a.id)) {
                    const sp = el.attrSpans.id || { start: span[0], end: span[1] };
                    add('markup', 'error', sp.start, sp.end, 'Duplicate id "' + a.id + '" (first used on line ' + lineOf(ids.get(a.id).start) + ').');
                }
                seen.add(a.id);
            }
            if (OBSOLETE.has(el.tag)) add('markup', 'warning', span[0], span[1], '<' + el.tag + '> is obsolete in HTML5; use CSS instead.');
            if (el.tag === 'label' && a.for && !ids.has(a.for)) {
                const sp = el.attrSpans.for || { start: span[0], end: span[1] };
                add('markup', 'warning', sp.start, sp.end, 'This label points at id "' + a.for + '", which does not exist on the page.');
            }
            if (el.tag === 'img' && !('alt' in a)) add('accessibility', 'warning', span[0], span[1], 'Image has no alt attribute. Describe it, or use alt="" if it is decorative.');
            if (el.tag === 'input' && /^image$/i.test(a.type || '') && !String(a.alt || a['aria-label'] || '').trim()) add('accessibility', 'warning', span[0], span[1], 'Image button has no alt text.');
            const level = HEADING.exec(el.tag);
            if (level) {
                const n = Number(level[1]);
                if (previousHeading && n > previousHeading + 1) add('accessibility', 'warning', span[0], span[1], 'Heading jumps from h' + previousHeading + ' to h' + n + ' (skips h' + (previousHeading + 1) + ').');
                previousHeading = n;
                if (!textOf(el).trim() && !a['aria-label']) add('accessibility', 'warning', span[0], span[1], 'Empty <' + el.tag + '> heading.');
            }
            if (el.tag === 'a' && a.href != null && !named(el)) add('accessibility', 'warning', span[0], span[1], 'Link has no text. Add text, an aria-label, or an image with alt.');
            if (el.tag === 'button' && !named(el)) add('accessibility', 'warning', span[0], span[1], 'Button has no text or aria-label.');
            if ((el.tag === 'input' && !UNLABELLED_TYPES.test(a.type || '')) || el.tag === 'select' || el.tag === 'textarea') {
                const labelled = String(a['aria-label'] || a['aria-labelledby'] || a.title || '').trim() || (a.id && labelFor.has(a.id)) || hasAncestor(el, 'label');
                if (!labelled) add('accessibility', 'warning', span[0], span[1], 'Form field has no label. Add a <label for>, wrap it in a <label>, or set aria-label.');
            }
            if (el.tag === 'iframe' && !String(a.title || a['aria-label'] || '').trim()) add('accessibility', 'warning', span[0], span[1], 'Frame has no title.');
            if (a.tabindex != null && parseInt(a.tabindex, 10) > 0) add('accessibility', 'warning', span[0], span[1], 'tabindex="' + a.tabindex + '" changes the natural tab order; use 0 or -1.');
            if (el.tag === 'html') {
                if (!String(a.lang || '').trim()) add('accessibility', 'warning', span[0], span[1], '<html> has no lang attribute, so screen readers cannot pick a voice.');
                const title = ast.elements.find((e) => e.tag === 'title');
                if (!title || !textOf(title).trim()) add('accessibility', 'warning', span[0], span[1], 'The page has no <title>.');
            }
        });
        balance(text, lineOf, add);
        return problems;
    }

    function createChecker() {
        const cache = new Map();
        function check(entries) {
            const problems = [];
            const order = Object.keys(entries);
            order.forEach((file) => {
                if (!/\.html?$/i.test(file)) return;
                const text = String(entries[file]);
                let hit = cache.get(file);
                if (!hit || hit.text !== text) { hit = { text: text, problems: checkHtml(text) }; cache.set(file, hit); }
                hit.problems.forEach((p) => problems.push(Object.assign({ file: file }, p)));
            });
            problems.sort((a, b) => (order.indexOf(a.file) - order.indexOf(b.file)) || (a.start - b.start));
            return {
                problems: problems,
                errors: problems.filter((p) => p.severity === 'error').length,
                warnings: problems.filter((p) => p.severity === 'warning').length
            };
        }
        return { check: check };
    }

    return { createChecker: createChecker, checkHtml: checkHtml, scanTags: scanTags };
});

(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.CssAst = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    function lineStarts(text) {
        const starts = [0];
        for (let i = 0; i < text.length; i++) {
            if (text.charCodeAt(i) === 10) starts.push(i + 1);
        }
        return starts;
    }

    function lineAt(starts, offset) {
        let lo = 0, hi = starts.length - 1;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (starts[mid] <= offset) lo = mid + 1;
            else hi = mid - 1;
        }
        return Math.max(0, hi);
    }

    function isEscaped(text, idx) {
        let bs = 0;
        for (let k = idx - 1; k >= 0 && text[k] === '\\'; k--) bs++;
        return bs % 2 === 1;
    }

    function stripComments(raw) {
        let out = '';
        let quote = null;
        for (let i = 0; i < raw.length; i++) {
            const ch = raw[i];
            if (quote) {
                out += ch;
                if (ch === quote && !isEscaped(raw, i)) quote = null;
            } else if (ch === '"' || ch === "'") {
                quote = ch;
                out += ch;
            } else if (ch === '/' && raw[i + 1] === '*') {
                const endC = raw.indexOf('*/', i + 2);
                i = endC === -1 ? raw.length : endC + 1;
                out += ' ';
            } else {
                out += ch;
            }
        }
        return out.replace(/\s+/g, ' ').trim();
    }

    function hasInnerRuleBrace(raw) {
        let quote = null;
        for (let i = 0; i < raw.length; i++) {
            const ch = raw[i];
            if (quote) {
                if (ch === quote && !isEscaped(raw, i)) quote = null;
            } else if (ch === '"' || ch === "'") {
                quote = ch;
            } else if (ch === '/' && raw[i + 1] === '*') {
                const endC = raw.indexOf('*/', i + 2);
                i = endC === -1 ? raw.length : endC + 1;
            } else if (ch === '{') {
                return true;
            }
        }
        return false;
    }

    function parseDeclarations(rawBody, bodyOffset) {
        const decls = [];
        let i = 0;
        const len = rawBody.length;
        while (i < len) {
            while (i < len && /\s/.test(rawBody[i])) i++;
            if (i >= len) break;
            if (rawBody[i] === '/' && rawBody[i + 1] === '*') {
                const endC = rawBody.indexOf('*/', i + 2);
                i = endC === -1 ? len : endC + 2;
                continue;
            }
            const start = i;
            let colon = -1;
            let semi = -1;
            let quote = null;
            let parenDepth = 0;
            while (i < len) {
                const ch = rawBody[i];
                if (quote) {
                    if (ch === quote && !isEscaped(rawBody, i)) quote = null;
                } else if (ch === '/' && rawBody[i + 1] === '*') {
                    const endC = rawBody.indexOf('*/', i + 2);
                    i = endC === -1 ? len : endC + 2;
                    continue;
                } else if (ch === '"' || ch === "'") {
                    quote = ch;
                } else if (ch === '(') {
                    parenDepth++;
                } else if (ch === ')') {
                    if (parenDepth > 0) parenDepth--;
                } else if (ch === ':' && colon === -1 && parenDepth === 0) {
                    colon = i;
                } else if (ch === ';' && parenDepth === 0) {
                    semi = i;
                    i++;
                    break;
                }
                i++;
            }
            const end = semi !== -1 ? semi + 1 : i;
            if (colon !== -1) {
                const prop = stripComments(rawBody.slice(start, colon)).toLowerCase();
                const valSliceEnd = semi !== -1 ? semi : i;
                const rawVal = rawBody.slice(colon + 1, valSliceEnd);
                const trimLead = rawVal.match(/^\s*/)[0].length;
                const trimTrail = rawVal.match(/\s*$/)[0].length;
                const value = stripComments(rawVal);
                const valTrimmed = rawVal.trim();
                const valueStart = valTrimmed
                    ? bodyOffset + colon + 1 + trimLead
                    : Math.min(bodyOffset + valSliceEnd, bodyOffset + colon + 1 + (trimLead ? 1 : 0));
                const valueEnd = valTrimmed
                    ? bodyOffset + valSliceEnd - trimTrail
                    : bodyOffset + valSliceEnd;
                if (prop) {
                    decls.push({
                        prop: prop,
                        value: value,
                        start: bodyOffset + start,
                        end: bodyOffset + end,
                        valueStart: valueStart,
                        valueEnd: Math.max(valueStart, valueEnd)
                    });
                }
            }
        }
        return decls;
    }

    function parse(css) {
        const text = String(css || '');
        const starts = lineStarts(text);
        const rules = [];
        const blocks = [];
        let i = 0;
        const len = text.length;

        while (i < len) {
            while (i < len && /\s/.test(text[i])) i++;
            if (i >= len) break;
            if (text[i] === '/' && text[i + 1] === '*') {
                const endC = text.indexOf('*/', i + 2);
                i = endC === -1 ? len : endC + 2;
                continue;
            }
            const selStart = i;
            let p = i;
            let selQuote = null;
            let selDepth = 0;
            let openBrace = -1;
            let semiTop = -1;
            while (p < len) {
                const ch = text[p];
                if (selQuote) {
                    if (ch === selQuote && !isEscaped(text, p)) selQuote = null;
                } else if (ch === '"' || ch === "'") {
                    selQuote = ch;
                } else if (ch === '/' && text[p + 1] === '*') {
                    const endC = text.indexOf('*/', p + 2);
                    p = endC === -1 ? len : endC + 2;
                    continue;
                } else if (ch === '(' || ch === '[') {
                    selDepth++;
                } else if (ch === ')' || ch === ']') {
                    if (selDepth > 0) selDepth--;
                } else if (ch === ';' && selDepth === 0) {
                    semiTop = p;
                    break;
                } else if (ch === '{' && selDepth === 0) {
                    openBrace = p;
                    break;
                }
                p++;
            }
            if (semiTop !== -1) {
                i = semiTop + 1;
                continue;
            }
            if (openBrace === -1) break;
            const rawSel = stripComments(text.slice(selStart, openBrace));
            let depth = 1;
            let j = openBrace + 1;
            let quote = null;
            while (j < len && depth > 0) {
                const ch = text[j];
                if (quote) {
                    if (ch === quote && !isEscaped(text, j)) quote = null;
                } else if (ch === '"' || ch === "'") {
                    quote = ch;
                } else if (ch === '/' && text[j + 1] === '*') {
                    const endC = text.indexOf('*/', j + 2);
                    j = endC === -1 ? len : endC + 1;
                } else if (ch === '{') {
                    depth++;
                } else if (ch === '}') {
                    depth--;
                }
                j++;
            }
            const closeBrace = depth === 0 ? j - 1 : len;
            const bodyStart = openBrace + 1;
            const bodyEnd = closeBrace;

            if (/^@(?:-[a-z-]+-)?keyframes\b|^@font-face\b|^@property\b|^@page\b/i.test(rawSel)) {
                i = j;
                continue;
            }

            const isMedia = /^@media\b/i.test(rawSel);
            if (isMedia || (rawSel.startsWith('@') && hasInnerRuleBrace(text.slice(bodyStart, bodyEnd)))) {
                const inner = parse(text.slice(bodyStart, bodyEnd));
                if (isMedia) {
                    blocks.push({ media: rawSel, start: selStart, end: j, bodyStart: bodyStart, bodyEnd: bodyEnd });
                }
                inner.rules.forEach((r) => {
                    rules.push({
                        selector: r.selector,
                        media: r.media || rawSel,
                        start: bodyStart + r.start,
                        end: bodyStart + r.end,
                        selectorStart: bodyStart + r.selectorStart,
                        selectorEnd: bodyStart + r.selectorEnd,
                        bodyStart: bodyStart + r.bodyStart,
                        bodyEnd: bodyStart + r.bodyEnd,
                        line: lineAt(starts, bodyStart + r.start),
                        declarations: r.declarations.map((d) => ({
                            prop: d.prop,
                            value: d.value,
                            start: bodyStart + d.start,
                            end: bodyStart + d.end,
                            valueStart: bodyStart + d.valueStart,
                            valueEnd: bodyStart + d.valueEnd
                        }))
                    });
                });
            } else if (rawSel && !rawSel.startsWith('@')) {
                rules.push({
                    selector: rawSel,
                    media: null,
                    start: selStart,
                    end: j,
                    selectorStart: selStart,
                    selectorEnd: openBrace,
                    bodyStart: bodyStart,
                    bodyEnd: bodyEnd,
                    line: lineAt(starts, selStart),
                    declarations: parseDeclarations(text.slice(bodyStart, bodyEnd), bodyStart)
                });
            }
            i = j;
        }
        return { rules: rules, text: text, blocks: blocks };
    }

    function mediaQuery(raw) {
        return String(raw || '').trim().replace(/^@media\s*/i, '').replace(/\s+/g, ' ').replace(/\s*:\s*/g, ': ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').toLowerCase();
    }

    function sameMedia(rule, media) {
        const want = mediaQuery(media);
        return want ? Boolean(rule.media) && mediaQuery(rule.media) === want : !rule.media;
    }

    function maxWidthOf(raw) {
        const m = /^\(max-width: (\d+(?:\.\d+)?)px\)$/.exec(mediaQuery(raw));
        return m ? parseFloat(m[1]) : null;
    }

    function splitTopLevel(selector) {
        const parts = [];
        let depth = 0;
        let quote = null;
        let from = 0;
        const text = String(selector || '');
        for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            if (quote) {
                if (ch === quote && !isEscaped(text, i)) quote = null;
            } else if (ch === '"' || ch === "'") quote = ch;
            else if (ch === '(' || ch === '[') depth++;
            else if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
            else if (ch === ',' && depth === 0) {
                parts.push(text.slice(from, i));
                from = i + 1;
            }
        }
        parts.push(text.slice(from));
        return parts.map((p) => p.trim()).filter(Boolean);
    }

    function splitTopCombinators(part) {
        const out = [];
        let buf = '';
        let quote = null;
        let bracket = 0;
        let paren = 0;
        for (let i = 0; i < part.length; i++) {
            const ch = part[i];
            if (quote) {
                buf += ch;
                if (ch === quote && !isEscaped(part, i)) quote = null;
            } else if (ch === '"' || ch === "'") {
                quote = ch;
                buf += ch;
            } else if (ch === '[') { bracket++; buf += ch; }
            else if (ch === ']') { bracket = Math.max(0, bracket - 1); buf += ch; }
            else if (ch === '(') { paren++; buf += ch; }
            else if (ch === ')') { paren = Math.max(0, paren - 1); buf += ch; }
            else if (bracket === 0 && paren === 0 && /[\s>+~]/.test(ch)) {
                if (buf) { out.push(buf); buf = ''; }
            } else {
                buf += ch;
            }
        }
        if (buf) out.push(buf);
        return out;
    }

    function stripPseudoAndAttr(sel) {
        let out = '';
        let quote = null;
        for (let i = 0; i < sel.length; i++) {
            const ch = sel[i];
            if (ch === '[') {
                i++;
                while (i < sel.length && (quote || sel[i] !== ']')) {
                    if (quote) { if (sel[i] === quote && !isEscaped(sel, i)) quote = null; }
                    else if (sel[i] === '"' || sel[i] === "'") quote = sel[i];
                    i++;
                }
                quote = null;
                continue;
            }
            if (ch === ':') {
                while (i + 1 < sel.length && (sel[i + 1] === ':' || /[a-zA-Z0-9_-]/.test(sel[i + 1]))) i++;
                if (sel[i + 1] === '(') {
                    let depth = 0;
                    i++;
                    while (i < sel.length) {
                        if (quote) { if (sel[i] === quote && !isEscaped(sel, i)) quote = null; }
                        else if (sel[i] === '"' || sel[i] === "'") quote = sel[i];
                        else if (sel[i] === '(') depth++;
                        else if (sel[i] === ')') { depth--; if (depth === 0) break; }
                        i++;
                    }
                    quote = null;
                }
                continue;
            }
            out += ch;
        }
        return out;
    }

    function selectorMatchesElement(selector, el) {
        if (!el || el.type !== 'element') return false;
        const parts = splitTopLevel(selector);
        const tag = el.tag;
        const id = (el.attrs && el.attrs.id) || '';
        const classes = ((el.attrs && el.attrs.class) || '').trim().split(/\s+/).filter(Boolean);

        return parts.some((part) => {
            const tokens = splitTopCombinators(part);
            if (!tokens.length) return false;
            const last = stripPseudoAndAttr(tokens[tokens.length - 1]);
            return simpleMatch(last, tag, id, classes);
        });
    }

    function simpleMatch(sel, tag, id, classes) {
        if (!sel || sel === '*') return false;
        const tagMatch = sel.match(/^[a-zA-Z][a-zA-Z0-9-]*/);
        if (tagMatch && tagMatch[0].toLowerCase() !== tag) return false;
        const idMatches = sel.match(/#([a-zA-Z0-9_-]+)/g);
        if (idMatches) {
            for (let i = 0; i < idMatches.length; i++) {
                if (idMatches[i].slice(1) !== id) return false;
            }
        }
        const classMatches = sel.match(/\.([a-zA-Z0-9_-]+)/g);
        if (classMatches) {
            for (let i = 0; i < classMatches.length; i++) {
                if (classes.indexOf(classMatches[i].slice(1)) === -1) return false;
            }
        }
        return Boolean(tagMatch || idMatches || classMatches);
    }

    function findRulesForElement(cssAst, el) {
        const ast = typeof cssAst === 'string' ? parse(cssAst) : cssAst;
        if (!ast || !ast.rules || !el) return [];
        return ast.rules.filter((r) => !r.media && selectorMatchesElement(r.selector, el));
    }

    function findRuleBySelector(css, selector, media) {
        const ast = typeof css === 'string' ? parse(css) : css;
        if (!ast || !ast.rules) return null;
        const norm = String(selector || '').trim().replace(/\s+/g, ' ');
        if (!norm) return null;
        if (typeof media === 'string') {
            const scoped = ast.rules.filter((r) => sameMedia(r, media));
            for (let i = scoped.length - 1; i >= 0; i--) if (scoped[i].selector === norm) return scoped[i];
            for (let i = scoped.length - 1; i >= 0; i--) if (scoped[i].selector.split(',').map((x) => x.trim()).indexOf(norm) !== -1) return scoped[i];
            return null;
        }
        for (let i = ast.rules.length - 1; i >= 0; i--) {
            if (!ast.rules[i].media && ast.rules[i].selector === norm) return ast.rules[i];
        }
        for (let i = ast.rules.length - 1; i >= 0; i--) {
            const parts = ast.rules[i].selector.split(',').map((s) => s.trim());
            if (!ast.rules[i].media && parts.indexOf(norm) !== -1) return ast.rules[i];
        }
        for (let i = ast.rules.length - 1; i >= 0; i--) {
            if (ast.rules[i].selector === norm) return ast.rules[i];
        }
        return null;
    }

    function getDeclarations(css, selector, media) {
        const ast = typeof css === 'string' ? parse(css) : css;
        const norm = String(selector || '').trim().replace(/\s+/g, ' ');
        const map = {};
        ast.rules.forEach((r) => {
            if (sameMedia(r, media) && r.selector === norm) {
                r.declarations.forEach((d) => { map[d.prop] = d.value; });
            }
        });
        return map;
    }

    function addRule(ast, selector, prop, value, query) {
        const text = ast.text;
        const body = (indent) => indent + selector + ' {\n' + indent + '  ' + prop + ': ' + value + ';\n' + indent + '}\n';
        const blocks = ast.blocks || [];
        if (!query) {
            const first = blocks[0];
            if (first) return text.slice(0, first.start) + body('') + '\n' + text.slice(first.start);
            const prefix = text.length > 0 && !/\n\s*$/.test(text) ? '\n\n' : (text.length > 0 && !text.endsWith('\n\n') ? '\n' : '');
            return text + prefix + body('');
        }
        const same = blocks.filter((b) => mediaQuery(b.media) === query);
        if (same.length) {
            const block = same[same.length - 1];
            return text.slice(0, block.bodyEnd).replace(/\s*$/, '') + '\n\n' + body('  ') + text.slice(block.bodyEnd);
        }
        const width = maxWidthOf(query);
        const later = width === null ? null : blocks.find((b) => { const w = maxWidthOf(b.media); return w !== null && w < width; });
        const block = '@media ' + query + ' {\n' + body('  ') + '}\n';
        if (later) return text.slice(0, later.start) + block + '\n' + text.slice(later.start);
        const prefix = text.length > 0 && !/\n\s*$/.test(text) ? '\n\n' : (text.length > 0 && !text.endsWith('\n\n') ? '\n' : '');
        return text + prefix + block;
    }

    function setProperty(css, selector, prop, value, media) {
        const ast = parse(css);
        const text = ast.text;
        const normSel = String(selector || '').trim().replace(/\s+/g, ' ');
        const cleanProp = String(prop || '').trim().toLowerCase();
        if (!normSel || !cleanProp) return text;
        const cleanVal = value === null || value === undefined ? '' : String(value).trim();

        let targetRule = null;
        for (let i = ast.rules.length - 1; i >= 0; i--) {
            if (sameMedia(ast.rules[i], media) && ast.rules[i].selector === normSel) {
                targetRule = ast.rules[i];
                break;
            }
        }

        if (!targetRule) {
            if (!cleanVal) return text;
            return addRule(ast, normSel, cleanProp, cleanVal, mediaQuery(media));
        }

        let existing = null;
        for (let i = targetRule.declarations.length - 1; i >= 0; i--) {
            if (targetRule.declarations[i].prop === cleanProp) {
                existing = targetRule.declarations[i];
                break;
            }
        }

        if (existing) {
            if (!cleanVal) {
                let from = existing.start;
                let to = existing.end;
                const lineStart = text.lastIndexOf('\n', from - 1);
                if (lineStart >= targetRule.bodyStart && /^[ \t]*$/.test(text.slice(lineStart + 1, from))) {
                    from = lineStart + 1;
                    if (text[to] === '\r' && text[to + 1] === '\n') to += 2;
                    else if (text[to] === '\n') to++;
                }
                return text.slice(0, from) + text.slice(to);
            }
            return text.slice(0, existing.valueStart) + cleanVal + text.slice(existing.valueEnd);
        }

        if (!cleanVal) return text;
        const bodySlice = text.slice(targetRule.bodyStart, targetRule.bodyEnd);
        const isMultiline = bodySlice.indexOf('\n') !== -1;
        if (isMultiline) {
            const tail = /[ \t]*$/.exec(bodySlice)[0];
            const trimmed = bodySlice.slice(0, bodySlice.length - tail.length);
            const endsWithNewline = trimmed.endsWith('\n');
            const lineStart = text.lastIndexOf('\n', targetRule.start - 1) + 1;
            const lead = text.slice(lineStart, targetRule.start);
            const indent = /^[ \t]*$/.test(lead) ? lead : '';
            const insertion = (endsWithNewline ? '' : '\n') + indent + '  ' + cleanProp + ': ' + cleanVal + ';\n';
            return text.slice(0, targetRule.bodyStart) + trimmed + insertion + tail + text.slice(targetRule.bodyEnd);
        }
        const sep = bodySlice.trim().length ? (bodySlice.trim().endsWith(';') ? ' ' : '; ') : ' ';
        return text.slice(0, targetRule.bodyEnd).replace(/\s*$/, '') + sep + cleanProp + ': ' + cleanVal + '; ' + text.slice(targetRule.bodyEnd);
    }

    function parseInlineStyle(styleStr) {
        const decls = parseDeclarations(String(styleStr || ''), 0);
        const map = {};
        decls.forEach((d) => { map[d.prop] = d.value; });
        return map;
    }

    function formatInlineStyle(map) {
        const parts = [];
        Object.keys(map || {}).forEach((k) => {
            const v = map[k];
            if (v !== null && v !== undefined && String(v).trim() !== '') {
                parts.push(k.trim().toLowerCase() + ': ' + String(v).trim());
            }
        });
        return parts.join('; ');
    }

    function stripAttrBrackets(sel) {
        let out = '';
        let quote = null;
        let bracket = 0;
        for (let i = 0; i < sel.length; i++) {
            const ch = sel[i];
            if (quote) {
                if (ch === quote && !isEscaped(sel, i)) quote = null;
            } else if (ch === '"' || ch === "'") {
                quote = ch;
            } else if (ch === '[') {
                bracket++;
            } else if (ch === ']') {
                bracket = Math.max(0, bracket - 1);
            } else if (bracket === 0) {
                out += ch;
            }
        }
        return out;
    }

    function listSelectors(css, htmlAst) {
        const ast = typeof css === 'string' ? parse(css) : css;
        const classes = new Set();
        const ids = new Set();
        const rules = [];
        (ast && ast.rules ? ast.rules : []).forEach((r) => {
            if (!r.media && rules.indexOf(r.selector) === -1) rules.push(r.selector);
            const cleanSel = stripAttrBrackets(r.selector);
            const cm = cleanSel.match(/\.([a-zA-Z0-9_-]+)/g) || [];
            cm.forEach((c) => classes.add(c.slice(1)));
            const im = cleanSel.match(/#([a-zA-Z0-9_-]+)/g) || [];
            im.forEach((id) => ids.add(id.slice(1)));
        });
        if (htmlAst && htmlAst.elements) {
            htmlAst.elements.forEach((el) => {
                if (el.attrs && el.attrs.id) ids.add(el.attrs.id);
                if (el.attrs && el.attrs.class) {
                    el.attrs.class.split(/\s+/).filter(Boolean).forEach((c) => classes.add(c));
                }
            });
        }
        return {
            rules: rules,
            classes: Array.from(classes).sort(),
            ids: Array.from(ids).sort()
        };
    }

    return {
        parse: parse,
        findRulesForElement: findRulesForElement,
        findRuleBySelector: findRuleBySelector,
        getDeclarations: getDeclarations,
        setProperty: setProperty,
        mediaQuery: mediaQuery,
        parseInlineStyle: parseInlineStyle,
        formatInlineStyle: formatInlineStyle,
        listSelectors: listSelectors
    };
});

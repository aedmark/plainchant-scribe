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

    function parseDeclarations(rawBody, bodyOffset) {
        const decls = [];
        let i = 0;
        const len = rawBody.length;
        while (i < len) {
            while (i < len && /\s/.test(rawBody[i])) i++;
            if (i >= len) break;
            if (rawBody.slice(i, i + 2) === '/*') {
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
                    if (ch === quote && rawBody[i - 1] !== '\\') quote = null;
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
                const prop = rawBody.slice(start, colon).trim().toLowerCase();
                const valSliceEnd = semi !== -1 ? semi : i;
                const rawVal = rawBody.slice(colon + 1, valSliceEnd);
                const trimLead = rawVal.match(/^\s*/)[0].length;
                const trimTrail = rawVal.match(/\s*$/)[0].length;
                const value = rawVal.trim();
                if (prop) {
                    decls.push({
                        prop: prop,
                        value: value,
                        start: bodyOffset + start,
                        end: bodyOffset + end,
                        valueStart: bodyOffset + colon + 1 + trimLead,
                        valueEnd: bodyOffset + valSliceEnd - trimTrail
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
            if (text.slice(i, i + 2) === '/*') {
                const endC = text.indexOf('*/', i + 2);
                i = endC === -1 ? len : endC + 2;
                continue;
            }
            const selStart = i;
            const openBrace = text.indexOf('{', i);
            if (openBrace === -1) break;
            const rawSel = text.slice(selStart, openBrace).trim();
            let depth = 1;
            let j = openBrace + 1;
            let quote = null;
            while (j < len && depth > 0) {
                const ch = text[j];
                if (quote) {
                    if (ch === quote && text[j - 1] !== '\\') quote = null;
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

            if (rawSel.startsWith('@') && text.slice(bodyStart, bodyEnd).indexOf('{') !== -1) {
                const inner = parse(text.slice(bodyStart, bodyEnd));
                blocks.push({ media: rawSel, start: selStart, end: j, bodyStart: bodyStart, bodyEnd: bodyEnd });
                inner.rules.forEach((r) => {
                    rules.push({
                        selector: r.selector,
                        media: rawSel,
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
            } else if (!rawSel.startsWith('@keyframes') && !rawSel.startsWith('@font-face')) {
                rules.push({
                    selector: rawSel.replace(/\s+/g, ' '),
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

    const MEDIA_PRESETS = [
        { key: 'tablet', query: '(max-width: 768px)', width: '768px' },
        { key: 'mobile', query: '(max-width: 375px)', width: '375px' }
    ];

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

    function selectorMatchesElement(selector, el) {
        if (!el || el.type !== 'element') return false;
        const parts = String(selector || '').split(',').map((s) => s.trim()).filter(Boolean);
        const tag = el.tag;
        const id = (el.attrs && el.attrs.id) || '';
        const classes = ((el.attrs && el.attrs.class) || '').trim().split(/\s+/).filter(Boolean);

        return parts.some((part) => {
            if (part.indexOf(' ') !== -1 || part.indexOf('>') !== -1 || part.indexOf(':') !== -1) {
                const tokens = part.split(/[\s>+~]+/).filter(Boolean);
                const last = tokens[tokens.length - 1].replace(/:[a-zA-Z-]+/g, '');
                return simpleMatch(last, tag, id, classes);
            }
            return simpleMatch(part, tag, id, classes);
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
                    if (text[to] === '\n') to++;
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

    const STATES = ['hover', 'active', 'focus', 'focus-visible', 'focus-within'];
    const TRAILING_STATES = /(?::(?:hover|active|focus-visible|focus-within|focus))+$/;
    const STATE_PSEUDO = /:(hover|active|focus-visible|focus-within|focus)(?![\w-])/g;

    function splitTopLevel(selector) {
        const parts = [];
        let depth = 0;
        let quote = null;
        let from = 0;
        const text = String(selector || '');
        for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            if (quote) {
                if (ch === quote && text[i - 1] !== '\\') quote = null;
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

    function stateOf(selector) {
        let found = '';
        const parts = splitTopLevel(selector);
        for (let i = 0; i < parts.length; i++) {
            const m = /:(hover|active|focus-visible|focus-within|focus)$/.exec(parts[i]);
            if (!m || (found && found !== m[1])) return '';
            found = m[1];
        }
        return found;
    }

    function baseSelector(selector) {
        const seen = [];
        splitTopLevel(selector).forEach((p) => {
            const base = p.replace(TRAILING_STATES, '') || p;
            if (seen.indexOf(base) === -1) seen.push(base);
        });
        return seen.join(', ');
    }

    function withState(selector, state, el) {
        if (STATES.indexOf(state) === -1) return String(selector || '').trim().replace(/\s+/g, ' ');
        const parts = splitTopLevel(baseSelector(selector));
        const pick = (parts.length > 1 && el && parts.find((p) => selectorMatchesElement(p, el))) || parts[0] || '';
        return pick.replace(/\s+/g, ' ') + ':' + state;
    }

    function forceStates(css) {
        const ast = parse(css);
        let text = ast.text;
        ast.rules.slice().sort((a, b) => b.selectorStart - a.selectorStart).forEach((rule) => {
            const raw = text.slice(rule.selectorStart, rule.selectorEnd);
            const parts = splitTopLevel(raw);
            const extra = parts.filter((p) => /:(hover|active|focus-visible|focus-within|focus)(?![\w-])/.test(p))
                .map((p) => p.replace(STATE_PSEUDO, '[data-pc-force~="$1"]'));
            if (!extra.length) return;
            const trailing = raw.match(/\s*$/)[0];
            text = text.slice(0, rule.selectorStart) + raw.replace(/\s*$/, '') + ', ' + extra.join(', ') + trailing + text.slice(rule.selectorEnd);
        });
        return text;
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

    function listSelectors(css, htmlAst) {
        const ast = typeof css === 'string' ? parse(css) : css;
        const classes = new Set();
        const ids = new Set();
        const rules = [];
        (ast && ast.rules ? ast.rules : []).forEach((r) => {
            if (!r.media && rules.indexOf(r.selector) === -1) rules.push(r.selector);
            const cm = r.selector.match(/\.([a-zA-Z0-9_-]+)/g) || [];
            cm.forEach((c) => classes.add(c.slice(1)));
            const im = r.selector.match(/#([a-zA-Z0-9_-]+)/g) || [];
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
        STATES: STATES,
        MEDIA_PRESETS: MEDIA_PRESETS,
        mediaQuery: mediaQuery,
        splitTopLevel: splitTopLevel,
        stateOf: stateOf,
        baseSelector: baseSelector,
        withState: withState,
        forceStates: forceStates,
        parseInlineStyle: parseInlineStyle,
        formatInlineStyle: formatInlineStyle,
        listSelectors: listSelectors
    };
});

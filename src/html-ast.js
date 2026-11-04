(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.HtmlAst = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const VOID_TAGS = {
        area: true, base: true, br: true, col: true, embed: true, hr: true,
        img: true, input: true, link: true, meta: true, param: true,
        source: true, track: true, wbr: true
    };
    const RAW_TAGS = { script: true, style: true };

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

    function escapeHtml(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function escapeAttr(str) {
        return escapeHtml(str).replace(/"/g, '&quot;');
    }

    function parseAttributes(raw, baseOffset) {
        const attrs = {};
        const spans = {};
        const re = /([^\s=<>"'/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
        let m;
        while ((m = re.exec(raw)) !== null) {
            const name = m[1].toLowerCase();
            const val = m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : (m[4] !== undefined ? m[4] : ''));
            attrs[name] = val;
            spans[name] = {
                start: baseOffset + m.index,
                end: baseOffset + m.index + m[0].length,
                name: m[1],
                value: val,
                hasValue: m[2] !== undefined || m[3] !== undefined || m[4] !== undefined
            };
        }
        return { attrs: attrs, spans: spans };
    }

    function parse(html) {
        const text = String(html || '');
        const starts = lineStarts(text);
        const root = { type: 'root', id: 'pc-0', start: 0, end: text.length, line: 0, children: [] };
        const byId = { 'pc-0': root };
        const elements = [];
        const stack = [root];
        let seq = 1;
        let pos = 0;

        while (pos < text.length) {
            const lt = text.indexOf('<', pos);
            if (lt === -1) {
                const slice = text.slice(pos);
                if (slice) {
                    stack[stack.length - 1].children.push({
                        type: 'text', start: pos, end: text.length,
                        line: lineAt(starts, pos), text: slice
                    });
                }
                break;
            }
            if (lt > pos) {
                stack[stack.length - 1].children.push({
                    type: 'text', start: pos, end: lt,
                    line: lineAt(starts, pos), text: text.slice(pos, lt)
                });
            }

            if (text.startsWith('<!--', lt)) {
                const close = text.indexOf('-->', lt + 4);
                const end = close === -1 ? text.length : close + 3;
                stack[stack.length - 1].children.push({
                    type: 'comment', start: lt, end: end,
                    line: lineAt(starts, lt), text: text.slice(lt, end)
                });
                pos = end;
                continue;
            }

            if (text.startsWith('<!', lt) || text.startsWith('<?', lt)) {
                const close = text.indexOf('>', lt + 2);
                const end = close === -1 ? text.length : close + 1;
                stack[stack.length - 1].children.push({
                    type: 'doctype', start: lt, end: end,
                    line: lineAt(starts, lt), text: text.slice(lt, end)
                });
                pos = end;
                continue;
            }

            const closeMatch = text.slice(lt).match(/^<\/\s*([a-zA-Z][a-zA-Z0-9:-]*)\s*>/);
            if (closeMatch) {
                const tag = closeMatch[1].toLowerCase();
                const end = lt + closeMatch[0].length;
                for (let i = stack.length - 1; i >= 1; i--) {
                    if (stack[i].tag === tag) {
                        for (let j = stack.length - 1; j >= i; j--) {
                            stack[j].end = (j === i) ? end : lt;
                            if (j === i) {
                                stack[j].closeStart = lt;
                                stack[j].closeEnd = end;
                            }
                            stack.pop();
                        }
                        break;
                    }
                }
                pos = end;
                continue;
            }

            const openMatch = text.slice(lt).match(/^<\s*([a-zA-Z][a-zA-Z0-9:-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/);
            if (!openMatch) {
                stack[stack.length - 1].children.push({
                    type: 'text', start: lt, end: lt + 1,
                    line: lineAt(starts, lt), text: '<'
                });
                pos = lt + 1;
                continue;
            }

            const rawTag = openMatch[1];
            const tag = rawTag.toLowerCase();
            const attrRaw = openMatch[2] || '';
            const selfClose = openMatch[3] === '/' || !!VOID_TAGS[tag];
            const openEnd = lt + openMatch[0].length;
            const attrBase = lt + 1 + rawTag.length;
            const parsedAttrs = parseAttributes(attrRaw, attrBase);
            const id = 'pc-' + (seq++);
            const parent = stack[stack.length - 1];

            const node = {
                type: 'element',
                id: id,
                parentId: parent.id,
                tag: tag,
                attrs: parsedAttrs.attrs,
                attrSpans: parsedAttrs.spans,
                start: lt,
                openStart: lt,
                openEnd: openEnd,
                closeStart: selfClose ? openEnd : openEnd,
                closeEnd: selfClose ? openEnd : openEnd,
                end: openEnd,
                selfClosing: selfClose,
                line: lineAt(starts, lt),
                children: []
            };

            parent.children.push(node);
            byId[id] = node;
            elements.push(node);

            if (RAW_TAGS[tag] && !selfClose) {
                const closeRe = new RegExp('<\\/\\s*' + tag + '\\s*>', 'i');
                const rest = text.slice(openEnd);
                const m = closeRe.exec(rest);
                if (m) {
                    const cStart = openEnd + m.index;
                    const cEnd = cStart + m[0].length;
                    if (cStart > openEnd) {
                        node.children.push({
                            type: 'text', start: openEnd, end: cStart,
                            line: lineAt(starts, openEnd), text: text.slice(openEnd, cStart)
                        });
                    }
                    node.closeStart = cStart;
                    node.closeEnd = cEnd;
                    node.end = cEnd;
                    pos = cEnd;
                } else {
                    node.closeStart = text.length;
                    node.closeEnd = text.length;
                    node.end = text.length;
                    pos = text.length;
                }
                continue;
            }

            if (!selfClose) {
                stack.push(node);
            }
            pos = openEnd;
        }

        while (stack.length > 1) {
            const top = stack.pop();
            top.closeStart = text.length;
            top.closeEnd = text.length;
            top.end = text.length;
        }

        return { root: root, byId: byId, elements: elements, text: text };
    }

    function findById(ast, id) {
        return (ast && ast.byId && ast.byId[id]) || null;
    }

    function nodeAtOffset(ast, offset) {
        if (!ast || !ast.elements) return null;
        let best = null;
        for (let i = 0; i < ast.elements.length; i++) {
            const el = ast.elements[i];
            if (offset >= el.start && offset <= el.end) {
                if (!best || (el.end - el.start) <= (best.end - best.start)) best = el;
            }
        }
        return best;
    }

    function nodeAtLine(ast, line) {
        if (!ast || !ast.elements || !ast.elements.length) return null;
        let best = null;
        for (let i = 0; i < ast.elements.length; i++) {
            const el = ast.elements[i];
            if (el.line <= line) best = el;
            else break;
        }
        return best || ast.elements[0];
    }

    function innerText(ast, id) {
        const node = findById(ast, id);
        if (!node) return '';
        return ast.text.slice(node.openEnd, node.closeStart);
    }

    function stamp(html, parsed) {
        const ast = parsed || parse(html);
        const text = ast.text;
        const insertions = [];
        for (let i = 0; i < ast.elements.length; i++) {
            const el = ast.elements[i];
            if (el.tag === 'html' || el.tag === 'head' || el.tag === 'meta' || el.tag === 'title' || el.tag === 'link' || el.tag === 'script' || el.tag === 'style') {
                continue;
            }
            const beforeClose = text[el.openEnd - 2] === '/' ? el.openEnd - 2 : el.openEnd - 1;
            insertions.push({
                at: beforeClose,
                str: ' data-pc-id="' + el.id + '" data-line="' + el.line + '"'
            });
        }
        insertions.sort((a, b) => b.at - a.at);
        let out = text;
        for (let i = 0; i < insertions.length; i++) {
            const ins = insertions[i];
            out = out.slice(0, ins.at) + ins.str + out.slice(ins.at);
        }
        return out;
    }

    function setAttr(html, id, name, value) {
        const ast = parse(html);
        const el = findById(ast, id);
        if (!el) return String(html || '');
        const key = String(name || '').trim().toLowerCase();
        if (!key) return ast.text;
        const existing = el.attrSpans[key];

        if (value === null || value === undefined || value === false) {
            if (!existing) return ast.text;
            let from = existing.start;
            if (from > el.openStart && /\s/.test(ast.text[from - 1])) from--;
            return ast.text.slice(0, from) + ast.text.slice(existing.end);
        }

        const formatted = value === true ? key : key + '="' + escapeAttr(value) + '"';
        if (existing) {
            return ast.text.slice(0, existing.start) + formatted + ast.text.slice(existing.end);
        }
        const insertAt = ast.text[el.openEnd - 2] === '/' ? el.openEnd - 2 : el.openEnd - 1;
        return ast.text.slice(0, insertAt) + ' ' + formatted + ast.text.slice(insertAt);
    }

    function setText(html, id, newText) {
        const ast = parse(html);
        const el = findById(ast, id);
        if (!el || el.selfClosing) return String(html || '');
        return ast.text.slice(0, el.openEnd) + escapeHtml(newText) + ast.text.slice(el.closeStart);
    }

    function setInnerHtml(html, id, rawInner) {
        const ast = parse(html);
        const el = findById(ast, id);
        if (!el || el.selfClosing) return String(html || '');
        return ast.text.slice(0, el.openEnd) + String(rawInner == null ? '' : rawInner) + ast.text.slice(el.closeStart);
    }

    function lineIndentAt(text, offset) {
        const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
        const m = text.slice(lineStart, offset).match(/^[ \t]*/);
        return m ? m[0] : '';
    }

    function insertElementAt(html, targetId, position, snippet) {
        const ast = parse(html);
        const code = String(snippet || '').trim();
        if (!code) return { html: ast.text, offset: -1, id: null };
        let el = findById(ast, targetId);
        if (!el) {
            el = ast.elements.find((n) => n.tag === 'body') || ast.elements[ast.elements.length - 1];
        }
        let head;
        let lead = '';
        let trail = '';
        let tail = '';
        if (!el) {
            head = ast.text;
            lead = ast.text ? '\n' : '';
        } else {
            const indent = lineIndentAt(ast.text, el.start);
            const childIndent = indent + '  ';
            const pos = position || (el.selfClosing ? 'after' : 'inside-end');
            if (pos === 'before') {
                head = ast.text.slice(0, el.start);
                trail = '\n' + indent;
                tail = ast.text.slice(el.start);
            } else if (pos === 'after' || el.selfClosing) {
                head = ast.text.slice(0, el.end);
                lead = '\n' + indent;
                tail = ast.text.slice(el.end);
            } else if (pos === 'inside-start') {
                head = ast.text.slice(0, el.openEnd);
                lead = '\n' + childIndent;
                tail = ast.text.slice(el.openEnd);
            } else {
                const beforeClose = ast.text.slice(el.openEnd, el.closeStart);
                if (beforeClose.indexOf('\n') !== -1) {
                    head = ast.text.slice(0, el.openEnd) + beforeClose.replace(/[ \t]*$/, '');
                    lead = childIndent;
                } else {
                    head = ast.text.slice(0, el.closeStart);
                    lead = '\n' + childIndent;
                }
                trail = '\n' + indent;
                tail = ast.text.slice(el.closeStart);
            }
        }
        const result = head + lead + code + trail + tail;
        const offset = head.length + lead.length;
        const placed = nodeAtOffset(parse(result), offset);
        return { html: result, offset: offset, id: placed ? placed.id : null };
    }

    function insertElement(html, targetId, position, snippet) {
        return insertElementAt(html, targetId, position, snippet).html;
    }

    function wrapElement(html, targetId, tag, attrsObj) {
        const ast = parse(html);
        const el = findById(ast, targetId);
        if (!el) return ast.text;
        const cleanTag = String(tag || 'div').toLowerCase().replace(/[^a-z0-9-]/g, '') || 'div';
        let attrStr = '';
        if (attrsObj && typeof attrsObj === 'object') {
            Object.keys(attrsObj).forEach((k) => {
                if (attrsObj[k] != null && attrsObj[k] !== '') {
                    attrStr += ' ' + k + '="' + escapeAttr(attrsObj[k]) + '"';
                }
            });
        }
        const targetCode = ast.text.slice(el.start, el.end);
        const wrapped = '<' + cleanTag + attrStr + '>' + targetCode + '</' + cleanTag + '>';
        return ast.text.slice(0, el.start) + wrapped + ast.text.slice(el.end);
    }

    function removeElement(html, targetId) {
        const ast = parse(html);
        const el = findById(ast, targetId);
        if (!el || el.tag === 'html' || el.tag === 'body') return ast.text;
        let from = el.start;
        let to = el.end;
        const lineStart = ast.text.lastIndexOf('\n', from - 1);
        if (lineStart !== -1 && /^[ \t]*$/.test(ast.text.slice(lineStart + 1, from))) {
            if (ast.text[to] === '\n') {
                from = lineStart + 1;
                to = to + 1;
            } else if (ast.text.slice(to, to + 2) === '\r\n') {
                from = lineStart + 1;
                to = to + 2;
            }
        }
        return ast.text.slice(0, from) + ast.text.slice(to);
    }

    function duplicateElement(html, targetId) {
        const ast = parse(html);
        const el = findById(ast, targetId);
        if (!el || el.tag === 'html' || el.tag === 'body' || el.tag === 'head') {
            return { html: ast.text, newId: null };
        }
        const indent = lineIndentAt(ast.text, el.start);
        let cloneCode = ast.text.slice(el.start, el.end);
        if (el.attrs && el.attrs.id) {
            cloneCode = cloneCode.replace(
                new RegExp('(\\bid\\s*=\\s*["\'])' + el.attrs.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(["\'])', 'i'),
                '$1' + el.attrs.id + '-copy$2'
            );
        }
        const insertOffset = el.end + 1 + indent.length;
        const nextHtml = ast.text.slice(0, el.end) + '\n' + indent + cloneCode + ast.text.slice(el.end);
        const nextAst = parse(nextHtml);
        const cloned = nextAst.elements.find((n) => n.start === insertOffset) || nodeAtOffset(nextAst, insertOffset);
        return { html: nextHtml, newId: cloned ? cloned.id : el.id };
    }

    function isAncestor(ast, maybeAncestorId, nodeId) {
        let cur = findById(ast, nodeId);
        while (cur && cur.parentId) {
            if (cur.parentId === maybeAncestorId) return true;
            cur = findById(ast, cur.parentId);
        }
        return false;
    }

    function moveElement(html, targetId, dirOrDestId, position) {
        const ast = parse(html);
        const el = findById(ast, targetId);
        if (!el || el.tag === 'html' || el.tag === 'body' || el.tag === 'head') {
            return { html: ast.text, newId: targetId, moved: false };
        }

        if (dirOrDestId === 'up' || dirOrDestId === 'down' || dirOrDestId === -1 || dirOrDestId === 1) {
            const parent = findById(ast, el.parentId);
            if (!parent || !parent.children) return { html: ast.text, newId: el.id, moved: false };
            const siblings = parent.children.filter((c) => c.type === 'element');
            const idx = siblings.findIndex((c) => c.id === el.id);
            if (idx === -1) return { html: ast.text, newId: el.id, moved: false };
            const movingUp = dirOrDestId === 'up' || dirOrDestId === -1;
            const swapIdx = movingUp ? idx - 1 : idx + 1;
            if (swapIdx < 0 || swapIdx >= siblings.length) return { html: ast.text, newId: el.id, moved: false };
            const other = siblings[swapIdx];
            const first = el.start < other.start ? el : other;
            const second = el.start < other.start ? other : el;
            const firstSlice = ast.text.slice(first.start, first.end);
            const secondSlice = ast.text.slice(second.start, second.end);
            const between = ast.text.slice(first.end, second.start);
            const nextHtml = ast.text.slice(0, first.start) +
                secondSlice +
                between +
                firstSlice +
                ast.text.slice(second.end);
            const newStart = movingUp ? first.start : (first.start + secondSlice.length + between.length);
            const nextAst = parse(nextHtml);
            const movedNode = nextAst.elements.find((n) => n.start === newStart) || nodeAtOffset(nextAst, newStart);
            return { html: nextHtml, newId: movedNode ? movedNode.id : el.id, moved: true };
        }

        const dest = findById(ast, dirOrDestId);
        if (!dest || dest.id === el.id || isAncestor(ast, el.id, dest.id)) {
            return { html: ast.text, newId: el.id, moved: false };
        }
        if (isAncestor(ast, dest.id, el.id)) {
            return { html: ast.text, newId: el.id, moved: false };
        }

        const pos = position === 'before' ? 'before' : 'after';
        const snippet = ast.text.slice(el.start, el.end);
        const destIndent = lineIndentAt(ast.text, dest.start);

        let remFrom = el.start;
        let remTo = el.end;
        const lineStart = ast.text.lastIndexOf('\n', remFrom - 1);
        if (lineStart !== -1 && /^[ \t]*$/.test(ast.text.slice(lineStart + 1, remFrom))) {
            if (ast.text[remTo] === '\n') {
                remFrom = lineStart + 1;
                remTo = remTo + 1;
            } else if (ast.text.slice(remTo, remTo + 2) === '\r\n') {
                remFrom = lineStart + 1;
                remTo = remTo + 2;
            }
        }

        const insAt = pos === 'before' ? dest.start : dest.end;
        const insText = pos === 'before'
            ? (snippet + '\n' + destIndent)
            : ('\n' + destIndent + snippet);
        const snippetOffsetInIns = pos === 'before' ? 0 : (1 + destIndent.length);

        let nextHtml;
        let newStart;
        if (remTo <= insAt) {
            nextHtml = ast.text.slice(0, remFrom) +
                ast.text.slice(remTo, insAt) +
                insText +
                ast.text.slice(insAt);
            newStart = insAt - (remTo - remFrom) + snippetOffsetInIns;
        } else if (insAt <= remFrom) {
            nextHtml = ast.text.slice(0, insAt) +
                insText +
                ast.text.slice(insAt, remFrom) +
                ast.text.slice(remTo);
            newStart = insAt + snippetOffsetInIns;
        } else {
            return { html: ast.text, newId: el.id, moved: false };
        }

        const nextAst = parse(nextHtml);
        const movedNode = nextAst.elements.find((n) => n.start === newStart) || nodeAtOffset(nextAst, newStart);
        return { html: nextHtml, newId: movedNode ? movedNode.id : el.id, moved: true };
    }

    function extractTitle(html) {
        const text = String(html || '');
        const titleMatch = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        if (titleMatch && titleMatch[1].trim()) {
            return titleMatch[1].replace(/\s+/g, ' ').trim().slice(0, 80);
        }
        const h1Match = text.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
        if (h1Match) {
            const stripped = h1Match[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
            if (stripped) return stripped.slice(0, 80);
        }
        return 'Untitled Page';
    }

    function setTitle(html, newTitle) {
        const text = String(html || '');
        const clean = escapeHtml(String(newTitle || 'Untitled Page').trim() || 'Untitled Page');
        if (/<title[^>]*>[\s\S]*?<\/title>/i.test(text)) {
            return text.replace(/(<title[^>]*>)[\s\S]*?(<\/title>)/i, '$1' + clean + '$2');
        }
        if (/<head[^>]*>/i.test(text)) {
            return text.replace(/(<head[^>]*>)/i, '$1\n  <title>' + clean + '</title>');
        }
        return '<title>' + clean + '</title>\n' + text;
    }

    return {
        VOID_TAGS: VOID_TAGS,
        parse: parse,
        findById: findById,
        nodeAtOffset: nodeAtOffset,
        nodeAtLine: nodeAtLine,
        innerText: innerText,
        stamp: stamp,
        setAttr: setAttr,
        setText: setText,
        setInnerHtml: setInnerHtml,
        insertElement: insertElement,
        insertElementAt: insertElementAt,
        wrapElement: wrapElement,
        removeElement: removeElement,
        duplicateElement: duplicateElement,
        moveElement: moveElement,
        extractTitle: extractTitle,
        setTitle: setTitle,
        escapeHtml: escapeHtml,
        escapeAttr: escapeAttr
    };
});

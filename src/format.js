(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.Format = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const DEFAULT_INDENT = '    ';
    const LINE_LIMIT = 120;

    function normalizeNewlines(text) {
        return String(text == null ? '' : text).replace(/\r\n?/g, '\n');
    }

    function detectIndent(text) {
        const m = /^( +|\t+)\S/m.exec(normalizeNewlines(text));
        if (!m) return DEFAULT_INDENT;
        if (m[1][0] === '\t') return '\t';
        return m[1].length === 2 ? '  ' : DEFAULT_INDENT;
    }

    function mapOutsideStrings(text, fn) {
        let out = '';
        let plain = '';
        for (let i = 0; i < text.length; i++) {
            const c = text[i];
            if (c === '"' || c === "'") {
                let j = i + 1;
                while (j < text.length && text[j] !== c) j += text[j] === '\\' ? 2 : 1;
                out += fn(plain) + text.slice(i, j + 1);
                plain = '';
                i = j;
            } else plain += c;
        }
        return out + fn(plain);
    }

    function squash(text) {
        return mapOutsideStrings(text, (s) => s.replace(/\s+/g, ' ')).trim();
    }

    function cssDeclaration(buf) {
        const text = squash(buf);
        let paren = 0;
        let quote = '';
        for (let i = 0; i < text.length; i++) {
            const c = text[i];
            if (quote) { if (c === '\\') i++; else if (c === quote) quote = ''; continue; }
            if (c === '"' || c === "'") quote = c;
            else if (c === '(') paren++;
            else if (c === ')') paren = Math.max(0, paren - 1);
            else if (c === ':' && !paren) return text.slice(0, i).trim() + ': ' + text.slice(i + 1).trim();
        }
        return text;
    }

    function cssSelector(buf) {
        return mapOutsideStrings(squash(buf), (s) => s.replace(/\s*,\s*/g, ', '));
    }

    function formatCss(text, indent) {
        const unit = indent || DEFAULT_INDENT;
        const s = normalizeNewlines(text);
        const out = [];
        let depth = 0;
        let buf = '';
        let paren = 0;
        let gap = 0;

        function emit(line) {
            if (gap >= 2 && out.length && !/\{$/.test(out[out.length - 1])) out.push('');
            gap = 0;
            out.push(unit.repeat(depth) + line);
        }

        for (let i = 0; i < s.length; i++) {
            const c = s[i];
            if (!buf.trim() && /\s/.test(c)) { if (c === '\n') gap++; continue; }
            if (c === '/' && s[i + 1] === '*') {
                let end = s.indexOf('*/', i + 2);
                end = end === -1 ? s.length : end + 2;
                const comment = s.slice(i, end);
                i = end - 1;
                if (buf.trim()) { buf += comment; continue; }
                const lines = comment.split('\n');
                emit(lines[0]);
                lines.slice(1).forEach((l) => {
                    const t = l.trim();
                    out.push(t[0] === '*' ? unit.repeat(depth) + ' ' + t : l);
                });
                continue;
            }
            if (c === '"' || c === "'") {
                let j = i + 1;
                while (j < s.length && s[j] !== c) j += s[j] === '\\' ? 2 : 1;
                buf += s.slice(i, j + 1);
                i = j;
                continue;
            }
            if (c === '(') paren++;
            else if (c === ')') paren = Math.max(0, paren - 1);
            if (paren) { buf += c; continue; }
            if (c === '{') {
                emit(cssSelector(buf) + ' {');
                depth++;
                buf = '';
            } else if (c === ';') {
                if (buf.trim()) emit(cssDeclaration(buf) + ';');
                buf = '';
            } else if (c === '}') {
                if (buf.trim()) emit(cssDeclaration(buf) + ';');
                depth = Math.max(0, depth - 1);
                emit('}');
                if (!depth) gap = 2;
                buf = '';
            } else buf += c;
        }
        if (buf.trim()) emit(depth ? cssDeclaration(buf) + ';' : squash(buf));
        return out.length ? out.join('\n') + '\n' : '';
    }

    const REGEX_AFTER_WORD = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'delete', 'void', 'throw', 'new', 'instanceof', 'yield', 'await']);

    function formatJsLines(text, indent) {
        const unit = indent || DEFAULT_INDENT;
        const src = normalizeNewlines(text).split('\n');
        const out = [];
        let depth = 0;
        let mode = 'code';
        let quote = '';
        const tpl = [];
        let prev = '';
        let word = '';

        function scan(line) {
            let i = 0;
            while (i < line.length) {
                const c = line[i];
                if (mode === 'block') {
                    const end = line.indexOf('*/', i);
                    if (end === -1) return;
                    mode = 'code';
                    i = end + 2;
                    continue;
                }
                if (mode === 'str') {
                    while (i < line.length && line[i] !== quote) i += line[i] === '\\' ? 2 : 1;
                    if (i > line.length) return;
                    if (i === line.length) { mode = 'code'; quote = ''; return; }
                    mode = 'code';
                    quote = '';
                    i++;
                    prev = '"';
                    continue;
                }
                if (mode === 'tpl') {
                    while (i < line.length && line[i] !== '`' && !(line[i] === '$' && line[i + 1] === '{')) i += line[i] === '\\' ? 2 : 1;
                    if (i >= line.length) return;
                    if (line[i] === '`') { mode = 'code'; i++; prev = '"'; continue; }
                    tpl.push(0);
                    mode = 'code';
                    i += 2;
                    prev = '{';
                    continue;
                }
                if (/\s/.test(c)) { i++; continue; }
                if (/[A-Za-z0-9_$]/.test(c)) {
                    let j = i;
                    while (j < line.length && /[A-Za-z0-9_$]/.test(line[j])) j++;
                    word = line.slice(i, j);
                    prev = 'a';
                    i = j;
                    continue;
                }
                if (c === '/' && line[i + 1] === '/') return;
                if (c === '/' && line[i + 1] === '*') { mode = 'block'; i += 2; continue; }
                if (c === '"' || c === "'") {
                    quote = c;
                    mode = 'str';
                    i++;
                    continue;
                }
                if (c === '`') { mode = 'tpl'; i++; continue; }
                if (c === '/') {
                    const regexOk = prev === '' || '(,=:[!&|?{};+-*%<>~^'.indexOf(prev) !== -1 || (prev === 'a' && REGEX_AFTER_WORD.has(word));
                    if (regexOk) {
                        let j = i + 1;
                        let cls = false;
                        while (j < line.length && (cls || line[j] !== '/')) {
                            if (line[j] === '\\') j++;
                            else if (line[j] === '[') cls = true;
                            else if (line[j] === ']') cls = false;
                            j++;
                        }
                        if (j < line.length) { i = j + 1; prev = '"'; word = ''; continue; }
                    }
                    prev = '/';
                    i++;
                    continue;
                }
                if (c === '{' || c === '(' || c === '[') {
                    if (c === '{' && tpl.length) tpl[tpl.length - 1]++;
                    depth++;
                } else if (c === '}' || c === ')' || c === ']') {
                    if (c === '}' && tpl.length && tpl[tpl.length - 1] === 0) {
                        tpl.pop();
                        mode = 'tpl';
                        i++;
                        continue;
                    }
                    if (c === '}' && tpl.length) tpl[tpl.length - 1]--;
                    depth = Math.max(0, depth - 1);
                }
                prev = c;
                i++;
            }
        }

        src.forEach((line) => {
            const startMode = mode;
            const trimmed = line.trim();
            if (startMode === 'str' || startMode === 'tpl') {
                out.push({ t: line, raw: true });
            } else if (startMode === 'block') {
                out.push({ t: trimmed[0] === '*' ? unit.repeat(depth) + ' ' + trimmed : line, raw: trimmed[0] !== '*' });
            } else if (!trimmed) {
                out.push({ t: '', raw: false });
            } else {
                const lead = /^[}\])]*/.exec(trimmed)[0].length;
                out.push({ t: unit.repeat(Math.max(0, depth - lead)) + trimmed, raw: false });
            }
            scan(line);
        });

        const result = [];
        out.forEach((l) => {
            if (!l.raw) l.t = l.t.replace(/\s+$/, '');
            if (!l.t && !l.raw && (!result.length || !result[result.length - 1].t)) return;
            result.push(l);
        });
        while (result.length && !result[result.length - 1].t && !result[result.length - 1].raw) result.pop();
        return result;
    }

    function formatJs(text, indent) {
        const lines = formatJsLines(text, indent);
        return lines.length ? lines.map((l) => l.t).join('\n') + '\n' : '';
    }

    const BLOCK = new Set(('html head body title meta link base style script div section article aside nav header footer main address ' +
        'h1 h2 h3 h4 h5 h6 p ul ol li dl dt dd table caption colgroup col thead tbody tfoot tr td th form fieldset legend figure figcaption ' +
        'blockquote details summary hr pre noscript dialog menu').split(' '));
    const VOID = new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));
    const CLOSES = {
        li: ['li'], dt: ['dt', 'dd'], dd: ['dt', 'dd'], td: ['td', 'th'], th: ['td', 'th'], tr: ['td', 'th', 'tr'],
        thead: ['thead', 'tbody', 'tfoot', 'tr', 'td', 'th'], tbody: ['thead', 'tbody', 'tfoot', 'tr', 'td', 'th'], tfoot: ['thead', 'tbody', 'tfoot', 'tr', 'td', 'th']
    };
    const CLOSES_P = new Set('address article aside blockquote details div dl fieldset figure footer form h1 h2 h3 h4 h5 h6 header hr main menu nav ol p pre section table ul'.split(' '));

    function tagEnd(text, from) {
        let quote = '';
        for (let i = from; i < text.length; i++) {
            const c = text[i];
            if (quote) { if (c === quote) quote = ''; } else if (c === '"' || c === "'") quote = c;
            else if (c === '>') return i + 1;
        }
        return text.length;
    }

    function formatHtml(text, indent) {
        const unit = indent || DEFAULT_INDENT;
        const s = normalizeNewlines(text);
        const lines = [];
        const stack = [];
        let depth = 0;
        let run = '';

        const pad = () => unit.repeat(depth);
        function flush() {
            const t = run.trim();
            if (t) lines.push(pad() + t);
            run = '';
        }
        function pop(count) {
            flush();
            stack.length -= count;
            depth = stack.length;
        }
        function openBlock(name, tag) {
            flush();
            lines.push(pad() + tag);
            stack.push({ name: name, line: lines.length - 1 });
            depth = stack.length;
        }
        function closeBlock(name, tag) {
            let at = -1;
            for (let i = stack.length - 1; i >= 0; i--) if (stack[i].name === name) { at = i; break; }
            if (at === -1) { flush(); lines.push(pad() + tag); return; }
            while (stack.length - 1 > at) closeBlock(stack[stack.length - 1].name, '');
            const frame = stack[stack.length - 1];
            const inner = run.trim();
            if (frame.line === lines.length - 1 && !/\n/.test(inner)) {
                const joined = lines[frame.line] + inner + tag;
                if (joined.length <= LINE_LIMIT) {
                    lines[frame.line] = joined;
                    run = '';
                    stack.pop();
                    depth = stack.length;
                    return;
                }
            }
            pop(1);
            if (tag) lines.push(pad() + tag);
        }
        function raw(tag, name, from) {
            const m = new RegExp('</' + name + '\\s*>', 'i').exec(s.slice(from));
            const end = m ? from + m.index : s.length;
            return { body: s.slice(from, end), close: m ? m[0] : '', next: m ? end + m[0].length : s.length };
        }
        function emitRaw(tag, name, from) {
            const r = raw(tag, name, from);
            flush();
            const type = (/\btype\s*=\s*["']?([^"'\s>]*)/i.exec(tag) || [])[1] || '';
            const isJs = name === 'script' && (!type || /^(text\/javascript|module|application\/javascript)$/i.test(type));
            if (!r.body.trim()) lines.push(pad() + tag + r.close);
            else if (name === 'style' || isJs) {
                lines.push(pad() + tag);
                const inner = unit.repeat(depth + 1);
                const body = name === 'style' ? formatCss(r.body, unit).split('\n').slice(0, -1).map((t) => ({ t: t, raw: false })) : formatJsLines(r.body, unit);
                body.forEach((l) => lines.push(l.t && !l.raw ? inner + l.t : l.t));
                lines.push(pad() + r.close);
            } else lines.push(pad() + tag + r.body + r.close);
            return r.next;
        }

        let i = 0;
        while (i < s.length) {
            if (s[i] !== '<' || !/[A-Za-z\/!]/.test(s[i + 1] || '')) {
                let j = i + 1;
                while (j < s.length && !(s[j] === '<' && /[A-Za-z\/!]/.test(s[j + 1] || ''))) j++;
                run += s.slice(i, j).replace(/\s+/g, ' ');
                i = j;
                continue;
            }
            if (s.startsWith('<!--', i)) {
                const end = s.indexOf('-->', i + 4);
                const comment = s.slice(i, end === -1 ? s.length : end + 3);
                i += comment.length;
                if (run.trim()) run += comment;
                else lines.push(pad() + comment);
                continue;
            }
            const end = tagEnd(s, i);
            const tag = s.slice(i, end);
            i = end;
            if (tag[1] === '!') { flush(); lines.push(pad() + tag); continue; }
            const closing = tag[1] === '/';
            const name = (/^<\/?([A-Za-z][A-Za-z0-9:-]*)/.exec(tag) || [])[1];
            if (!name) { run += tag; continue; }
            const lower = name.toLowerCase();
            if (closing) {
                if (BLOCK.has(lower)) closeBlock(lower, tag); else run += tag;
                continue;
            }
            if (lower === 'script' || lower === 'style') { i = emitRaw(tag, lower, i); continue; }
            if (lower === 'pre') {
                const r = raw(tag, 'pre', i);
                flush();
                lines.push(pad() + tag + r.body + r.close);
                i = r.next;
                continue;
            }
            if (lower === 'textarea') {
                const r = raw(tag, 'textarea', i);
                run += tag + r.body + r.close;
                i = r.next;
                continue;
            }
            if (!BLOCK.has(lower)) { run += tag; continue; }
            if (CLOSES[lower]) while (stack.length && CLOSES[lower].indexOf(stack[stack.length - 1].name) !== -1) closeBlock(stack[stack.length - 1].name, '');
            if (CLOSES_P.has(lower) && stack.length && stack[stack.length - 1].name === 'p') closeBlock('p', '');
            if (VOID.has(lower) || /\/\s*>$/.test(tag)) { flush(); lines.push(pad() + tag); continue; }
            openBlock(lower, tag);
        }
        flush();
        return lines.length ? lines.join('\n') + '\n' : '';
    }

    function byPath(path, text, options) {
        const unit = (options && options.indent) || DEFAULT_INDENT;
        const ext = (/\.([A-Za-z0-9]+)$/.exec(String(path || '')) || [])[1];
        const kind = { html: 'html', htm: 'html', css: 'css', js: 'js', mjs: 'js' }[String(ext || '').toLowerCase()];
        if (!kind) return null;
        const text2 = kind === 'html' ? formatHtml(text, unit) : (kind === 'css' ? formatCss(text, unit) : formatJs(text, unit));
        return { kind: kind, text: text2 };
    }

    return { formatHtml: formatHtml, formatCss: formatCss, formatJs: formatJs, byPath: byPath, detectIndent: detectIndent };
});

/*
 * MarkdownImport: Markdown and plain-text files turned into new chapters (P5-03, D-039). Import only (D-002): the
 * XHTML is written once and is the source from then on; nothing goes back to Markdown.
 *
 * The Markdown read is the common core of CommonMark: ATX and setext headings, paragraphs and hard breaks, block
 * quotes, ordered and unordered lists (nested by indentation), fenced and indented code, thematic breaks (written as
 * <hr/>, a scene break), emphasis, strong, code spans, links, autolinks, images, backslash escapes, and footnotes
 * ([^label] with a [^label]: definition). Raw HTML is not passed through: it is escaped and shows as text, so the
 * output is always well-formed and safe. Links keep only http, https, mailto, and in-page # targets. Each top-level
 * '#' heading starts a chapter; plain text has paragraphs at blank lines (or one per line when there are none).
 * Footnotes become Scribe notes (BookNotes, D-034), images become figures or inline images when the book has an
 * image of that file name (BookBlocks, D-035), and smart punctuation is applied outside code.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./xml-ast.js'), require('./book.js'), require('./book-chapters.js'), require('./book-notes.js'), require('./book-blocks.js'));
    else root.MarkdownImport = factory(root.XmlAst, root.Book, root.BookChapters, root.BookNotes, root.BookBlocks);
})(typeof self !== 'undefined' ? self : this, function (XmlAst, Book, BookChapters, BookNotes, BookBlocks) {
    'use strict';

    // Private-use characters mark a footnote reference in the text until the note is attached (never in output).
    const MARK_OPEN = '', MARK_CLOSE = '';
    const esc = (s) => XmlAst.escapeText(s);
    const attr = (s) => XmlAst.escapeAttr(s);

    // Straight quotes, double hyphens, and three dots, typeset.
    function smart(text) {
        return text
            .replace(/\.\.\./g, '…')
            .replace(/(^|[^-])---(?!-)/g, '$1—')
            .replace(/(^|[^-])--(?!-)/g, '$1–')
            .replace(/(^|[\s([{—–-])"/g, '$1“').replace(/"/g, '”')
            .replace(/(\w)'(\w)/g, '$1’$2')
            .replace(/(^|[\s([{—–-])'/g, '$1‘').replace(/'/g, '’');
    }

    // ---- Inline ----

    function safeHref(href) {
        const h = href.trim();
        return /^(https?:|mailto:)/i.test(h) || /^#[\w.-]*$/.test(h) ? h : null;
    }

    // Inline Markdown to XHTML. ctx: { smart, image(src, alt) -> { href } | null, missing: [], footnotes: Set }.
    // before: the character before `src` in its paragraph, so smart quotes open or close correctly across markup.
    function inline(src, ctx, before) {
        let out = '', text = '', i = 0, textStart = 0;
        const prevOf = (k) => (k > 0 ? src[k - 1] : (before || ' '));
        const flush = () => {
            // The character before the run decides whether a leading quote opens or closes.
            if (text) out += esc(ctx.smart ? smart(prevOf(textStart) + text).slice(1) : text);
            text = '';
        };
        const add = (s) => { if (!text) textStart = i; text += s; };
        while (i < src.length) {
            const ch = src[i], rest = src.slice(i);
            let m;
            if (ch === '\\' && i + 1 < src.length && /[!-\/:-@[-`{-~]/.test(src[i + 1])) { add(src[i + 1]); i += 2; continue; }
            if (ch === '\\' && src[i + 1] === '\n') { flush(); out += '<br/>'; i += 2; continue; }
            if (ch === '\n') {
                // Two trailing spaces make a hard break; otherwise a line break is a space.
                if (/ {2,}$/.test(text)) { text = text.replace(/ +$/, ''); flush(); out += '<br/>'; } else { const t = text.replace(/ +$/, ''); text = ''; add(t + ' '); if (t) textStart = i - t.length; }
                i++;
                while (src[i] === ' ') i++;
                continue;
            }
            if (ch === '`' && (m = /^(`+)([\s\S]*?[^`])\1(?!`)/.exec(rest))) {
                flush();
                out += '<code>' + esc(m[2].replace(/\n/g, ' ').replace(/^ (.*) $/, '$1')) + '</code>';
                i += m[0].length;
                continue;
            }
            if (ch === '[' && (m = /^\[\^([^\]\s]+)\]/.exec(rest)) && ctx.footnotes.has(m[1])) {
                flush();
                out += MARK_OPEN + m[1] + MARK_CLOSE;
                i += m[0].length;
                continue;
            }
            if (ch === '!' && (m = /^!\[([^\]]*)\]\(\s*<?((?:[^()\s>]|\([^()\s]*\))*)>?(?:\s+"[^"]*")?\s*\)/.exec(rest))) {
                flush();
                const hit = ctx.image(m[2], m[1]);
                if (hit) out += '<img src="' + attr(hit.href) + '" alt="' + attr(m[1]) + '"/>';
                else { ctx.missing.push(m[2]); out += esc('[' + (m[1] || m[2]) + ']'); }
                i += m[0].length;
                continue;
            }
            if (ch === '[' && (m = /^\[((?:[^\[\]]|\[[^\]]*\])*)\]\(\s*<?((?:[^()\s>]|\([^()\s]*\))*)>?(?:\s+"([^"]*)")?\s*\)/.exec(rest))) {
                flush();
                const href = safeHref(m[2]), label = inline(m[1], ctx, prevOf(i));
                out += href ? '<a href="' + attr(href) + '"' + (m[3] ? ' title="' + attr(m[3]) + '"' : '') + '>' + label + '</a>' : label;
                i += m[0].length;
                continue;
            }
            if (ch === '<' && (m = /^<((?:https?:\/\/|mailto:)[^\s<>]+)>/i.exec(rest))) {
                flush();
                out += '<a href="' + attr(m[1]) + '">' + esc(m[1].replace(/^mailto:/i, '')) + '</a>';
                i += m[0].length;
                continue;
            }
            if ((ch === '*' || ch === '_') && (m = emphasisAt(src, i))) {
                flush();
                out += '<' + m.tag + '>' + inline(m.inner, ctx, prevOf(i)) + '</' + m.tag + '>';
                i = m.end;
                continue;
            }
            add(ch);
            i++;
        }
        flush();
        return out;
    }

    // Strong or emphasis starting at i: a run of * or _ that opens (not followed by space) and a matching run that
    // closes (not preceded by space). Underscores inside words do not count (snake_case stays as it is).
    function emphasisAt(src, i) {
        const ch = src[i];
        const run = src[i + 1] === ch ? (src[i + 2] === ch ? 3 : 2) : 1;
        if (ch === '_' && i > 0 && /\w/.test(src[i - 1])) return null;
        if (!src[i + run] || /\s/.test(src[i + run])) return null;
        const delim = ch.repeat(run);
        for (let j = i + run + 1; j <= src.length - run; j++) {
            if (src[j] === '`') { const close = src.indexOf('`', j + 1); if (close !== -1) { j = close; continue; } }
            if (src.substr(j, run) === delim && !/\s/.test(src[j - 1]) && src[j + run] !== ch && (ch !== '_' || !/\w/.test(src[j + run] || ''))) {
                const inner = src.slice(i + run, j);
                if (run === 3) return { tag: 'strong', inner: ch + inner + ch, end: j + run };
                return { tag: run === 2 ? 'strong' : 'em', inner: inner, end: j + run };
            }
        }
        return null;
    }

    // ---- Blocks ----

    const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([^`]*)$/;
    const HR = /^ {0,3}((\*\s*){3,}|(-\s*){3,}|(_\s*){3,})$/;
    const ATX = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
    const LIST = /^( {0,3})([-*+]|\d{1,9}[.)])( +|$)/;
    const QUOTE = /^ {0,3}> ?/;
    const FOOTNOTE = /^ {0,3}\[\^([^\]\s]+)\]:[ \t]*(.*)$/;

    // Lines to blocks: [{ type, ... }]. Footnote definitions are collected into `notes`.
    function blocks(lines, notes) {
        const out = [];
        let i = 0;
        const blank = (l) => !l || !l.trim();
        while (i < lines.length) {
            const line = lines[i];
            let m;
            if (blank(line)) { i++; continue; }
            if ((m = FENCE.exec(line))) {
                const fence = m[1], body = [];
                i++;
                while (i < lines.length && !new RegExp('^ {0,3}' + fence[0] + '{' + fence.length + ',}\\s*$').test(lines[i])) body.push(lines[i++]);
                i++;
                out.push({ type: 'code', text: body.join('\n') });
                continue;
            }
            if ((m = FOOTNOTE.exec(line))) {
                const body = [m[2]];
                i++;
                while (i < lines.length && (blank(lines[i]) ? (lines[i + 1] && /^( {4}|\t)/.test(lines[i + 1])) : /^( {4}|\t)/.test(lines[i]))) body.push(lines[i++].replace(/^( {4}|\t)/, ''));
                notes[m[1]] = body.join('\n').trim();
                continue;
            }
            if ((m = ATX.exec(line))) { out.push({ type: 'heading', level: m[1].length, text: (m[2] || '').trim() }); i++; continue; }
            if (HR.test(line)) { out.push({ type: 'hr' }); i++; continue; }
            if (/^( {4}|\t)/.test(line)) {
                const body = [];
                while (i < lines.length && (/^( {4}|\t)/.test(lines[i]) || (blank(lines[i]) && lines[i + 1] && /^( {4}|\t)/.test(lines[i + 1])))) body.push(lines[i++].replace(/^( {4}|\t)/, ''));
                out.push({ type: 'code', text: body.join('\n') });
                continue;
            }
            if (QUOTE.test(line)) {
                const body = [];
                while (i < lines.length && !blank(lines[i]) && (QUOTE.test(lines[i]) || !startsBlock(lines[i]))) body.push(lines[i++].replace(QUOTE, ''));
                out.push({ type: 'quote', children: blocks(body, notes) });
                continue;
            }
            if ((m = LIST.exec(line))) {
                const ordered = /\d/.test(m[2]);
                const items = [];
                const start = ordered ? parseInt(m[2], 10) : 1;
                let loose = false;
                while (i < lines.length && (m = LIST.exec(lines[i])) && /\d/.test(m[2]) === ordered) {
                    const indent = m[0].length || m[1].length + m[2].length + 1;
                    const body = [lines[i].slice(m[0].length)];
                    i++;
                    while (i < lines.length) {
                        const l = lines[i];
                        if (blank(l)) {
                            if (lines[i + 1] && /^\s+/.test(lines[i + 1]) && lines[i + 1].search(/\S/) >= indent) { body.push(''); loose = true; i++; continue; }
                            break;
                        }
                        if (l.search(/\S/) >= indent) { body.push(l.slice(indent)); i++; continue; }
                        if (LIST.exec(l) || startsBlock(l)) break;
                        body.push(l.trim());
                        i++;
                    }
                    items.push(blocks(body, notes));
                    // A blank line before another item of the same list makes the list loose.
                    const sameNext = (l) => { const n = l && LIST.exec(l); return !!n && /\d/.test(n[2]) === ordered; };
                    while (i < lines.length && blank(lines[i]) && sameNext(lines[i + 1])) { loose = true; i++; }
                }
                out.push({ type: 'list', ordered: ordered, start: start, items: items, loose: loose });
                continue;
            }
            const para = [line];
            i++;
            while (i < lines.length && !blank(lines[i]) && !startsBlock(lines[i], true)) {
                // A setext underline turns the paragraph into a heading.
                if (/^ {0,3}=+\s*$/.test(lines[i]) || /^ {0,3}-+\s*$/.test(lines[i])) break;
                para.push(lines[i++]);
            }
            if (i < lines.length && /^ {0,3}=+\s*$/.test(lines[i])) { out.push({ type: 'heading', level: 1, text: para.join(' ').trim() }); i++; continue; }
            if (i < lines.length && /^ {0,3}-+\s*$/.test(lines[i])) { out.push({ type: 'heading', level: 2, text: para.join(' ').trim() }); i++; continue; }
            out.push({ type: 'para', text: para.join('\n').trim() });
        }
        return out;
    }

    // inParagraph: an ordered list interrupts a paragraph only when it starts at 1 (CommonMark 0.31, 5.3), so a line
    // such as "2020. A year" stays text.
    function startsBlock(line, inParagraph) {
        const list = LIST.exec(line);
        const listStarts = list && (!inParagraph || !/\d/.test(list[2]) || /^1[.)]$/.test(list[2]));
        return FENCE.test(line) || ATX.test(line) || HR.test(line) || QUOTE.test(line) || !!listStarts || FOOTNOTE.test(line);
    }

    // Blocks to XHTML lines, at a two-space indent per level.
    function render(list, ctx, pad) {
        const p = pad || '';
        const out = [];
        list.forEach((b) => {
            if (b.type === 'heading') out.push(p + '<h' + b.level + '>' + inline(b.text, ctx) + '</h' + b.level + '>');
            else if (b.type === 'hr') out.push(p + '<hr/>');
            else if (b.type === 'code') out.push(p + '<pre><code>' + esc(b.text) + '</code></pre>');
            else if (b.type === 'quote') out.push(p + '<blockquote>', ...render(b.children, ctx, p + '  '), p + '</blockquote>');
            else if (b.type === 'list') {
                const tag = b.ordered ? 'ol' : 'ul';
                out.push(p + '<' + tag + (b.ordered && b.start !== 1 ? ' start="' + b.start + '"' : '') + '>');
                b.items.forEach((item) => {
                    // A tight item (one paragraph) is written without its <p>.
                    // In a tight list (no blank lines) an item's paragraphs are written without <p> (CommonMark 5.3).
                    const bare = (b2) => !b.loose && b2.type === 'para';
                    if (item.length === 1 && bare(item[0])) out.push(p + '  <li>' + inline(item[0].text, ctx) + '</li>');
                    else if (!item.length) out.push(p + '  <li></li>');
                    else if (bare(item[0])) out.push(p + '  <li>' + inline(item[0].text, ctx), ...render(item.slice(1), ctx, p + '    '), p + '  </li>');
                    else out.push(p + '  <li>', ...render(item, ctx, p + '    '), p + '  </li>');
                });
                out.push(p + '</' + tag + '>');
            } else if (b.type === 'para') {
                // An image alone in a paragraph is a figure; its alt text is the description.
                const solo = /^!\[([^\]]*)\]\(\s*<?((?:[^()\s>]|\([^()\s]*\))*)>?(?:\s+"([^"]*)")?\s*\)$/.exec(b.text);
                const hit = solo ? ctx.image(solo[2], solo[1]) : null;
                if (hit) out.push(...BookBlocks.figure(hit.href, solo[1], solo[3] || '').split('\n').map((l) => p + l));
                else out.push(p + '<p>' + inline(b.text, ctx) + '</p>');
            }
        });
        return out;
    }

    // ---- Files to chapters ----

    const titleFromName = (name) => {
        const stem = String(name || 'Imported text').split('/').pop().replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim() || 'Imported text';
        return stem.charAt(0).toUpperCase() + stem.slice(1);
    };
    // A heading's text without Markdown, for a chapter title.
    const plain = (md) => md.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\[\^[^\]]+\]/g, '').replace(/[*_`]+/g, '').replace(/\\(.)/g, '$1').trim();

    // A file's text as [{ title, blocks }], plus its footnote definitions.
    function split(name, text, markdown) {
        const lines = String(text || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
        const notes = {};
        if (!markdown) {
            const hasBlank = lines.some((l, k) => !l.trim() && k > 0 && k < lines.length - 1);
            const paras = hasBlank ? lines.join('\n').split(/\n[ \t]*\n/).map((s) => s.trim()).filter(Boolean) : lines.map((l) => l.trim()).filter(Boolean);
            return { chapters: [{ title: titleFromName(name), blocks: paras.map((t) => ({ type: 'text', text: t.replace(/\s*\n\s*/g, ' ') })) }], notes: notes };
        }
        const all = blocks(lines, notes);
        const chapters = [];
        let current = null;
        all.forEach((b) => {
            if (b.type === 'heading' && b.level === 1) { current = { title: plain(b.text) || titleFromName(name), blocks: [] }; chapters.push(current); return; }
            if (!current) { current = { title: titleFromName(name), blocks: [] }; chapters.push(current); }
            current.blocks.push(b);
        });
        if (!chapters.length) chapters.push({ title: titleFromName(name), blocks: [] });
        return { chapters: chapters, notes: notes };
    }

    // Imports files ([{ name, text }]; .md and .markdown are Markdown, others plain text) as chapters after chapter
    // `after`. options: { assets, notes: 'footnotes' | 'endnotes', smart }. Returns { entries, added, missing }.
    function importInto(entries, files, after, options) {
        const o = Object.assign({ smart: true, notes: 'footnotes' }, options || {});
        const assets = o.assets || [];
        const images = Array.from(new Set(Object.keys(entries).concat(assets))).filter((p) => BookBlocks.mediaTypeFor(p));
        let next = entries, prev = after, used = new Set();
        const added = [], missing = [], pending = [];
        (files || []).forEach((file) => {
            const markdown = /\.(md|markdown|mdown|mkd)$/i.test(file.name);
            const parsed = split(file.name, file.text, markdown);
            parsed.chapters.forEach((ch) => {
                const made = BookChapters.add(next, ch.title, prev);
                next = made.entries;
                prev = made.path;
                added.push(made.path);
                const ctx = {
                    smart: o.smart, missing: missing, footnotes: new Set(Object.keys(parsed.notes)),
                    image: (src, alt) => {
                        const base = decodeURIComponent(String(src).split(/[?#]/)[0].split('/').pop() || '').toLowerCase();
                        const hit = base && images.find((p) => p.split('/').pop().toLowerCase() === base);
                        if (!hit) return null;
                        used.add(hit);
                        return { href: Book.hrefFor(made.path, hit) };
                    }
                };
                const lines = ch.blocks.map((b) => (b.type === 'text' ? [{ type: 'para', text: b.text.replace(/[\\`*_\[\]!<]/g, '\\$&') }] : [b])).reduce((a, b) => a.concat(b), []);
                const markup = render(lines, ctx, '').join('\n');
                if (markup) {
                    const ast = XmlAst.parse(next[made.path]);
                    const h1 = ast.elements.find((e) => e.local === 'h1');
                    const empty = ast.elements.find((e) => e.local === 'p' && e.start > h1.end);
                    next = Object.assign({}, next, { [made.path]: XmlAst.applyEdits(next[made.path], XmlAst.insert(ast, h1, 'after', markup).concat(XmlAst.remove(ast, empty))) });
                }
                if (markup.indexOf(MARK_OPEN) !== -1) pending.push({ path: made.path, notes: parsed.notes });
            });
        });
        used.forEach((img) => { next = BookBlocks.listImage(next, img, assets); });
        // Footnote references: each marker is removed and a Scribe note attached at its place, then all are numbered.
        pending.forEach((job) => {
            for (;;) {
                const t = next[job.path];
                const at = t.indexOf(MARK_OPEN);
                if (at === -1) break;
                const end = t.indexOf(MARK_CLOSE, at);
                const label = t.slice(at + 1, end);
                next = Object.assign({}, next, { [job.path]: t.slice(0, at) + t.slice(end + 1) });
                const noteText = plain(job.notes[label] || '') || label;
                next = BookNotes.insertAt(next, job.path, at, o.smart ? smart(noteText) : noteText, o.notes, { renumber: false }).entries;
            }
        });
        if (pending.length) next = BookNotes.renumber(next, o.notes);
        return { entries: next, added: added, missing: Array.from(new Set(missing)) };
    }

    return { smart: smart, inline: inline, split: split, importInto: importInto, toXhtml: (md, ctx) => render(blocks(String(md).replace(/\r\n?/g, '\n').split('\n'), {}), Object.assign({ smart: false, missing: [], footnotes: new Set(), image: () => null }, ctx || {}), '').join('\n') };
});

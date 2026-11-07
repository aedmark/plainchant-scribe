/*
 * Docx: reads a Word .docx (ECMA-376 Office Open XML, WordprocessingML) into blocks for import (P7-03, D-048).
 * Pure, no DOM. The archive is untrusted: Epub.unzip checks it as it does an .epub (D-038).
 *
 * Kept: headings (style "heading N", or an outline level), paragraphs, bold, italic, small caps, strikethrough,
 * superscript and subscript (direct, or the Strong and Emphasis character styles), line breaks, links to http,
 * https, and mailto, footnote and endnote references with their text, lists nested by level (numbering.xml says
 * bullet or numbered, from the paragraph or its style), tables (header rows and column spans), images (PNG, JPEG, and
 * GIF, checked by their bytes) with Word's alt text and a following Caption paragraph, block quotes (the Quote,
 * Intense Quote, and Block Text styles, and LibreOffice's Block Quotation), and scene breaks (a paragraph of only *, #, or ornaments). Fonts, sizes,
 * colours, spacing, and alignment are dropped (the Layout tab sets those), as are comments, deletions in tracked
 * changes, field codes (their results are kept), text boxes, and other drawings. Text is escaped, so the output is
 * always well-formed.
 *
 * Inline HTML can carry two tokens for the importer: a note reference (NOTE_OPEN kind:id NOTE_CLOSE) and an image
 * source (IMG_OPEN key IMG_CLOSE). Both use private-use characters, which Word text never contains here: they are
 * removed from the text first.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./xml-ast.js'), require('./epub.js'));
    else root.Docx = factory(root.XmlAst, root.Epub);
}(typeof self !== 'undefined' ? self : this, function (XmlAst, Epub) {
    'use strict';

    const W = ['http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'http://purl.oclc.org/ooxml/wordprocessingml/main'];
    const R = ['http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'http://purl.oclc.org/ooxml/officeDocument/relationships'];
    const A = ['http://schemas.openxmlformats.org/drawingml/2006/main', 'http://purl.oclc.org/ooxml/drawingml/main'];
    const WP = ['http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing', 'http://purl.oclc.org/ooxml/drawingml/wordprocessingDrawing'];
    const MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006';
    const VML = 'urn:schemas-microsoft-com:vml';
    const NOTE_OPEN = '', NOTE_CLOSE = '', IMG_OPEN = '', IMG_CLOSE = '';
    const PRIVATE = /[-]/g;
    const SAFE_HREF = /^(https?:\/\/|mailto:)/i;

    const esc = (s) => XmlAst.escapeText(s);
    const attr = (s) => XmlAst.escapeAttr(s);
    const isW = (el, local) => el && el.type === 'element' && el.local === local && W.indexOf(el.ns) !== -1;
    const kids = (el) => (el && el.children ? el.children.filter((c) => c.type === 'element') : []);
    const kid = (el, local) => kids(el).find((c) => isW(c, local)) || null;
    const wAttr = (el, name) => { if (!el) return null; const a = (el.attrs || []).find((x) => x.local === name && (W.indexOf(x.ns) !== -1 || x.ns == null)); return a ? a.value : null; };
    const rAttr = (el, name) => { const a = (el.attrs || []).find((x) => x.local === name && R.indexOf(x.ns) !== -1); return a ? a.value : null; };
    // A toggle property (ECMA-376 §17.7.3): present means on, unless w:val is 0, false, or off.
    const on = (el) => !!el && ['0', 'false', 'off'].indexOf(String(wAttr(el, 'val') || '').toLowerCase()) === -1;

    function fail(code, message) { const e = new Error(message); e.code = code; return e; }

    function parseXml(raw, name, required) {
        if (!raw) { if (required) throw fail('not-docx', 'This is not a Word document: it has no ' + name + '.'); return null; }
        let text;
        try { text = Epub.decodeText(raw); } catch (e) { throw fail('not-docx', name + ' is not UTF-8 or UTF-16 text.'); }
        const ast = XmlAst.parse(text);
        if (!ast.wellFormed) { if (required) throw fail('damaged', 'The Word document is damaged: ' + name + ' is not well-formed XML.'); return null; }
        return ast;
    }

    // A part's relationships: { id: { type, target (a path in the package, or the URL when external), external } }.
    function rels(raw, partPath) {
        const dir = partPath.slice(0, partPath.lastIndexOf('/') + 1);
        const relsPath = dir + '_rels/' + partPath.slice(dir.length) + '.rels';
        const ast = parseXml(raw[relsPath], relsPath, false);
        const out = {};
        if (!ast) return out;
        ast.elements.filter((e) => e.local === 'Relationship').forEach((e) => {
            const id = XmlAst.getAttr(e, 'Id'), target = XmlAst.getAttr(e, 'Target') || '', external = XmlAst.getAttr(e, 'TargetMode') === 'External';
            if (!id) return;
            out[id] = { type: XmlAst.getAttr(e, 'Type') || '', target: external ? target : resolve(dir, target), external: external };
        });
        return out;
    }

    // A relative target in the package, or null when it leaves it.
    function resolve(dir, target) {
        const parts = (target.charAt(0) === '/' ? target.slice(1) : dir + target).split('/');
        const out = [];
        for (const p of parts) {
            if (p === '..') { if (!out.length) return null; out.pop(); } else if (p && p !== '.') out.push(p);
        }
        try { return out.map(decodeURIComponent).join('/'); } catch (e) { return null; }
    }

    const relOf = (map, suffix) => Object.keys(map).map((k) => map[k]).find((r) => !r.external && r.type.split('/').pop() === suffix) || null;

    // Styles: { id: { name, type, basedOn, pPr, rPr } }, and the document's default language.
    function readStyles(ast) {
        const styles = {};
        let language = '';
        if (!ast) return { styles: styles, language: language };
        ast.elements.filter((e) => isW(e, 'style')).forEach((s) => {
            const id = wAttr(s, 'styleId');
            if (!id) return;
            const name = kid(s, 'name'), based = kid(s, 'basedOn');
            styles[id] = { name: name ? String(wAttr(name, 'val') || '').toLowerCase() : id.toLowerCase(), type: wAttr(s, 'type'), basedOn: based ? wAttr(based, 'val') : null, pPr: kid(s, 'pPr'), rPr: kid(s, 'rPr') };
        });
        const defaults = ast.elements.find((e) => isW(e, 'rPrDefault'));
        const lang = defaults && ast.elements.find((e) => isW(e, 'lang') && e.start > defaults.start && e.end <= defaults.end);
        if (lang) language = wAttr(lang, 'val') || '';
        return { styles: styles, language: language };
    }

    // numId -> ilvl -> ordered (true) or bullet (false).
    function readNumbering(ast) {
        const abstract = {}, nums = {};
        if (!ast) return nums;
        ast.elements.filter((e) => isW(e, 'abstractNum')).forEach((a) => {
            const levels = {};
            kids(a).filter((l) => isW(l, 'lvl')).forEach((l) => { const f = kid(l, 'numFmt'); levels[wAttr(l, 'ilvl') || '0'] = !!f && ['bullet', 'none'].indexOf(wAttr(f, 'val')) === -1; });
            abstract[wAttr(a, 'abstractNumId')] = levels;
        });
        ast.elements.filter((e) => isW(e, 'num')).forEach((n) => { const ref = kid(n, 'abstractNumId'); nums[wAttr(n, 'numId')] = ref ? abstract[wAttr(ref, 'val')] || {} : {}; });
        return nums;
    }

    // A style's property, looked up through basedOn (at most 10 deep, so a loop in a hostile file stops).
    function inherited(styles, id, pick) {
        for (let i = 0, s = styles[id]; s && i < 10; i++, s = styles[s.basedOn]) { const v = pick(s); if (v != null) return v; }
        return null;
    }

    function noteTexts(ast, local) {
        const out = {};
        if (!ast) return out;
        ast.elements.filter((e) => isW(e, local)).forEach((n) => {
            if (['separator', 'continuationSeparator', 'continuationNotice'].indexOf(wAttr(n, 'type')) !== -1) return;
            const paras = kids(n).filter((p) => isW(p, 'p')).map((p) => p.children ? textOf(p) : '').map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean);
            out[wAttr(n, 'id')] = paras.join(' ').replace(PRIVATE, '');
        });
        return out;
    }

    // The visible text of a paragraph: w:t, tabs, and breaks, skipping deletions and field instructions.
    function textOf(el) {
        let s = '';
        (el.children || []).forEach((c) => {
            if (c.type !== 'element') return;
            if (isW(c, 't')) s += XmlAst.textContent(c);
            else if (isW(c, 'tab') || isW(c, 'br') || isW(c, 'cr')) s += ' ';
            else if (isW(c, 'noBreakHyphen')) s += '‑';
            else if (!isW(c, 'del') && !isW(c, 'moveFrom') && !isW(c, 'instrText') && !isW(c, 'delText') && !(c.local === 'Fallback' && c.ns === MC)) s += textOf(c);
        });
        return s;
    }

    function sniff(bytes) {
        if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return 'png';
        if (bytes.length > 3 && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return 'jpg';
        if (bytes.length > 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return 'gif';
        return null;
    }

    // Reads a .docx's bytes: { title, creator, language, blocks, notes: { footnote, endnote }, images, skipped }.
    async function read(bytes, options) {
        const raw = (await Epub.unzip(bytes, { kind: 'docx', limits: options && options.limits })).raw;
        const pkg = rels(raw, '');
        const main = Object.keys(pkg).map((k) => pkg[k]).find((r) => /\/officeDocument$/.test(r.type) && !r.external);
        const mainPath = main && main.target ? main.target : 'word/document.xml';
        const doc = parseXml(raw[mainPath], mainPath, true);
        const docRels = rels(raw, mainPath);
        const part = (suffix) => { const r = relOf(docRels, suffix); return r && r.target ? parseXml(raw[r.target], r.target, false) : null; };
        const st = readStyles(part('styles'));
        const numbering = readNumbering(part('numbering'));
        const notes = { footnote: noteTexts(part('footnotes'), 'footnote'), endnote: noteTexts(part('endnotes'), 'endnote') };
        const core = parseXml(raw['docProps/core.xml'], 'docProps/core.xml', false);
        const coreText = (local) => { const el = core && core.elements.find((e) => e.local === local); return el ? XmlAst.textContent(el).replace(/\s+/g, ' ').trim() : ''; };
        const images = {}, skipped = [];
        const ctx = { styles: st.styles, numbering: numbering, rels: docRels, raw: raw, images: images, skipped: skipped, notes: notes };
        const body = doc.elements.find((e) => isW(e, 'body'));
        if (!body) throw fail('not-docx', 'This Word document has no body.');
        const blocks = [];
        bodyBlocks(body, ctx, blocks);
        const merged = mergeCaptions(blocks);
        return { title: coreText('title'), creator: coreText('creator'), language: coreText('language') || st.language, blocks: merged, notes: notes, images: images, skipped: Array.from(new Set(skipped)) };
    }

    // Block content: paragraphs, tables, and the containers Word wraps them in.
    function bodyBlocks(container, ctx, out) {
        kids(container).forEach((el) => {
            if (isW(el, 'p')) { const b = paragraph(el, ctx); if (b) out.push(b); } else if (isW(el, 'tbl')) out.push(table(el, ctx));
            else if (isW(el, 'sdt')) { const c = kid(el, 'sdtContent'); if (c) bodyBlocks(c, ctx, out); } else if (isW(el, 'customXml') || isW(el, 'ins') || isW(el, 'moveTo')) bodyBlocks(el, ctx, out);
            else if (el.local === 'AlternateContent' && el.ns === MC) { const ch = kids(el).find((c) => c.local === 'Choice'); if (ch) bodyBlocks(ch, ctx, out); }
        });
    }

    function paragraph(p, ctx) {
        const pPr = kid(p, 'pPr');
        const styleEl = pPr && kid(pPr, 'pStyle');
        const styleId = styleEl ? wAttr(styleEl, 'val') : null;
        const name = styleId && ctx.styles[styleId] ? ctx.styles[styleId].name : (styleId || 'normal').toLowerCase();
        const outline = (pPr && kid(pPr, 'outlineLvl') ? wAttr(kid(pPr, 'outlineLvl'), 'val') : null) || inherited(ctx.styles, styleId, (s) => (s.pPr && kid(s.pPr, 'outlineLvl') ? wAttr(kid(s.pPr, 'outlineLvl'), 'val') : null));
        const numPr = (pPr && kid(pPr, 'numPr')) || inherited(ctx.styles, styleId, (s) => (s.pPr && kid(s.pPr, 'numPr')) || null);
        const runs = inline(p, ctx);
        const text = runs.text.replace(/\s+/g, ' ').trim();
        if (!text && !runs.images.length && !runs.notes) return null;
        const heading = /^heading ([1-9])$/.exec(name);
        const level = heading ? Number(heading[1]) : outline != null && /^[0-8]$/.test(outline) ? Number(outline) + 1 : 0;
        if (name === 'title') return { type: 'title', text: text };
        if (name === 'subtitle') return { type: 'subtitle', text: text };
        if (level) return { type: 'heading', level: Math.min(level, 6), html: runs.html, text: text };
        if (runs.images.length === 1 && !text) return { type: 'figure', image: runs.images[0].key, alt: runs.images[0].alt, caption: '' };
        if (name === 'caption') return { type: 'caption', html: runs.html, text: text };
        if (/^([*#~•·◆◇❧❦⁂§†‡=_\-–—]\s*){1,9}$/.test(text) && !runs.images.length) return { type: 'break' };
        if (numPr) {
            const idEl = kid(numPr, 'numId'), lvlEl = kid(numPr, 'ilvl');
            const numId = idEl ? wAttr(idEl, 'val') : null, ilvl = lvlEl ? wAttr(lvlEl, 'val') || '0' : '0';
            if (numId && numId !== '0' && ctx.numbering[numId]) return { type: 'item', level: Math.min(Number(ilvl) || 0, 8), ordered: !!ctx.numbering[numId][ilvl], html: runs.html };
        }
        if (/^(quote|intense quote|block text|block quotation|quotations)$/.test(name)) return { type: 'quote', html: runs.html };
        return { type: 'para', html: runs.html };
    }

    // A paragraph's (or cell's) inline content as XHTML: { html, text, images, notes }.
    function inline(container, ctx) {
        const segs = [];
        const state = { text: '', images: [], notes: 0 };
        walk(container, ctx, segs, state, null);
        // Adjacent runs with the same formatting share one set of tags.
        let html = '';
        let i = 0;
        while (i < segs.length) {
            let j = i, inner = '';
            while (j < segs.length && segs[j].fmt === segs[i].fmt && segs[j].href === segs[i].href) inner += segs[j++].html;
            const f = segs[i].fmt;
            if (f.indexOf('p') !== -1) inner = '<sup>' + inner + '</sup>';
            if (f.indexOf('d') !== -1) inner = '<sub>' + inner + '</sub>';
            if (f.indexOf('s') !== -1) inner = '<s>' + inner + '</s>';
            if (f.indexOf('c') !== -1) inner = '<span class="small-caps">' + inner + '</span>';
            if (f.indexOf('i') !== -1) inner = '<em>' + inner + '</em>';
            if (f.indexOf('b') !== -1) inner = '<strong>' + inner + '</strong>';
            if (segs[i].href) inner = '<a href="' + attr(segs[i].href) + '">' + inner + '</a>';
            html += inner;
            i = j;
        }
        return { html: html.replace(/^(\s|<br\/>)+|(\s|<br\/>)+$/g, ''), text: state.text, images: state.images, notes: state.notes };
    }

    function walk(el, ctx, segs, state, href) {
        kids(el).forEach((c) => {
            if (isW(c, 'r')) run(c, ctx, segs, state, href);
            else if (isW(c, 'hyperlink')) {
                const id = rAttr(c, 'id');
                const rel = id && ctx.rels[id];
                const target = rel && rel.external && SAFE_HREF.test(rel.target) ? rel.target : null;
                walk(c, ctx, segs, state, target || href);
            } else if (isW(c, 'ins') || isW(c, 'moveTo') || isW(c, 'smartTag') || isW(c, 'customXml') || isW(c, 'fldSimple') || isW(c, 'dir') || isW(c, 'bdo')) walk(c, ctx, segs, state, href);
            else if (isW(c, 'sdt')) { const content = kid(c, 'sdtContent'); if (content) walk(content, ctx, segs, state, href); } else if (c.local === 'AlternateContent' && c.ns === MC) { const ch = kids(c).find((x) => x.local === 'Choice'); if (ch) walk(ch, ctx, segs, state, href); }
        });
    }

    function runFormat(rPr, ctx) {
        let f = '';
        if (!rPr) return f;
        const st = kid(rPr, 'rStyle');
        const sname = st && ctx.styles[wAttr(st, 'val')] ? ctx.styles[wAttr(st, 'val')].name : '';
        if (on(kid(rPr, 'b')) || sname === 'strong') f += 'b';
        if (on(kid(rPr, 'i')) || sname === 'emphasis') f += 'i';
        if (on(kid(rPr, 'smallCaps'))) f += 'c';
        if (on(kid(rPr, 'strike')) || on(kid(rPr, 'dstrike'))) f += 's';
        const va = kid(rPr, 'vertAlign');
        if (va && wAttr(va, 'val') === 'superscript') f += 'p';
        if (va && wAttr(va, 'val') === 'subscript') f += 'd';
        return f;
    }

    function run(r, ctx, segs, state, href) {
        const fmt = runFormat(kid(r, 'rPr'), ctx);
        const push = (html) => segs.push({ html: html, fmt: fmt, href: href });
        kids(r).forEach((c) => {
            if (isW(c, 't')) { const t = XmlAst.textContent(c).replace(PRIVATE, ''); state.text += t; push(esc(t)); } else if (isW(c, 'tab')) { state.text += ' '; push(' '); } else if (isW(c, 'br') || isW(c, 'cr')) { if (['page', 'column'].indexOf(wAttr(c, 'type')) === -1) push('<br/>'); } else if (isW(c, 'noBreakHyphen')) { state.text += '‑'; push('‑'); } else if (isW(c, 'softHyphen')) push('­');
            else if (isW(c, 'footnoteReference') || isW(c, 'endnoteReference')) {
                const kind = c.local === 'footnoteReference' ? 'footnote' : 'endnote';
                const id = wAttr(c, 'id');
                if (id != null && ctx.notes[kind][id]) { state.notes++; segs.push({ html: NOTE_OPEN + kind + ':' + id + NOTE_CLOSE, fmt: '', href: null }); }
            } else if (isW(c, 'drawing') || isW(c, 'pict') || (c.local === 'AlternateContent' && c.ns === MC)) {
                const img = image(c, ctx);
                if (img) { state.images.push(img); segs.push({ html: '<img src="' + IMG_OPEN + img.key + IMG_CLOSE + '" alt="' + attr(img.alt) + '"/>', fmt: '', href: href }); }
            }
        });
    }

    // The first picture in a drawing (DrawingML a:blip, or VML v:imagedata), added to ctx.images by its part path.
    function image(el, ctx) {
        const all = [];
        const visit = (n) => { if (n.type !== 'element') return; all.push(n); if (n.local === 'Fallback' && n.ns === MC) return; (n.children || []).forEach(visit); };
        visit(el);
        const blip = all.find((n) => n.local === 'blip' && A.indexOf(n.ns) !== -1) || all.find((n) => n.local === 'imagedata' && n.ns === VML);
        if (!blip) return null;
        const id = rAttr(blip, 'embed') || rAttr(blip, 'id');
        const rel = id && ctx.rels[id];
        if (!rel || rel.external || !rel.target) { ctx.skipped.push('a linked image (only images inside the document are imported)'); return null; }
        const bytes = ctx.raw[rel.target];
        const kind = bytes ? sniff(bytes) : null;
        const name = rel.target.split('/').pop();
        if (!kind) { ctx.skipped.push(name + ' (only PNG, JPEG, and GIF images are imported)'); return null; }
        const docPr = all.find((n) => n.local === 'docPr' && WP.indexOf(n.ns) !== -1);
        const shape = all.find((n) => n.local === 'shape' && n.ns === VML);
        // Word marks a decorative image with an a16 decorative extension whose val is 1.
        const decorative = all.some((n) => n.local === 'decorative' && /^(1|true)$/.test(XmlAst.getAttr(n, 'val') || ''));
        const alt = decorative ? '' : String((docPr && (XmlAst.getAttr(docPr, 'descr') || XmlAst.getAttr(docPr, 'title'))) || (shape && XmlAst.getAttr(shape, 'alt')) || '').replace(PRIVATE, '').replace(/\s+/g, ' ').trim();
        if (!ctx.images[rel.target]) ctx.images[rel.target] = { bytes: bytes, ext: kind, name: name.replace(/\.[^.]*$/, '') + '.' + kind };
        return { key: rel.target, alt: alt };
    }

    function table(tbl, ctx) {
        const rows = kids(tbl).filter((r) => isW(r, 'tr')).map((tr) => {
            const trPr = kid(tr, 'trPr');
            const header = !!(trPr && on(kid(trPr, 'tblHeader')));
            return kids(tr).filter((c) => isW(c, 'tc')).map((tc) => {
                const tcPr = kid(tc, 'tcPr');
                const span = tcPr && kid(tcPr, 'gridSpan') ? Number(wAttr(kid(tcPr, 'gridSpan'), 'val')) || 1 : 1;
                const paras = kids(tc).filter((p) => isW(p, 'p')).map((p) => inline(p, ctx).html).filter(Boolean);
                return { header: header, colspan: Math.min(Math.max(span, 1), 100), html: paras.length === 1 ? paras[0] : paras.map((h) => '<p>' + h + '</p>').join('') };
            });
        }).filter((r) => r.length);
        return { type: 'table', rows: rows };
    }

    // A Caption paragraph right after a figure becomes its caption (as text, the form BookBlocks.figure takes).
    function mergeCaptions(blocks) {
        const out = [];
        blocks.forEach((b) => {
            const prev = out[out.length - 1];
            if (b.type === 'caption' && prev && prev.type === 'figure' && !prev.caption) prev.caption = b.text;
            else if (b.type === 'caption') out.push({ type: 'para', html: b.html });
            else out.push(b);
        });
        return out;
    }

    return { read: read, NOTE_OPEN: NOTE_OPEN, NOTE_CLOSE: NOTE_CLOSE, IMG_OPEN: IMG_OPEN, IMG_CLOSE: IMG_CLOSE };
}));

/*
 * Xhtml: checks XHTML content documents, fixes HTML named entities, and turns pasted HTML into XHTML (P1-06, D-017).
 *
 * check(text, { path }) returns { ast, problems } in Book's problem shape: XML well-formedness, the EPUB 3.3 §3.9
 * XML rules, the basic document shape, and §6.1.3 and §6.1.4 constraints. HTML content-model rules, alt text, and
 * headings belong to P5-04. fixEntities(text) returns splices that replace HTML 4 named entities, which XML does
 * not define, with the character or, for characters that cannot be seen, a numeric reference. normalize(node)
 * walks a DOM-like tree (in the app, the browser's own HTML parse of the pasted text) and writes an XHTML fragment
 * that keeps meaning and drops presentation.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./xml-ast.js'));
    else root.Xhtml = factory(root.XmlAst);
})(typeof self !== 'undefined' ? self : this, function (XmlAst) {
    'use strict';

    const NS = { xhtml: 'http://www.w3.org/1999/xhtml', epub: 'http://www.idpf.org/2007/ops', xinclude: 'http://www.w3.org/2001/XInclude' };

    // The HTML 4.01 character entity sets (Latin-1, symbols, special), 252 names, as name:code point.
    const ENTITY_TABLE = 'quot:34 amp:38 lt:60 gt:62 nbsp:160 iexcl:161 cent:162 pound:163 curren:164 yen:165 brvbar:166 sect:167 ' +
        'uml:168 copy:169 ordf:170 laquo:171 not:172 shy:173 reg:174 macr:175 deg:176 plusmn:177 sup2:178 sup3:179 ' +
        'acute:180 micro:181 para:182 middot:183 cedil:184 sup1:185 ordm:186 raquo:187 frac14:188 frac12:189 ' +
        'frac34:190 iquest:191 Agrave:192 Aacute:193 Acirc:194 Atilde:195 Auml:196 Aring:197 AElig:198 Ccedil:199 ' +
        'Egrave:200 Eacute:201 Ecirc:202 Euml:203 Igrave:204 Iacute:205 Icirc:206 Iuml:207 ETH:208 Ntilde:209 ' +
        'Ograve:210 Oacute:211 Ocirc:212 Otilde:213 Ouml:214 times:215 Oslash:216 Ugrave:217 Uacute:218 Ucirc:219 ' +
        'Uuml:220 Yacute:221 THORN:222 szlig:223 agrave:224 aacute:225 acirc:226 atilde:227 auml:228 aring:229 ' +
        'aelig:230 ccedil:231 egrave:232 eacute:233 ecirc:234 euml:235 igrave:236 iacute:237 icirc:238 iuml:239 ' +
        'eth:240 ntilde:241 ograve:242 oacute:243 ocirc:244 otilde:245 ouml:246 divide:247 oslash:248 ugrave:249 ' +
        'uacute:250 ucirc:251 uuml:252 yacute:253 thorn:254 yuml:255 OElig:338 oelig:339 Scaron:352 scaron:353 ' +
        'Yuml:376 fnof:402 circ:710 tilde:732 Alpha:913 Beta:914 Gamma:915 Delta:916 Epsilon:917 Zeta:918 Eta:919 ' +
        'Theta:920 Iota:921 Kappa:922 Lambda:923 Mu:924 Nu:925 Xi:926 Omicron:927 Pi:928 Rho:929 Sigma:931 Tau:932 ' +
        'Upsilon:933 Phi:934 Chi:935 Psi:936 Omega:937 alpha:945 beta:946 gamma:947 delta:948 epsilon:949 zeta:950 ' +
        'eta:951 theta:952 iota:953 kappa:954 lambda:955 mu:956 nu:957 xi:958 omicron:959 pi:960 rho:961 sigmaf:962 ' +
        'sigma:963 tau:964 upsilon:965 phi:966 chi:967 psi:968 omega:969 thetasym:977 upsih:978 piv:982 ensp:8194 ' +
        'emsp:8195 thinsp:8201 zwnj:8204 zwj:8205 lrm:8206 rlm:8207 ndash:8211 mdash:8212 lsquo:8216 rsquo:8217 ' +
        'sbquo:8218 ldquo:8220 rdquo:8221 bdquo:8222 dagger:8224 Dagger:8225 bull:8226 hellip:8230 permil:8240 ' +
        'prime:8242 Prime:8243 lsaquo:8249 rsaquo:8250 oline:8254 frasl:8260 euro:8364 image:8465 weierp:8472 ' +
        'real:8476 trade:8482 alefsym:8501 larr:8592 uarr:8593 rarr:8594 darr:8595 harr:8596 crarr:8629 lArr:8656 ' +
        'uArr:8657 rArr:8658 dArr:8659 hArr:8660 forall:8704 part:8706 exist:8707 empty:8709 nabla:8711 isin:8712 ' +
        'notin:8713 ni:8715 prod:8719 sum:8721 minus:8722 lowast:8727 radic:8730 prop:8733 infin:8734 ang:8736 ' +
        'and:8743 or:8744 cap:8745 cup:8746 int:8747 there4:8756 sim:8764 cong:8773 asymp:8776 ne:8800 equiv:8801 ' +
        'le:8804 ge:8805 sub:8834 sup:8835 nsub:8836 sube:8838 supe:8839 oplus:8853 otimes:8855 perp:8869 sdot:8901 ' +
        'lceil:8968 rceil:8969 lfloor:8970 rfloor:8971 lang:9001 rang:9002 loz:9674 spades:9824 clubs:9827 ' +
        'hearts:9829 diams:9830';
    const ENTITIES = Object.create(null);
    ENTITY_TABLE.split(' ').forEach((pair) => { const i = pair.indexOf(':'); ENTITIES[pair.slice(0, i)] = Number(pair.slice(i + 1)); });
    // XML 1.0 §4.6: these five are predefined, so they are never a problem.
    const PREDEFINED = { amp: true, lt: true, gt: true, quot: true, apos: true };
    // Characters that cannot be seen in the code editor: written as numeric references so they stay visible.
    const INVISIBLE = /[\u00A0\u00AD\u2000-\u200F\u2028-\u202F\u205F-\u2064\uFEFF]/;
    // HTML metadata content: EPUB 3.3 §6.1.3.1 forbids epub:type on it and on <head>.
    const METADATA = { base: true, link: true, meta: true, noscript: true, script: true, style: true, template: true, title: true };

    const collapse = (s) => String(s || '').replace(/[ \t\n\r\f]+/g, ' ').trim();

    // A character for text or an attribute: itself, or &#N; when invisible (D-017).
    function encodeChar(ch) {
        return INVISIBLE.test(ch) ? '&#' + ch.codePointAt(0) + ';' : ch;
    }

    /* ---------- check ---------- */

    function check(text, options) {
        const path = (options && options.path) || '';
        const ast = XmlAst.parse(String(text == null ? '' : text));
        const problems = [];
        const report = (severity, code, message, start, end) => problems.push({ severity: severity, code: code, message: message, path: path, start: start, end: end, line: XmlAst.position(ast, start).line });
        const at = (severity, code, message, node) => report(severity, code, message, node ? node.start : 0, node ? (node.openEnd || node.end) : 0);

        ast.errors.forEach((e) => {
            const name = e.code === 'undeclared-entity' ? ast.text.slice(e.start + 1, e.end - 1) : null;
            if (name && ENTITIES[name] !== undefined) {
                const ch = String.fromCodePoint(ENTITIES[name]);
                report('error', 'html-entity', '&' + name + '; is an HTML entity, which XML does not define; Fix writes ' + (INVISIBLE.test(ch) ? encodeChar(ch) : ch) + ' instead (XML 1.0 §4.1, EPUB 3.3 §6.1.2).', e.start, e.end);
            } else problems.push({ severity: 'error', code: 'xml-' + e.code, message: e.message, path: path, start: e.start, end: e.end, line: e.line });
        });
        // Undeclared entities leave the tree whole, so the other checks still run on it.
        if (!ast.wellFormed && !ast.errors.every((e) => e.code === 'undeclared-entity')) return { ast: ast, problems: problems };

        // EPUB 3.3 §3.9 allows UTF-8 or UTF-16 for XML, but HTML, which §6.1.2 makes chapters follow, allows only
        // UTF-8; EPUBCheck 5.4.0 agrees (HTM-058). Only the declared encoding can be seen in a decoded string.
        const enc = ast.xmlDecl && ast.xmlDecl.encoding;
        if (enc && !/^utf-8$/i.test(enc)) at('error', 'xhtml-encoding', 'The file declares encoding "' + enc + '"; an XHTML content document must be UTF-8 (EPUB 3.3 §6.1.2, HTML; EPUBCheck HTM-058).', ast.xmlDecl);
        // EPUB 3.3 §3.9 and Appendix B: no external identifier is allowed for XHTML; HTML's doctype is <!DOCTYPE html>.
        const dt = ast.doctype;
        if (dt) {
            if (dt.publicId != null || dt.systemId != null) at('error', 'doctype-external-id', 'The DOCTYPE names an external DTD; an XHTML content document may only use <!DOCTYPE html> (EPUB 3.3 §3.9, Appendix B).', dt);
            if (dt.name !== 'html') at('warning', 'doctype-name', 'The DOCTYPE must be <!DOCTYPE html>, not "' + dt.name + '" (EPUB 3.3 §6.1.2).', dt);
        }

        const html = ast.documentElement;
        const isX = (el, local) => el && el.type === 'element' && el.ns === NS.xhtml && el.local === local;
        if (!isX(html, 'html')) {
            at('error', 'xhtml-root', 'The root element must be <html> in the XHTML namespace, http://www.w3.org/1999/xhtml (EPUB 3.3 §6.1.2).', html);
        } else {
            // HTML: <html> holds <head> then <body>; <head> holds one <title>.
            const kids = XmlAst.elementChildren(html);
            const head = kids.find((el) => isX(el, 'head')), body = kids.find((el) => isX(el, 'body'));
            if (!head) at('error', 'xhtml-head-missing', '<html> has no <head> (EPUB 3.3 §6.1.2).', html);
            if (!body) at('error', 'xhtml-body-missing', '<html> has no <body> (EPUB 3.3 §6.1.2).', html);
            if (head && body && kids.indexOf(head) > kids.indexOf(body)) at('error', 'xhtml-order', '<head> must come before <body> (EPUB 3.3 §6.1.2).', head);
            if (head) {
                const titles = XmlAst.elementChildren(head).filter((el) => isX(el, 'title'));
                // HTML wants a <title> unless the title comes from elsewhere (here, the package); EPUBCheck 5.4.0 accepts
                // none, but rejects an empty one (RSC-005).
                if (!titles.length) at('warning', 'xhtml-title-missing', '<head> has no <title>; reading systems may show one (EPUB 3.3 §6.1.2).', head);
                else if (!collapse(XmlAst.textContent(titles[0]))) at('error', 'xhtml-title-empty', 'The <title> is empty (EPUB 3.3 §6.1.2; EPUBCheck RSC-005).', titles[0]);
                if (titles.length > 1) at('error', 'xhtml-title-repeated', '<head> has more than one <title> (EPUB 3.3 §6.1.2).', titles[1]);
            }
        }
        ast.elements.forEach((el) => {
            // EPUB 3.3 §3.9: no XInclude.
            if (el.ns === NS.xinclude) at('error', 'xinclude', 'XInclude is not allowed in EPUB (EPUB 3.3 §3.9).', el);
            if (el.ns !== NS.xhtml) return;
            if ((el.local === 'head' || METADATA[el.local]) && XmlAst.getAttr(el, 'type', NS.epub) != null) {
                at('error', 'epub-type-metadata', 'epub:type is not allowed on <' + el.local + '>, which is ' + (el.local === 'head' ? 'the head' : 'metadata content') + ' (EPUB 3.3 §6.1.3.1).', el);
            }
            if (el.local === 'base') at('warning', 'base-element', 'Avoid <base>: it can turn links inside the book into links to the web (EPUB 3.3 §6.1.4.3.1).', el);
            if (el.local === 'rp') at('warning', 'rp-element', 'Avoid <rp>: EPUB 3 reading systems understand ruby (EPUB 3.3 §6.1.4.3.2).', el);
        });
        return { ast: ast, problems: problems };
    }

    /* ---------- entity fixes ---------- */

    // Splices that replace HTML 4 named entities outside comments, CDATA, processing instructions, and the DOCTYPE.
    // Names the document declares itself are left alone. Works on files that are not well-formed.
    function fixEntities(text) {
        const s = String(text == null ? '' : text);
        const declared = new Set();
        const dt = /<!DOCTYPE[^[>]*\[([\s\S]*?)\]\s*>/.exec(s);
        if (dt) { const re = /<!ENTITY\s+([^\s%]+)/g; let m; while ((m = re.exec(dt[1]))) declared.add(m[1]); }
        const edits = [];
        const skip = /<!--[\s\S]*?(?:-->|$)|<!\[CDATA\[[\s\S]*?(?:\]\]>|$)|<\?[\s\S]*?(?:\?>|$)|<!DOCTYPE(?:[^[>]|\[[\s\S]*?\])*>?|&([A-Za-z][A-Za-z0-9]*);/g;
        let m;
        while ((m = skip.exec(s))) {
            const name = m[1];
            if (!name || PREDEFINED[name] || declared.has(name) || ENTITIES[name] === undefined) continue;
            edits.push({ start: m.index, end: m.index + m[0].length, text: encodeChar(String.fromCodePoint(ENTITIES[name])) });
        }
        return edits;
    }

    /* ---------- paste normaliser ---------- */

    // Kept as elements. Everything else is unwrapped (its content kept) or, in DROP, removed with its content.
    const KEEP = new Set(('p h1 h2 h3 h4 h5 h6 blockquote pre code em strong b i u s sub sup small mark abbr cite q dfn kbd samp var ' +
        'time br hr a img ul ol li dl dt dd table caption thead tbody tfoot tr th td colgroup col figure figcaption aside ' +
        'ruby rt bdi bdo wbr del ins').split(' '));
    const DROP = new Set(('script style noscript template head meta link title base iframe frame frameset object embed applet ' +
        'form input button select option optgroup textarea label fieldset legend svg math xml canvas audio video source track').split(' '));
    const VOID = new Set(['br', 'hr', 'img', 'col', 'wbr']);
    const BLOCK = new Set(('p h1 h2 h3 h4 h5 h6 blockquote pre ul ol li dl dt dd table caption thead tbody tfoot tr th td colgroup ' +
        'figure figcaption aside hr div section article header footer main nav address').split(' '));
    // Blocks that may stand empty; other inline elements and text blocks with no text are dropped.
    const KEEP_EMPTY = new Set(['td', 'th', 'col', 'colgroup', 'br', 'hr', 'img', 'wbr']);
    const GLOBAL_ATTRS = new Set(['id', 'lang', 'dir', 'title', 'role']);
    const ATTRS = {
        a: ['href'], img: ['src', 'alt'], td: ['colspan', 'rowspan', 'headers'], th: ['colspan', 'rowspan', 'headers', 'scope', 'abbr'],
        ol: ['start', 'reversed'], li: ['value'], q: ['cite'], blockquote: ['cite'], del: ['cite', 'datetime'], ins: ['cite', 'datetime'],
        time: ['datetime'], col: ['span'], colgroup: ['span']
    };
    const UNSAFE_URL = /^\s*(?:javascript|vbscript|data):/i;
    const REMOTE_URL = /^(?:[A-Za-z][A-Za-z0-9+.-]*:|\/\/)/;

    const nameOf = (n) => String(n.localName || n.nodeName || '').toLowerCase();
    const listOf = (x) => (x ? Array.prototype.slice.call(x) : []);

    function styleOf(n) {
        const style = n.getAttribute ? n.getAttribute('style') : (listOf(n.attributes).find((a) => a.name === 'style') || {}).value;
        const out = {};
        String(style || '').split(';').forEach((decl) => {
            const i = decl.indexOf(':');
            if (i !== -1) out[decl.slice(0, i).trim().toLowerCase()] = decl.slice(i + 1).trim().toLowerCase();
        });
        return out;
    }
    const isBold = (v) => v === 'bold' || v === 'bolder' || (/^\d+$/.test(v || '') && Number(v) >= 600);
    const isNotBold = (v) => v === 'normal' || v === 'lighter' || (/^\d+$/.test(v || '') && Number(v) < 600);

    // node: a DOM-like element or fragment (nodeType, localName or nodeName, attributes, childNodes, data).
    // Returns { xhtml, images: [{ src, alt, remote, data }], ids, dropped: { elementName: count } }.
    function normalize(node, options) {
        const o = options || {};
        const unit = o.indent == null ? '  ' : o.indent;
        const images = [], ids = [], dropped = {};
        const drop = (name) => { dropped[name] = (dropped[name] || 0) + 1; };

        // Builds a clean tree: { name, attrs: [[k, v]], kids: [] } or { text }.
        function clean(n, ctx) {
            if (n.nodeType === 3 || n.nodeType === 4) return [{ text: String(n.data != null ? n.data : n.nodeValue || '') }];
            if (n.nodeType === 9 || n.nodeType === 11) return kidsOf(n, ctx);
            if (n.nodeType !== 1) return [];
            let name = nameOf(n);
            // Word's Office elements (o:p and the like) hold only placeholder spaces.
            if (DROP.has(name) || name.startsWith('o:')) { drop(name); return []; }
            const st = styleOf(n);
            // Word marks the numbers and bullets it draws itself with mso-list:Ignore.
            if (st['mso-list'] === 'ignore') { drop('mso-list'); return []; }
            let inner = Object.assign({}, ctx);
            // Google Docs wraps a paste in <b style="font-weight:normal">; such b and i are only wrappers.
            if ((name === 'b' || name === 'strong') && isNotBold(st['font-weight'])) name = 'span';
            if ((name === 'i' || name === 'em') && st['font-style'] === 'normal') name = 'span';
            // No <b> inside bold text or <i> inside italic text: the outer one already says it.
            if ((name === 'b' && ctx.bold) || (name === 'i' && ctx.italic)) name = 'span';
            if (name === 'b' || name === 'strong') inner.bold = true;
            if (name === 'i' || name === 'em') inner.italic = true;
            if (name === 'pre') inner.pre = true;
            // Inline styles that carry bold or italic become <b> and <i> (D-017).
            const wraps = [];
            if (!inner.bold && isBold(st['font-weight'])) { wraps.push('b'); inner.bold = true; }
            if (!inner.italic && (st['font-style'] === 'italic' || st['font-style'] === 'oblique')) { wraps.push('i'); inner.italic = true; }
            let kids = kidsOf(n, inner);
            wraps.reverse().forEach((w) => { kids = [{ name: w, attrs: [], kids: kids }]; });
            if (!KEEP.has(name)) {
                // A layout <div> holding only inline content becomes a paragraph; any other wrapper is unwrapped.
                if ((name === 'div' || name === 'section' || name === 'article') && kids.length && !kids.some((k) => k.name && BLOCK.has(k.name))) return [{ name: 'p', attrs: [], kids: kids }];
                if (name !== 'span' && name !== 'font' && name.indexOf(':') === -1) drop(name);
                return kids;
            }
            const attrs = [];
            listOf(n.attributes).forEach((a) => {
                const k = String(a.name).toLowerCase(), v = String(a.value);
                const allowed = GLOBAL_ATTRS.has(k) || k.startsWith('aria-') || (ATTRS[name] || []).indexOf(k) !== -1;
                if (!allowed) return;
                if (k === 'id' && /^docs-internal-guid-/.test(v)) return;
                if ((k === 'href' || k === 'src' || k === 'cite') && UNSAFE_URL.test(v) && !(k === 'src' && /^\s*data:image\//i.test(v))) return;
                attrs.push([k, v]);
            });
            // A link left with no href or id (an unsafe URL was removed, or it never had one) becomes its text.
            if (name === 'a' && !attrs.some((a) => a[0] === 'href' || a[0] === 'id')) return kids;
            if (name === 'img') {
                const src = (attrs.find((a) => a[0] === 'src') || [])[1];
                if (src == null) { drop('img'); return []; }
                const alt = (attrs.find((a) => a[0] === 'alt') || [])[1];
                images.push({ src: src, alt: alt == null ? null : alt, remote: REMOTE_URL.test(src) && !/^data:/i.test(src), data: /^data:/i.test(src) });
            }
            attrs.forEach((a) => { if (a[0] === 'id') ids.push(a[1]); });
            return [{ name: name, attrs: attrs, kids: VOID.has(name) ? [] : kids }];
        }
        function kidsOf(n, ctx) {
            return listOf(n.childNodes).reduce((out, c) => out.concat(clean(c, ctx)), []);
        }

        // Content that shows: text other than spaces, or an image, rule, or cell. A line break alone is not content.
        const hasText = (t) => (t.text != null ? /\S/.test(t.text.replace(/\u00A0/g, ' ')) : (t.name !== 'br' && t.name !== 'wbr' && (KEEP_EMPTY.has(t.name) || t.kids.some(hasText))));
        // Drops empty inline elements and paragraphs (Word's spacing paragraphs), keeping anchors with an id.
        function prune(list) {
            return list.map((t) => (t.text != null ? t : Object.assign({}, t, { kids: prune(t.kids) }))).filter((t) => {
                if (t.text != null || KEEP_EMPTY.has(t.name)) return true;
                if (t.name === 'a' && t.attrs.some((a) => a[0] === 'id')) return true;
                return hasText(t);
            });
        }

        const escText = (s) => XmlAst.escapeText(s).replace(/[\s\S]/gu, encodeChar);
        const escAttr = (s) => XmlAst.escapeAttr(s, '"').replace(/[\s\S]/gu, encodeChar);
        const open = (t) => '<' + t.name + t.attrs.map((a) => ' ' + a[0] + '="' + escAttr(a[1]) + '"').join('') + (VOID.has(t.name) ? '/>' : '>');
        function inline(list, pre) {
            return list.map((t) => {
                if (t.text != null) return escText(pre ? t.text : t.text.replace(/[ \t\n\r\f]+/g, ' '));
                if (VOID.has(t.name)) return open(t);
                return open(t) + inline(t.kids, pre || t.name === 'pre') + '</' + t.name + '>';
            }).join('');
        }
        // Blocks go one per line; blocks inside blocks are indented. Inline runs between blocks become paragraphs.
        function blocks(list, ind) {
            const lines = [];
            let run = [];
            const flush = () => {
                const s = inline(run, false).trim();
                if (s && run.some(hasText)) lines.push(ind + '<p>' + s + '</p>');
                run = [];
            };
            list.forEach((t) => {
                if (t.name && BLOCK.has(t.name)) {
                    flush();
                    const hasBlocks = t.kids.some((k) => k.name && BLOCK.has(k.name));
                    if (VOID.has(t.name)) lines.push(ind + open(t));
                    else if (t.name === 'pre' || !hasBlocks) lines.push(ind + open(t) + inline(t.kids, t.name === 'pre').replace(t.name === 'pre' ? /$^/ : /^ +| +$/g, '') + '</' + t.name + '>');
                    else lines.push(ind + open(t), blocksIn(t, ind + unit), ind + '</' + t.name + '>');
                } else run.push(t);
            });
            flush();
            return lines.filter((l) => l !== '').join('\n');
        }
        // Inside list items, cells, and the like, inline runs stay as they are rather than becoming paragraphs.
        function blocksIn(t, ind) {
            if (t.name === 'li' || t.name === 'td' || t.name === 'th' || t.name === 'dd' || t.name === 'dt' || t.name === 'figcaption' || t.name === 'caption') {
                const lines = [];
                let run = [];
                const flush = () => { const s = inline(run, false).trim(); if (s) lines.push(ind + s); run = []; };
                t.kids.forEach((k) => { if (k.name && BLOCK.has(k.name)) { flush(); lines.push(blocks([k], ind)); } else run.push(k); });
                flush();
                return lines.join('\n');
            }
            return blocks(t.kids, ind);
        }

        // The node given is the container (a body or fragment); only what it holds is written.
        const tree = prune(node && node.nodeType === 1 ? kidsOf(node, {}) : clean(node, {}));
        return { xhtml: blocks(tree, ''), images: images, ids: ids, dropped: dropped };
    }

    // Parses HTML with the given DOMParser (the browser's by default) and normalises its body.
    function fromHtml(html, Parser) {
        const P = Parser || (typeof DOMParser !== 'undefined' ? DOMParser : null);
        if (!P) {
            const e = new Error('No HTML parser is available here; pass a DOMParser.');
            e.code = 'no-parser';
            throw e;
        }
        const doc = new P().parseFromString(String(html == null ? '' : html), 'text/html');
        return normalize(doc.body || doc);
    }

    return { NS: NS, ENTITIES: ENTITIES, check: check, fixEntities: fixEntities, normalize: normalize, fromHtml: fromHtml };
});

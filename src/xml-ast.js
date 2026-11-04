/*
 * XmlAst: a non-destructive XML 1.0 parser with namespaces, character offsets, and a splicer (P1-01, D-002).
 *
 * Offsets are JavaScript string indices into the text as given, never a reserialisation. parse() never throws:
 * a document that is not well-formed comes back with every error found (up to a limit), a best-effort tree,
 * and wellFormed: false. The edit builders return { start, end, text } splices and refuse a document that is
 * not well-formed. Rules cite XML 1.0 (Fifth Edition), Namespaces in XML 1.0 (Third Edition), and EPUB 3.3.
 *
 * Security (docs/SECURITY.md): no DTD is processed. The internal subset is scanned only for the names of
 * internal general entities, which are never expanded; external and parameter entities are reported as
 * errors and never fetched. ATTLIST defaults are ignored. Depth, size, attribute, and error counts are capped.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.XmlAst = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const NS_XML = 'http://www.w3.org/XML/1998/namespace';
    const NS_XMLNS = 'http://www.w3.org/2000/xmlns/';
    const LIMITS = { maxDepth: 256, maxLength: 16 * 1024 * 1024, maxAttributes: 1024, maxErrors: 100 };
    const PREDEFINED = { amp: '&', lt: '<', gt: '>', apos: "'", quot: '"' };

    // XML 1.0 §2.3 productions [4] NameStartChar and [4a] NameChar.
    const START = ':A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF' +
        '\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\u{10000}-\\u{EFFFF}';
    const CHARS = START + '\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040';
    const NAME_RE = new RegExp('[' + START + '][' + CHARS + ']*', 'uy');
    const NAME_FULL = new RegExp('^[' + START + '][' + CHARS + ']*$', 'u');
    // XML 1.0 §2.2 [2] Char: a valid surrogate pair is skipped; anything captured is outside Char.
    const BAD_CHAR = /[\uD800-\uDBFF][\uDC00-\uDFFF]|([\x00-\x08\x0B\x0C\x0E-\x1F￾￿\uD800-\uDFFF])/g;
    const REF_RE = /&(?:#x([0-9a-fA-F]+);|#([0-9]+);|([^\s&<>;"'=]+);)/y;
    const S_RE = /[ \t\r\n]*/y;
    // XML 1.0 §2.8 [23] to [26], §4.3.3 [80] and [81], §2.9 [32], applied to the text after '<?xml'.
    const XML_DECL = /^[ \t\r\n]+version[ \t\r\n]*=[ \t\r\n]*(?:"(1\.[0-9]+)"|'(1\.[0-9]+)')(?:[ \t\r\n]+encoding[ \t\r\n]*=[ \t\r\n]*(?:"([A-Za-z][A-Za-z0-9._-]*)"|'([A-Za-z][A-Za-z0-9._-]*)'))?(?:[ \t\r\n]+standalone[ \t\r\n]*=[ \t\r\n]*(?:"(yes|no)"|'(yes|no)'))?[ \t\r\n]*$/;

    const isSpace = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r';
    const isLegalChar = (cp) => cp === 0x9 || cp === 0xA || cp === 0xD || (cp >= 0x20 && cp <= 0xD7FF) ||
        (cp >= 0xE000 && cp <= 0xFFFD) || (cp >= 0x10000 && cp <= 0x10FFFF);

    function lineStarts(text) {
        const starts = [0];
        for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1);
        return starts;
    }

    function positionIn(starts, offset) {
        let lo = 0, hi = starts.length - 1;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (starts[mid] <= offset) lo = mid + 1;
            else hi = mid - 1;
        }
        const line = Math.max(0, hi);
        return { line: line, column: offset - starts[line] };
    }

    // Namespaces in XML 1.0 §4 [7] QName: zero or one colon, each part an NCName.
    function splitQName(name) {
        const i = name.indexOf(':');
        if (i === -1) return { prefix: null, local: name, ok: true };
        const prefix = name.slice(0, i), local = name.slice(i + 1);
        const ok = i > 0 && local.indexOf(':') === -1 && NAME_FULL.test(local) && local !== '';
        return { prefix: ok ? prefix : null, local: ok ? local : name, ok: ok };
    }

    function escapeText(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r/g, '&#13;');
    }

    // Literal tabs and line breaks in an attribute value become spaces (XML 1.0 §3.3.3), so they are written as references.
    function escapeAttr(value, quote) {
        const out = String(value == null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/\t/g, '&#9;').replace(/\n/g, '&#10;').replace(/\r/g, '&#13;');
        return quote === "'" ? out.replace(/'/g, '&apos;') : out.replace(/"/g, '&quot;');
    }

    function parse(input, options) {
        const opts = Object.assign({}, LIMITS, options || {});
        const text = String(input == null ? '' : input);
        const fragment = !!opts.fragment;
        const starts = lineStarts(text);
        const errors = [];
        const doc = { type: fragment ? 'fragment' : 'document', id: 'x-0', start: 0, end: text.length, children: [] };
        const ast = {
            text: text, root: doc, documentElement: null, elements: [], byId: { 'x-0': doc },
            errors: errors, wellFormed: true, xmlDecl: null, doctype: null, lineStarts: starts
        };
        const entities = { internal: Object.create(null), external: Object.create(null) };
        const rootScope = Object.create(null);
        rootScope.xml = NS_XML;
        rootScope.xmlns = NS_XMLNS;
        if (opts.namespaces) Object.keys(opts.namespaces).forEach((k) => { rootScope[k] = opts.namespaces[k]; });
        const stack = [];
        let fatal = false;
        let seq = 0;
        // XML 1.0 §4.3.3: a leading U+FEFF is an encoding signature, not part of the document.
        const bom = text.charCodeAt(0) === 0xFEFF ? 1 : 0;
        let pos = bom;

        function error(code, start, end, message) {
            if (fatal) return;
            if (errors.length >= opts.maxErrors) {
                const p = positionIn(starts, start);
                errors.push({ code: 'too-many-errors', message: 'More than ' + opts.maxErrors + ' errors; parsing stopped.', start: start, end: start, line: p.line, column: p.column });
                fatal = true;
                return;
            }
            const p = positionIn(starts, start);
            errors.push({ code: code, message: message, start: start, end: end == null ? start : end, line: p.line, column: p.column });
        }

        const parent = () => (stack.length ? stack[stack.length - 1] : doc);
        const scope = () => (stack.length ? stack[stack.length - 1].nsScope : rootScope);
        const add = (node) => { node.parentId = parent().id; parent().children.push(node); return node; };

        function skipSpace(p) { S_RE.lastIndex = p; S_RE.exec(text); return S_RE.lastIndex; }
        function nameAt(p) { NAME_RE.lastIndex = p; const m = NAME_RE.exec(text); return m ? m[0] : null; }

        // Decodes references and line ends (XML 1.0 §2.11, §3.3.3, §4.1, §4.6). Internal entities stay as written.
        function decode(raw, base, isAttr) {
            const re = isAttr ? /\r\n?|[\n\t]|&/g : /\r\n?|&/g;
            let out = '', last = 0, m;
            while ((m = re.exec(raw)) !== null) {
                out += raw.slice(last, m.index);
                last = re.lastIndex;
                if (m[0] !== '&') { out += isAttr ? ' ' : '\n'; continue; }
                REF_RE.lastIndex = m.index;
                const r = REF_RE.exec(raw);
                const at = base + m.index;
                if (r && r[3] && r[3][0] === '#') {
                    error('invalid-char-ref', at, at + r[0].length, r[0] + ' is not a valid character reference (XML 1.0 §4.1 [66]).');
                    out += r[0];
                    last = re.lastIndex = m.index + r[0].length;
                    continue;
                }
                if (!r || (r[3] && (!NAME_FULL.test(r[3]) || r[3].indexOf(':') !== -1))) {
                    error('bare-ampersand', at, at + 1, 'A literal & must be written &amp; (XML 1.0 §2.4).');
                    out += '&';
                    continue;
                }
                last = re.lastIndex = m.index + r[0].length;
                if (r[3]) {
                    const name = r[3];
                    if (PREDEFINED[name]) out += PREDEFINED[name];
                    else {
                        out += r[0];
                        if (entities.external[name]) error('external-entity-reference', at, at + r[0].length, '&' + name + '; refers to an external entity, which Scribe never loads (EPUB 3.3 §3.9).');
                        else if (!entities.internal[name]) {
                            error('undeclared-entity', at, at + r[0].length, '&' + name + '; is not defined in XML. Only &amp; &lt; &gt; &apos; &quot; and numeric references such as &#160; are (XML 1.0 §4.1, §4.6).');
                        }
                    }
                    continue;
                }
                const cp = r[1] ? parseInt(r[1], 16) : parseInt(r[2], 10);
                if (!isFinite(cp) || !isLegalChar(cp)) {
                    error('invalid-char-ref', at, at + r[0].length, r[0] + ' does not refer to a legal XML character (XML 1.0 §4.1, WFC: Legal Character).');
                    out += r[0];
                } else out += String.fromCodePoint(cp);
            }
            return out + raw.slice(last);
        }

        function checkChars() {
            BAD_CHAR.lastIndex = 0;
            let m;
            while (!fatal && (m = BAD_CHAR.exec(text)) !== null) {
                if (m[1] === undefined) continue;
                const hex = m[1].charCodeAt(0).toString(16).toUpperCase();
                error('invalid-char', m.index, m.index + 1, 'U+' + ('000' + hex).slice(-4) + ' is not allowed in an XML document (XML 1.0 §2.2).');
            }
        }

        function addText(s, e) {
            const raw = text.slice(s, e);
            if (!stack.length && !fragment) {
                const m = /[^ \t\r\n]/.exec(raw);
                if (m) error('text-outside-root', s + m.index, e, 'Text outside the root element (XML 1.0 §2.1, [1] document).');
            }
            const cd = raw.indexOf(']]>');
            if (cd !== -1) error('cdata-end-in-text', s + cd, s + cd + 3, ']]> may not appear in text; write ]]&gt; (XML 1.0 §2.4).');
            add({ type: 'text', start: s, end: e, value: decode(raw, s, false) });
        }

        function comment() {
            const close = text.indexOf('-->', pos + 4);
            const end = close === -1 ? text.length : close + 3;
            const body = text.slice(pos + 4, close === -1 ? text.length : close);
            if (close === -1) error('unterminated-comment', pos, text.length, 'This comment is never closed with -->.');
            const dd = body.indexOf('--');
            if (dd !== -1) error('double-hyphen-in-comment', pos + 4 + dd, pos + 6 + dd, '-- may not appear inside a comment (XML 1.0 §2.5).');
            else if (body.endsWith('-')) error('double-hyphen-in-comment', end - 4, end, 'A comment may not end with ---> (XML 1.0 §2.5).');
            add({ type: 'comment', start: pos, end: end, value: body });
            pos = end;
        }

        function cdata() {
            const close = text.indexOf(']]>', pos + 9);
            const end = close === -1 ? text.length : close + 3;
            if (close === -1) error('unterminated-cdata', pos, text.length, 'This CDATA section is never closed with ]]>.');
            if (!stack.length && !fragment) error('text-outside-root', pos, end, 'A CDATA section outside the root element (XML 1.0 §2.1).');
            add({ type: 'cdata', start: pos, end: end, value: text.slice(pos + 9, close === -1 ? text.length : close).replace(/\r\n?/g, '\n') });
            pos = end;
        }

        function pi() {
            const target = nameAt(pos + 2);
            const close = text.indexOf('?>', pos + 2);
            const end = close === -1 ? text.length : close + 2;
            if (close === -1) error('unterminated-pi', pos, text.length, 'This processing instruction is never closed with ?>.');
            const after = pos + 2 + (target ? target.length : 0);
            if (!target || (after !== close && !isSpace(text[after]))) {
                error('invalid-pi', pos, end, 'A processing instruction must start with a name (XML 1.0 §2.6).');
            } else if (target === 'xml') {
                const body = text.slice(pos + 5, close === -1 ? text.length : close);
                if (pos !== bom || fragment) error('misplaced-xml-declaration', pos, end, 'The XML declaration must be the very first thing in the file (XML 1.0 §2.8).');
                const m = XML_DECL.exec(body);
                if (!m) error('invalid-xml-declaration', pos, end, 'The XML declaration is malformed (XML 1.0 §2.8 [23]).');
                const node = add({
                    type: 'xmldecl', start: pos, end: end,
                    version: m ? (m[1] || m[2]) : null, encoding: m ? (m[3] || m[4] || null) : null, standalone: m ? (m[5] || m[6] || null) : null
                });
                if (pos === bom && !ast.xmlDecl) ast.xmlDecl = node;
                pos = end;
                return;
            } else if (/^xml$/i.test(target)) {
                error('invalid-pi', pos, end, 'The target "' + target + '" is reserved (XML 1.0 §2.6 [17]).');
            } else if (target.indexOf(':') !== -1) {
                error('invalid-pi', pos, end, 'A processing instruction target may not contain a colon (Namespaces in XML 1.0 §7).');
            }
            const data = text.slice(skipSpace(after), close === -1 ? text.length : close);
            add({ type: 'pi', start: pos, end: end, target: target, value: data });
            pos = end;
        }

        // Scans to the '>' ending a declaration, skipping quoted literals.
        function declEnd(p, stopAt) {
            while (p < text.length) {
                const c = text[p];
                if (c === '"' || c === "'") {
                    const q = text.indexOf(c, p + 1);
                    if (q === -1) return text.length;
                    p = q + 1;
                } else if (c === '>' || (stopAt && c === stopAt)) return p;
                else p++;
            }
            return text.length;
        }

        function literalAt(p) {
            const q = text[p];
            if (q !== '"' && q !== "'") return null;
            const close = text.indexOf(q, p + 1);
            return close === -1 ? null : { value: text.slice(p + 1, close), end: close + 1 };
        }

        // XML 1.0 §2.8 [28] to [29], §4.2 [70] to [76]; EPUB 3.3 §3.9 forbids external entity declarations.
        function internalSubset(p) {
            while (p < text.length) {
                p = skipSpace(p);
                const c = text[p];
                if (c === ']') return p;
                if (c === '%') {
                    const semi = text.indexOf(';', p);
                    const e = semi === -1 ? p + 1 : semi + 1;
                    error('parameter-entity', p, e, 'Parameter entities are not supported.');
                    p = e;
                } else if (text.startsWith('<!--', p)) {
                    const close = text.indexOf('-->', p + 4);
                    if (close === -1) { error('unterminated-comment', p, text.length, 'This comment is never closed with -->.'); return text.length; }
                    p = close + 3;
                } else if (text.startsWith('<?', p)) {
                    const close = text.indexOf('?>', p + 2);
                    if (close === -1) { error('unterminated-pi', p, text.length, 'This processing instruction is never closed with ?>.'); return text.length; }
                    p = close + 2;
                } else if (text.startsWith('<!ENTITY', p)) {
                    const e = declEnd(p + 8);
                    let q = skipSpace(p + 8);
                    if (text[q] === '%') {
                        error('parameter-entity', p, e + 1, 'Parameter entities are not supported.');
                    } else {
                        const name = nameAt(q);
                        q = name ? skipSpace(q + name.length) : q;
                        if (!name) error('invalid-doctype', p, e + 1, 'An entity declaration must name the entity (XML 1.0 §4.2 [71]).');
                        else if (literalAt(q)) entities.internal[name] = true;
                        else if (text.startsWith('SYSTEM', q) || text.startsWith('PUBLIC', q)) {
                            entities.external[name] = true;
                            error('external-entity', p, e + 1, 'The external entity "' + name + '" is not allowed in an EPUB and is never loaded (EPUB 3.3 §3.9).');
                        } else error('invalid-doctype', p, e + 1, 'The entity "' + name + '" has no value (XML 1.0 §4.2 [73]).');
                    }
                    p = e + 1;
                } else if (/^<!(?:ELEMENT|ATTLIST|NOTATION)[ \t\r\n]/.test(text.slice(p, p + 11))) {
                    p = declEnd(p) + 1;
                } else {
                    const e = declEnd(p, ']');
                    error('invalid-doctype', p, e, 'Unrecognised markup in the internal DTD subset (XML 1.0 §2.8 [29]).');
                    p = text[e] === ']' ? e : e + 1;
                }
            }
            return text.length;
        }

        function doctypeDecl() {
            const start = pos;
            const misplaced = fragment || ast.documentElement || stack.length || ast.doctype;
            let p = pos + 9;
            const bad = (at) => { error('invalid-doctype', start, at, 'The document type declaration is malformed (XML 1.0 §2.8 [28]).'); };
            const node = { type: 'doctype', start: start, end: 0, name: null, publicId: null, systemId: null, internalSubset: null, entities: [] };
            let ok = isSpace(text[p]);
            p = skipSpace(p);
            node.name = nameAt(p);
            if (!node.name) ok = false; else p += node.name.length;
            let q = skipSpace(p);
            if (ok && (text.startsWith('SYSTEM', q) || text.startsWith('PUBLIC', q))) {
                const pub = text.startsWith('PUBLIC', q);
                q = skipSpace(q + 6);
                const first = literalAt(q);
                if (!first) ok = false;
                else if (pub) {
                    node.publicId = first.value;
                    const second = literalAt(skipSpace(first.end));
                    if (!second) ok = false; else { node.systemId = second.value; q = second.end; }
                } else { node.systemId = first.value; q = first.end; }
                p = q;
                q = skipSpace(p);
            }
            if (ok && text[q] === '[') {
                const close = internalSubset(q + 1);
                node.internalSubset = { start: q + 1, end: close };
                node.entities = Object.keys(entities.internal);
                q = skipSpace(close + 1);
            }
            if (!ok || text[q] !== '>') {
                bad(q);
                q = declEnd(q);
            }
            node.end = pos = Math.min(text.length, q + 1);
            if (misplaced) error('misplaced-doctype', start, node.end, 'The document type declaration must come once, before the root element (XML 1.0 §2.8).');
            else ast.doctype = node;
            add(node);
        }

        function endTag() {
            const start = pos;
            const name = nameAt(pos + 2);
            let p = name ? skipSpace(pos + 2 + name.length) : pos + 2;
            if (!name || text[p] !== '>') {
                error('invalid-end-tag', start, p, 'An end tag must be </name> (XML 1.0 §3.1 [42]).');
                p = declEnd(p);
            }
            const end = pos = Math.min(text.length, p + 1);
            if (!name) return;
            let i = stack.length - 1;
            while (i >= 0 && stack[i].name !== name) i--;
            if (i < 0) {
                error('unexpected-end-tag', start, end, '</' + name + '> has no matching start tag (XML 1.0 §3, WFC: Element Type Match).');
                return;
            }
            while (stack.length - 1 > i) {
                const open = stack.pop();
                error('unclosed-element', open.start, open.openEnd, '<' + open.name + '> is not closed before </' + name + '> (XML 1.0 §3, WFC: Element Type Match).');
                open.closeStart = open.closeEnd = open.end = start;
                open.closed = false;
            }
            const el = stack.pop();
            el.closeStart = start;
            el.closeEnd = el.end = end;
        }

        function bindNamespaces(el) {
            let sc = scope();
            const own = () => { if (sc === scope()) sc = Object.create(sc); };
            el.attrs.forEach((a) => {
                if (a.name === 'xmlns') {
                    if (a.value === NS_XML || a.value === NS_XMLNS) error('reserved-namespace', a.start, a.end, 'The default namespace may not be the xml or xmlns namespace (Namespaces in XML 1.0 §3).');
                    own();
                    sc[''] = a.value;
                } else if (a.name.startsWith('xmlns:')) {
                    const prefix = a.name.slice(6);
                    if (prefix === 'xmlns' || (prefix === 'xml' && a.value !== NS_XML) || (prefix !== 'xml' && (a.value === NS_XML || a.value === NS_XMLNS))) {
                        error('reserved-prefix', a.start, a.end, 'The xml and xmlns prefixes and namespaces are reserved (Namespaces in XML 1.0 §3).');
                    } else if (a.value === '') {
                        error('empty-prefix-binding', a.start, a.end, 'A prefix may not be bound to an empty namespace (Namespaces in XML 1.0 §5, NSC: No Prefix Undeclaring).');
                    }
                    own();
                    sc[prefix] = a.value;
                }
            });
            Object.defineProperty(el, 'nsScope', { value: sc, enumerable: false });
            const resolve = (target, isAttr, at, end) => {
                const q = splitQName(target.name);
                if (!q.ok) error('invalid-qname', at, end, '"' + target.name + '" is not a valid qualified name (Namespaces in XML 1.0 §4).');
                target.prefix = q.prefix;
                target.local = q.local;
                if (isAttr && (target.name === 'xmlns' || q.prefix === 'xmlns')) { target.ns = NS_XMLNS; return; }
                if (!isAttr && q.prefix === 'xmlns') error('reserved-prefix', at, end, 'An element name may not use the xmlns prefix (Namespaces in XML 1.0 §3).');
                if (q.prefix) {
                    const uri = sc[q.prefix];
                    if (uri === undefined || uri === '') error('unbound-prefix', at, end, 'The prefix "' + q.prefix + '" is not declared (Namespaces in XML 1.0 §4).');
                    target.ns = uri || null;
                } else target.ns = isAttr ? null : (sc[''] || null);
            };
            resolve(el, false, el.start + 1, el.start + 1 + el.name.length);
            const seen = Object.create(null);
            el.attrs.forEach((a) => {
                resolve(a, true, a.start, a.nameEnd);
                const keys = ['q:' + a.name];
                if (a.ns && a.prefix) keys.push('e:{' + a.ns + '}' + a.local);
                if (keys.some((k) => seen[k])) {
                    error('duplicate-attribute', a.start, a.end, 'The attribute "' + a.name + '" appears twice on <' + el.name + '> (XML 1.0 §3.1, WFC: Unique Att Spec; Namespaces in XML 1.0 §6.3).');
                }
                keys.forEach((k) => { seen[k] = true; });
            });
        }

        function startTag() {
            const start = pos;
            const name = nameAt(pos + 1);
            if (!name) {
                error('invalid-lt', start, start + 1, 'A < in text must be written &lt; (XML 1.0 §2.4).');
                add({ type: 'text', start: start, end: start + 1, value: '<' });
                pos = start + 1;
                return;
            }
            let p = pos + 1 + name.length;
            const attrs = [];
            let selfClosing = false;
            for (;;) {
                const ws = p;
                p = skipSpace(p);
                const c = text[p];
                if (p >= text.length) { error('unterminated-start-tag', start, text.length, '<' + name + ' is never closed with >.'); break; }
                if (c === '>') { p++; break; }
                if (c === '/' && text[p + 1] === '>') { selfClosing = true; p += 2; break; }
                const an = nameAt(p);
                if (!an) {
                    const e = declEnd(p);
                    error('invalid-start-tag', p, e, 'Unexpected "' + c + '" in the tag <' + name + '> (XML 1.0 §3.1 [40]).');
                    selfClosing = text[e - 1] === '/';
                    p = Math.min(text.length, e + 1);
                    break;
                }
                if (p === ws) error('missing-space', p, p, 'Attributes must be separated by white space (XML 1.0 §3.1 [40]).');
                const a = { name: an, prefix: null, local: an, ns: null, value: '', raw: '', quote: null, start: p, nameEnd: p + an.length, valueStart: 0, valueEnd: 0, end: 0 };
                p = skipSpace(a.nameEnd);
                if (text[p] !== '=') {
                    error('attribute-without-value', a.start, a.nameEnd, 'The attribute "' + an + '" needs a quoted value (XML 1.0 §3.1 [41]).');
                    a.valueStart = a.valueEnd = a.end = a.nameEnd;
                } else {
                    p = skipSpace(p + 1);
                    const q = text[p];
                    if (q === '"' || q === "'") {
                        let close = text.indexOf(q, p + 1);
                        if (close === -1) { error('unterminated-attribute', a.start, text.length, 'The value of "' + an + '" is never closed.'); close = text.length; }
                        a.quote = q;
                        a.valueStart = p + 1;
                        a.valueEnd = close;
                        a.end = Math.min(text.length, close + 1);
                    } else {
                        error('unquoted-attribute', a.start, p, 'The value of "' + an + '" must be in quotes (XML 1.0 §2.3 [10]).');
                        const m = /(?:[^ \t\r\n/>]|\/(?!>))*/y;
                        m.lastIndex = p;
                        m.exec(text);
                        a.valueStart = p;
                        a.valueEnd = a.end = m.lastIndex;
                    }
                    a.raw = text.slice(a.valueStart, a.valueEnd);
                    const lt = a.raw.indexOf('<');
                    if (lt !== -1) error('lt-in-attribute', a.valueStart + lt, a.valueStart + lt + 1, 'A < in an attribute value must be written &lt; (XML 1.0 §2.3 [10]).');
                    a.value = decode(a.raw, a.valueStart, true);
                }
                p = a.end;
                attrs.push(a);
                if (attrs.length > opts.maxAttributes) {
                    error('attribute-limit', start, p, '<' + name + '> has more than ' + opts.maxAttributes + ' attributes; parsing stopped.');
                    fatal = true;
                    break;
                }
            }
            if (fatal) { pos = text.length; return; }
            if (stack.length >= opts.maxDepth) {
                error('depth-limit', start, p, 'Elements are nested more than ' + opts.maxDepth + ' deep; parsing stopped.');
                fatal = true;
                pos = text.length;
                return;
            }
            const el = {
                type: 'element', id: 'x-' + (++seq), parentId: null, name: name, prefix: null, local: name, ns: null,
                attrs: attrs, start: start, openEnd: p, closeStart: p, closeEnd: p, end: p,
                selfClosing: selfClosing, closed: true, line: positionIn(starts, start).line, depth: stack.length, children: []
            };
            if (!stack.length && !fragment) {
                if (ast.documentElement) error('multiple-roots', start, p, 'A document has exactly one root element (XML 1.0 §2.1).');
                else ast.documentElement = el;
            }
            bindNamespaces(el);
            add(el);
            ast.byId[el.id] = el;
            ast.elements.push(el);
            if (!selfClosing) stack.push(el);
            pos = p;
        }

        if (text.length > opts.maxLength) {
            error('size-limit', 0, 0, 'The file is larger than ' + opts.maxLength + ' characters; it was not parsed.');
            fatal = true;
        } else checkChars();

        while (pos < text.length && !fatal) {
            const lt = text.indexOf('<', pos);
            const textEnd = lt === -1 ? text.length : lt;
            if (textEnd > pos) addText(pos, textEnd);
            if (lt === -1) break;
            pos = lt;
            if (text.startsWith('<!--', pos)) comment();
            else if (text.startsWith('<![CDATA[', pos)) cdata();
            else if (text.startsWith('<!DOCTYPE', pos)) doctypeDecl();
            else if (text.startsWith('<?', pos)) pi();
            else if (text.startsWith('</', pos)) endTag();
            else if (text.startsWith('<!', pos)) {
                const e = declEnd(pos);
                if (/^<!doctype/i.test(text.slice(pos, pos + 9))) error('invalid-doctype', pos, e + 1, 'In XML the declaration must be written <!DOCTYPE, in capitals (XML 1.0 §2.8 [28]).');
                else error('invalid-markup', pos, e + 1, 'Unrecognised markup declaration (XML 1.0 §2.8).');
                pos = Math.min(text.length, e + 1);
            } else startTag();
        }
        while (stack.length) {
            const open = stack.pop();
            error('unclosed-element', open.start, open.openEnd, '<' + open.name + '> is never closed (XML 1.0 §3, WFC: Element Type Match).');
            open.closeStart = open.closeEnd = open.end = text.length;
            open.closed = false;
        }
        if (!fragment && !ast.documentElement && !fatal) error('no-root', bom, text.length, 'The document has no root element (XML 1.0 §2.1).');
        ast.wellFormed = errors.length === 0;
        return ast;
    }

    /* ---------- queries ---------- */

    const elementChildren = (node) => (node && node.children ? node.children.filter((c) => c.type === 'element') : []);
    const matches = (el, local, ns) => el.local === local && (ns === undefined || el.ns === (ns || null));

    function findAll(ast, local, ns) { return ast.elements.filter((el) => matches(el, local, ns)); }
    function find(ast, local, ns) { return ast.elements.find((el) => matches(el, local, ns)) || null; }

    function attrNode(el, local, ns) {
        const want = ns || null;
        return (el && el.attrs.find((a) => a.local === local && a.ns === want && a.ns !== NS_XMLNS)) || null;
    }

    function getAttr(el, local, ns) {
        const a = attrNode(el, local, ns);
        return a ? a.value : null;
    }

    function textContent(node) {
        if (!node) return '';
        if (node.type === 'text' || node.type === 'cdata') return node.value;
        if (!node.children) return '';
        return node.children.map(textContent).join('');
    }

    function lookupNamespace(el, prefix) {
        const uri = el && el.nsScope ? el.nsScope[prefix || ''] : undefined;
        return uri ? uri : null;
    }

    function nodeAtOffset(ast, offset) {
        let best = null;
        ast.elements.forEach((el) => {
            if (offset >= el.start && offset < el.end && (!best || el.depth > best.depth)) best = el;
        });
        return best;
    }

    const position = (ast, offset) => positionIn(ast.lineStarts, offset);

    /* ---------- edits ---------- */

    function editError(code, message) {
        const e = new Error(message);
        e.code = code;
        return e;
    }

    function requireElement(ast, el) {
        if (!ast || !ast.wellFormed) throw editError('not-well-formed', 'The document is not well-formed, so it cannot be edited by splicing.');
        if (!el || el.type !== 'element' || ast.byId[el.id] !== el) throw editError('unknown-node', 'The element does not belong to this parse.');
    }

    // Applies non-overlapping { start, end, text } edits. Insertions at one offset keep their given order.
    function applyEdits(text, edits) {
        const list = (edits || []).map((e, i) => ({ start: e.start, end: e.end, text: String(e.text == null ? '' : e.text), i: i }));
        list.sort((a, b) => a.start - b.start || a.end - b.end || a.i - b.i);
        let out = '', last = 0;
        list.forEach((e) => {
            if (!(e.start >= 0 && e.end >= e.start && e.end <= text.length)) throw new RangeError('Edit [' + e.start + ', ' + e.end + ') is outside the text.');
            if (e.start < last) throw new RangeError('Edits overlap at offset ' + e.start + '.');
            out += text.slice(last, e.start) + e.text;
            last = e.end;
        });
        return out + text.slice(last);
    }

    function setAttr(ast, el, qname, value) {
        requireElement(ast, el);
        const name = String(qname || '');
        const q = splitQName(name);
        if (!NAME_FULL.test(name) || !q.ok) throw editError('invalid-name', '"' + name + '" is not a valid attribute name.');
        const isDecl = name === 'xmlns' || q.prefix === 'xmlns';
        let ns = null;
        if (q.prefix && !isDecl) {
            ns = lookupNamespace(el, q.prefix);
            if (!ns) throw editError('unbound-prefix', 'The prefix "' + q.prefix + '" is not declared on or above <' + el.name + '>.');
        }
        const existing = el.attrs.find((a) => (isDecl ? a.name === name : a.ns === ns && a.local === q.local && a.ns !== NS_XMLNS));
        if (existing) return [{ start: existing.valueStart, end: existing.valueEnd, text: escapeAttr(value, existing.quote) }];
        const at = el.attrs.length ? el.attrs[el.attrs.length - 1].end : el.start + 1 + el.name.length;
        return [{ start: at, end: at, text: ' ' + name + '="' + escapeAttr(value, '"') + '"' }];
    }

    function removeAttr(ast, el, qname) {
        requireElement(ast, el);
        const name = String(qname || '');
        const q = splitQName(name);
        const isDecl = name === 'xmlns' || q.prefix === 'xmlns';
        const ns = q.prefix && !isDecl ? lookupNamespace(el, q.prefix) : null;
        const a = el.attrs.find((x) => (isDecl ? x.name === name : x.ns === ns && x.local === q.local && x.ns !== NS_XMLNS));
        if (!a) return [];
        let from = a.start;
        while (from > 0 && isSpace(ast.text[from - 1])) from--;
        return [{ start: from, end: a.end, text: '' }];
    }

    function setText(ast, el, value) {
        requireElement(ast, el);
        const body = escapeText(value);
        if (!el.selfClosing) return [{ start: el.openEnd, end: el.closeStart, text: body }];
        const open = ast.text.slice(el.start, el.openEnd - 2).replace(/[ \t\r\n]+$/, '');
        return [{ start: el.start, end: el.end, text: open + '>' + body + '</' + el.name + '>' }];
    }

    // The white space before offset on its line, or null when other text shares the line.
    function indentAt(text, offset) {
        const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
        const before = text.slice(lineStart, offset);
        return /^[ \t]*$/.test(before) ? before : null;
    }

    function indentUnit(ast) {
        for (let i = 0; i < ast.elements.length; i++) {
            const el = ast.elements[i];
            const own = indentAt(ast.text, el.start);
            const up = ast.byId[el.parentId];
            const outer = up && up.type === 'element' ? indentAt(ast.text, up.start) : null;
            if (own !== null && outer !== null && own.length > outer.length && own.startsWith(outer)) return own.slice(outer.length);
        }
        return '  ';
    }

    function remove(ast, node) {
        if (!ast || !ast.wellFormed) throw editError('not-well-formed', 'The document is not well-formed, so it cannot be edited by splicing.');
        if (!node || typeof node.start !== 'number' || node.type === 'document') throw editError('unknown-node', 'Nothing to remove.');
        if (node === ast.documentElement) throw editError('root-element', 'The root element cannot be removed.');
        const text = ast.text;
        let from = node.start, to = node.end;
        if (indentAt(text, from) !== null) {
            let after = to;
            while (text[after] === ' ' || text[after] === '\t') after++;
            const nl = text.startsWith('\r\n', after) ? 2 : (text[after] === '\n' ? 1 : (after === text.length ? 0 : -1));
            if (nl !== -1) { from = text.lastIndexOf('\n', from - 1) + 1; to = after + nl; }
        }
        return [{ start: from, end: to, text: '' }];
    }

    // position: 'before' | 'after' | 'prepend' | 'append'. The markup must leave the document well-formed.
    function insert(ast, ref, where, markup) {
        requireElement(ast, ref);
        const text = ast.text;
        const eol = text.indexOf('\r\n') !== -1 ? '\r\n' : '\n';
        const code = String(markup == null ? '' : markup).replace(/\r\n?|\n/g, '\n');
        const indent = indentAt(text, ref.start);
        const lay = (ind, s) => s.split('\n').join(eol + ind);
        let edit;
        if (where === 'before' || where === 'after') {
            if (ref === ast.documentElement) throw editError('root-element', 'Nothing can be inserted beside the root element.');
            if (where === 'before') edit = { start: ref.start, end: ref.start, text: indent === null ? code : lay(indent, code) + eol + indent };
            else edit = { start: ref.end, end: ref.end, text: indent === null ? code : eol + indent + lay(indent, code) };
        } else if (where === 'prepend' || where === 'append') {
            const kids = elementChildren(ref);
            const firstIndent = kids.length ? indentAt(text, kids[0].start) : null;
            const child = firstIndent !== null ? firstIndent : (indent || '') + indentUnit(ast);
            const content = ref.selfClosing ? '' : text.slice(ref.openEnd, ref.closeStart);
            const block = indent !== null && (/^[ \t\r\n]*$/.test(content) || /\n[ \t]*$/.test(content));
            if (ref.selfClosing) {
                const open = text.slice(ref.start, ref.openEnd - 2).replace(/[ \t\r\n]+$/, '') + '>';
                const inner = block ? eol + child + lay(child, code) + eol + indent : code;
                edit = { start: ref.start, end: ref.end, text: open + inner + '</' + ref.name + '>' };
            } else if (!block) {
                const at = where === 'prepend' ? ref.openEnd : ref.closeStart;
                edit = { start: at, end: at, text: code };
            } else if (/^[ \t\r\n]*$/.test(content) && content.indexOf('\n') === -1) {
                edit = { start: ref.openEnd, end: ref.closeStart, text: content.replace(/[ \t]+$/, '') + eol + child + lay(child, code) + eol + indent };
            } else if (where === 'prepend') {
                edit = { start: ref.openEnd, end: ref.openEnd, text: eol + child + lay(child, code) };
            } else {
                const tail = /[ \t]*$/.exec(content)[0].length;
                const at = ref.closeStart - tail;
                edit = { start: at, end: at, text: child + lay(child, code) + eol };
            }
        } else throw editError('invalid-position', 'Unknown position "' + where + '".');
        const check = parse(applyEdits(text, [edit]));
        if (!check.wellFormed) {
            const e = editError('would-break', 'Inserting this markup would make the document not well-formed: ' + check.errors[0].message);
            e.errors = check.errors;
            throw e;
        }
        return [edit];
    }

    return {
        NS_XML: NS_XML,
        NS_XMLNS: NS_XMLNS,
        LIMITS: LIMITS,
        parse: parse,
        position: position,
        elementChildren: elementChildren,
        find: find,
        findAll: findAll,
        attrNode: attrNode,
        getAttr: getAttr,
        textContent: textContent,
        lookupNamespace: lookupNamespace,
        nodeAtOffset: nodeAtOffset,
        applyEdits: applyEdits,
        setAttr: setAttr,
        removeAttr: removeAttr,
        setText: setText,
        insert: insert,
        remove: remove,
        escapeText: escapeText,
        escapeAttr: escapeAttr,
        splitQName: splitQName
    };
});

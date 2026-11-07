/*
 * BookRoles: the DPUB-ARIA role that matches each epub:type (P6-02, D-045). Pure, no DOM.
 *
 * Assistive technology reads role, not epub:type, so EPUB Accessibility Techniques 1.1 §4.3.1 recommends both. MAP is
 * the mapping DAISY Ace 1.4.6 checks (rule epub-type-has-matching-role, read from its source on 2026-11-06), less the
 * types whose role is implicit in their element (figure, list, table) or deprecated in DPUB-ARIA 1.1 (doc-endnote,
 * doc-biblioentry), which Ace also accepts. Inside the landmarks nav, epub:type names the target and needs no role.
 * HOSTS is where ARIA in HTML (W3C Recommendation) lets each role go; a type on another element, such as body, is
 * reported but not fixed, because the role would make the chapter invalid.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./xml-ast.js'));
    else root.BookRoles = factory(root.XmlAst);
}(typeof self !== 'undefined' ? self : this, function (XmlAst) {
    'use strict';

    const EPUB = 'http://www.idpf.org/2007/ops';
    const XHTML = 'http://www.w3.org/1999/xhtml';
    const MAP = {
        abstract: 'doc-abstract', acknowledgments: 'doc-acknowledgments', afterword: 'doc-afterword', appendix: 'doc-appendix', bibliography: 'doc-bibliography',
        biblioref: 'doc-biblioref', chapter: 'doc-chapter', colophon: 'doc-colophon', conclusion: 'doc-conclusion', credit: 'doc-credit', credits: 'doc-credits',
        dedication: 'doc-dedication', endnotes: 'doc-endnotes', epigraph: 'doc-epigraph', epilogue: 'doc-epilogue', errata: 'doc-errata', footnote: 'doc-footnote',
        foreword: 'doc-foreword', glossary: 'doc-glossary', glossdef: 'definition', glossref: 'doc-glossref', glossterm: 'term', help: 'doc-tip', index: 'doc-index',
        introduction: 'doc-introduction', 'list-item': 'listitem', noteref: 'doc-noteref', notice: 'doc-notice', 'page-list': 'doc-pagelist', pagebreak: 'doc-pagebreak',
        part: 'doc-part', preface: 'doc-preface', prologue: 'doc-prologue', pullquote: 'doc-pullquote', qna: 'doc-qna', referrer: 'doc-backlink', subtitle: 'doc-subtitle',
        'table-cell': 'cell', 'table-row': 'row', tip: 'doc-tip', toc: 'doc-toc'
    };
    // Elements that take any role (ARIA in HTML §4), and the roles the others allow.
    const ANY = { section: 1, div: 1, span: 1, p: 1, blockquote: 1, article: 1, dl: 1, dd: 1, dt: 1, ol: 1, ul: 1, table: 1, td: 1, th: 1, tr: 1 };
    const HOSTS = {
        aside: ['doc-dedication', 'doc-example', 'doc-footnote', 'doc-glossary', 'doc-pullquote', 'doc-tip'],
        nav: ['doc-index', 'doc-pagelist', 'doc-toc'],
        a: ['doc-backlink', 'doc-biblioref', 'doc-glossref', 'doc-noteref'],
        hr: ['doc-pagebreak'],
        h1: ['doc-subtitle'], h2: ['doc-subtitle'], h3: ['doc-subtitle'], h4: ['doc-subtitle'], h5: ['doc-subtitle'], h6: ['doc-subtitle'],
        li: ['doc-biblioentry', 'listitem'], header: [], footer: [], body: [], html: [], head: []
    };

    const tokens = (v) => String(v || '').split(/\s+/).filter(Boolean);
    const allowed = (local, role) => (ANY[local] ? true : (HOSTS[local] || []).indexOf(role) !== -1);

    // The role for the first mapped type in an epub:type value, or null.
    function roleFor(typeValue) {
        const t = tokens(typeValue).find((x) => Object.prototype.hasOwnProperty.call(MAP, x));
        return t ? MAP[t] : null;
    }

    // Elements whose epub:type maps to a role they do not have: { start, end, type, role, have, fixable, why }.
    function scan(text) {
        const ast = XmlAst.parse(text || '');
        if (!ast.wellFormed) return [];
        const byId = {};
        ast.elements.forEach((el) => { byId[el.id] = el; });
        const inLandmarks = (el) => {
            for (let p = byId[el.parentId]; p; p = byId[p.parentId]) if (p.local === 'nav' && tokens(XmlAst.getAttr(p, 'type', EPUB)).indexOf('landmarks') !== -1) return true;
            return false;
        };
        const out = [];
        ast.elements.forEach((el) => {
            if (el.ns !== XHTML) return;
            const typeValue = XmlAst.getAttr(el, 'type', EPUB);
            const role = roleFor(typeValue);
            if (!role || inLandmarks(el)) return;
            const have = tokens(XmlAst.getAttr(el, 'role'));
            if (have[0] === role) return;
            const type = tokens(typeValue).find((x) => MAP[x] === role);
            const entry = { start: el.start, end: el.openEnd, type: type, role: role, have: have.join(' ') || null, fixable: false, why: '' };
            if (have.length) entry.why = 'it already has role="' + have.join(' ') + '"';
            else if (!allowed(el.local, role)) entry.why = 'role="' + role + '" is not allowed on <' + el.local + '>';
            // EPUBCheck 5.4.0 reports RSC-005 for aria-label or aria-labelledby on a role="doc-toc" nav (observed on the P5-06 corpus).
            else if (role === 'doc-toc' && (XmlAst.getAttr(el, 'aria-label') != null || XmlAst.getAttr(el, 'aria-labelledby') != null)) entry.why = 'EPUBCheck refuses role="doc-toc" with aria-label or aria-labelledby';
            else entry.fixable = true;
            entry.node = el;
            entry.ast = ast;
            out.push(entry);
        });
        return out;
    }

    // Adds the missing roles a chapter can take: one splice per element, nothing else changes (D-002).
    function fix(text) {
        const found = scan(text).filter((f) => f.fixable);
        if (!found.length) return { text: text, count: 0 };
        const ast = found[0].ast;
        const edits = [].concat.apply([], found.map((f) => XmlAst.setAttr(ast, f.node, 'role', f.role)));
        return { text: XmlAst.applyEdits(text, edits), count: found.length };
    }

    // Problems-tab rows for the XHTML files in entries.
    function rows(entries, paths) {
        const out = [];
        (paths || Object.keys(entries).filter((p) => /\.x?html?$/i.test(p))).forEach((path) => {
            const text = entries[path];
            if (typeof text !== 'string') return;
            scan(text).forEach((f) => {
                const msg = 'epub:type="' + f.type + '" has no matching role, so screen readers do not hear it as a ' + f.type + '. ' + (f.fixable ? 'Add role="' + f.role + '"; Add matching roles does it for every chapter.' : 'Scribe cannot add role="' + f.role + '" here: ' + f.why + '.') + ' (EPUB Accessibility Techniques 1.1 §4.3.1; DAISY Ace epub-type-has-matching-role)';
                out.push({ file: path, start: f.start, end: f.end, line: text.slice(0, f.start).split('\n').length, code: 'role-missing', severity: 'warning', category: 'accessibility', message: msg, fixable: f.fixable });
            });
        });
        return out;
    }

    return { MAP: MAP, roleFor: roleFor, allowed: allowed, scan: scan, fix: fix, rows: rows };
}));

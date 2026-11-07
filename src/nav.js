/*
 * Nav: reads the EPUB navigation document and edits it by splicing (P1-05, D-016).
 *
 * Nav.read(files, bookModel) finds the nav through the Book model's manifest and returns { nav, problems }. The
 * nav model holds the toc, landmarks, page list, and other typed navs as entry trees, each with its XmlAst nodes.
 * Problems are EPUB 3.3 §7 rules, plus the rule that toc, landmarks, and page-list links reach a top-level content
 * document (§7.3, EPUBCheck RSC-011). Edit ops take a fresh nav model and return XmlAst edits for the nav file;
 * the caller applies them and reads again. Like OpfEdit (D-015), they refuse breakage and allow rule gaps.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./xml-ast.js'), require('./book.js'));
    else root.Nav = factory(root.XmlAst, root.Book);
})(typeof self !== 'undefined' ? self : this, function (XmlAst, Book) {
    'use strict';

    const NS = { xhtml: 'http://www.w3.org/1999/xhtml', epub: 'http://www.idpf.org/2007/ops' };
    const CONTENT_TYPES = { 'application/xhtml+xml': true, 'image/svg+xml': true };
    const HEADINGS = { h1: 1, h2: 1, h3: 1, h4: 1, h5: 1, h6: 1 };
    const LINKED = { toc: true, landmarks: true, 'page-list': true };

    const collapse = (s) => String(s || '').replace(/[ \t\n\r\f]+/g, ' ').trim();
    const tokens = (s) => collapse(s).split(' ').filter(Boolean);
    const isX = (el, local) => el && el.type === 'element' && el.ns === NS.xhtml && (!local || el.local === local);
    const significant = (el) => (el.children || []).filter((c) => c.type === 'element' || ((c.type === 'text' || c.type === 'cdata') && collapse(c.value) !== ''));

    function fail(code, message) {
        const e = new Error(message);
        e.code = code;
        return e;
    }

    // EPUB 3.3 §7.3: the label is the text content, counting alt and title of non-textual descendants.
    function labelText(el) {
        const walk = (n) => {
            if (n.type === 'text' || n.type === 'cdata') return n.value;
            if (n.type !== 'element') return '';
            if (n.local === 'img' || n.local === 'area') return ' ' + (XmlAst.getAttr(n, 'alt') || XmlAst.getAttr(n, 'title') || '') + ' ';
            const inner = (n.children || []).map(walk).join('');
            return collapse(inner) === '' && n !== el ? ' ' + (XmlAst.getAttr(n, 'title') || '') + ' ' : inner;
        };
        return collapse(walk(el)) || collapse(XmlAst.getAttr(el, 'title'));
    }

    // Paths of top-level content documents (EPUB 3.3 §7.3): spine items themselves (direct), or content documents
    // reached through a spine item's fallback chain (viaFallback).
    function topLevel(model) {
        const direct = new Set(), viaFallback = new Set();
        model.spine.itemrefs.forEach((r) => {
            const seen = new Set();
            for (let it = r.item; it && !seen.has(it); it = model.manifest.byId[it.fallback]) {
                seen.add(it);
                if (CONTENT_TYPES[it.mediaType] && it.path) { (it === r.item ? direct : viaFallback).add(it.path); break; }
            }
        });
        return { direct: direct, viaFallback: viaFallback };
    }

    function spineIndex(model) {
        const index = new Map();
        model.spine.itemrefs.forEach((r, i) => {
            const seen = new Set();
            for (let it = r.item; it && !seen.has(it); it = model.manifest.byId[it.fallback]) {
                seen.add(it);
                if (it.path && !index.has(it.path)) index.set(it.path, i);
            }
        });
        return index;
    }

    function read(files, model) {
        const problems = [];
        const item = model && model.nav;
        if (!item || !item.path || typeof (files || {})[item.path] !== 'string') return { nav: null, problems: problems };
        const path = item.path;
        const ast = XmlAst.parse(files[path]);
        const report = (severity, code, message, node) => problems.push({
            severity: severity, code: code, message: message, path: path,
            start: node ? node.start : 0, end: node ? (node.openEnd || node.end) : 0, line: node ? XmlAst.position(ast, node.start).line : 0
        });
        const err = (code, msg, node) => report('error', code, msg, node);
        ast.errors.forEach((e) => problems.push({ severity: 'error', code: 'xml-' + e.code, message: e.message, path: path, start: e.start, end: e.end, line: e.line }));
        if (!ast.wellFormed) return { nav: null, problems: problems };
        if (!isX(ast.documentElement, 'html')) {
            err('nav-not-xhtml', 'The navigation document\'s root must be an XHTML <html> element (EPUB 3.3 §7.2, §6.1.2).', ast.documentElement);
            return { nav: null, problems: problems };
        }

        const nav = { path: path, item: item, toc: null, landmarks: null, pageList: null, others: [], navs: [] };
        Object.defineProperty(nav, 'ast', { value: ast, enumerable: false });

        function entryOf(li, depth, parent, navObj) {
            const kids = significant(li);
            const first = kids[0];
            const entry = { label: '', kind: null, node: li, labelNode: null, href: null, target: null, types: [], list: null, children: [], depth: depth, parent: parent, nav: navObj };
            if (!isX(first, 'a') && !isX(first, 'span')) {
                err('nav-entry-label-missing', 'A nav <li> must start with one <a> or <span> (EPUB 3.3 §7.3).', li);
                return entry;
            }
            entry.kind = first.local;
            entry.labelNode = first;
            entry.label = labelText(first);
            if (!entry.label) err('nav-label-empty', 'A nav <' + first.local + '> needs a text label, or alt or title text for an image (EPUB 3.3 §7.3).', first);
            // Stricter than §7.3, which counts alt text: EPUBCheck 5.4.0 rejects a nav link with no text of its own (RSC-005).
            else if (first.local === 'a' && !collapse(XmlAst.textContent(first))) err('nav-label-no-text', 'EPUBCheck requires text inside a nav link, not only an image\'s alt text (EPUBCheck RSC-005).', first);
            if (entry.kind === 'a') {
                entry.href = XmlAst.getAttr(first, 'href');
                entry.types = tokens(XmlAst.getAttr(first, 'type', NS.epub));
                if (entry.href != null) {
                    const r = Book.resolveHref(path, entry.href);
                    let fragment = r.fragment;
                    try { fragment = fragment == null ? null : decodeURIComponent(fragment); } catch (e) { /* keep it as written */ }
                    entry.target = { path: r.path, fragment: fragment, remote: !!r.remote, outside: !!r.outside, invalid: !!r.invalid };
                }
            }
            const sub = kids[1];
            if (isX(sub, 'ol')) {
                entry.list = sub;
                entry.children = listOf(sub, depth + 1, entry, navObj);
            } else if (sub) err('nav-content', 'After its label, a nav <li> may hold only one <ol> (EPUB 3.3 §7.3).', sub.type === 'element' ? sub : li);
            if (kids.length > 2) err('nav-content', 'After its label, a nav <li> may hold only one <ol> (EPUB 3.3 §7.3).', kids[2].type === 'element' ? kids[2] : li);
            if (entry.kind === 'span' && !entry.list) err('nav-span-leaf', 'A nav <span> heading must be followed by a sublist (EPUB 3.3 §7.3).', first);
            return entry;
        }

        function listOf(ol, depth, parent, navObj) {
            const kids = significant(ol);
            const lis = kids.filter((k) => isX(k, 'li'));
            if (!lis.length) err('nav-list-empty', 'A nav <ol> needs at least one <li> (EPUB 3.3 §7.3).', ol);
            kids.filter((k) => !isX(k, 'li')).slice(0, 1).forEach((k) => err('nav-content', 'A nav <ol> may hold only <li> elements (EPUB 3.3 §7.3).', k.type === 'element' ? k : ol));
            return lis.map((li) => entryOf(li, depth, parent, navObj));
        }

        ast.elements.filter((el) => isX(el, 'nav') && XmlAst.getAttr(el, 'type', NS.epub) != null).forEach((el) => {
            const types = tokens(XmlAst.getAttr(el, 'type', NS.epub));
            const kind = types.indexOf('toc') !== -1 ? 'toc' : types.indexOf('landmarks') !== -1 ? 'landmarks' : types.indexOf('page-list') !== -1 ? 'page-list' : 'other';
            const navObj = { kind: kind, types: types, id: XmlAst.getAttr(el, 'id'), hidden: XmlAst.getAttr(el, 'hidden') != null, node: el, heading: null, list: null, entries: [] };
            // EPUB 3.3 §7.3: an optional h1 to h6, then exactly one ol, and nothing else.
            const kids = significant(el);
            let i = 0;
            if (kids[0] && kids[0].type === 'element' && kids[0].ns === NS.xhtml && HEADINGS[kids[0].local]) {
                navObj.heading = { node: kids[0], text: labelText(kids[0]) };
                i = 1;
            }
            // Stricter than §7.3, where the heading is optional: EPUBCheck 5.4.0 requires one first in other typed navs (RSC-005).
            if (kind === 'other' && !navObj.heading) err('nav-heading-missing', 'EPUBCheck requires a heading as the first child of a "' + types.join(' ') + '" nav (EPUBCheck RSC-005).', el);
            const ol = kids.find((k) => isX(k, 'ol'));
            if (!ol) err('nav-list-missing', 'A nav with epub:type needs one <ol> (EPUB 3.3 §7.3).', el);
            else {
                if (kids[i] !== ol || kids.length > i + 1) err('nav-content', 'A nav with epub:type holds only an optional heading and then one <ol> (EPUB 3.3 §7.3).', el);
                navObj.list = ol;
                navObj.entries = listOf(ol, 0, null, navObj);
            }
            nav.navs.push(navObj);
            if (kind === 'other') nav.others.push(navObj);
            else {
                const key = kind === 'page-list' ? 'pageList' : kind;
                if (nav[key]) err('nav-' + kind + '-multiple', 'There is more than one ' + kind + ' nav (EPUB 3.3 §7.4.' + ({ toc: 1, 'page-list': 3, landmarks: 4 }[kind]) + ').', el);
                else nav[key] = navObj;
            }
        });
        // EPUB 3.3 §7.2: exactly one toc nav.
        if (!nav.toc) err('nav-toc-missing', 'The navigation document has no <nav epub:type="toc"> (EPUB 3.3 §7.2).', ast.documentElement);

        const top = topLevel(model);
        nav.navs.forEach((n) => {
            const all = entries(n);
            const linked = LINKED[n.kind];
            all.filter((e) => e.kind === 'a').forEach((e) => {
                if (e.href == null) { if (linked) report('warning', 'nav-href-missing', 'A ' + n.kind + ' link has no href, so it goes nowhere (EPUB 3.3 §7.3).', e.labelNode); return; }
                const t = e.target;
                // EPUB 3.3 §7.3: toc, landmarks, and page-list links resolve to a top-level content document; other
                // navs MAY link outside the book. EPUBCheck 5.4.0 holds every internal nav link to the spine (RSC-011).
                if (t.remote) { if (linked) err('nav-link-remote', 'A ' + n.kind + ' link must stay inside the book: "' + e.href + '" (EPUB 3.3 §7.3).', e.labelNode); }
                else if (t.outside || t.invalid) err('nav-link-invalid', '"' + e.href + '" is not a valid link inside the book.', e.labelNode);
                else if (!model.manifest.items.some((it) => it.path === t.path)) err('nav-link-unknown', '"' + e.href + '" points at a file that is not in the manifest.', e.labelNode);
                else if (top.viaFallback.has(t.path) && !top.direct.has(t.path)) err('nav-link-fallback', '"' + e.href + '" is reached only through a spine item\'s fallback; EPUB 3.3 §7.3 allows that, but EPUBCheck wants the spine item itself (EPUBCheck RSC-011).', e.labelNode);
                else if (!top.direct.has(t.path)) err('nav-link-not-in-spine', '"' + e.href + '" must point at a document in the spine (' + (linked ? 'EPUB 3.3 §7.3; ' : '') + 'EPUBCheck RSC-011).', e.labelNode);
            });
            if (!linked) return;
            // EPUB 3.3 §7.4.3, §7.4.4: the page list and landmarks SHOULD have no sublists.
            if (n.kind !== 'toc' && all.some((e) => e.depth > 0)) report('warning', 'nav-nested', 'The ' + n.kind + ' nav should be a single flat list (EPUB 3.3 §7.4.' + (n.kind === 'landmarks' ? 4 : 3) + ').', n.node);
        });
        if (nav.landmarks) {
            const seen = {};
            entries(nav.landmarks).filter((e) => e.kind === 'a').forEach((e) => {
                // EPUB 3.3 §7.4.4: epub:type is required on landmark links, and no type repeats for one target.
                if (!e.types.length) { err('landmark-type-missing', 'A landmark link needs an epub:type (EPUB 3.3 §7.4.4).', e.labelNode); return; }
                const where = e.target ? (e.target.path || '') + '#' + (e.target.fragment || '') : e.href;
                e.types.forEach((type) => {
                    if (seen[type + ' ' + where]) err('landmark-repeated', 'Two "' + type + '" landmarks point at the same place (EPUB 3.3 §7.4.4).', e.labelNode);
                    seen[type + ' ' + where] = true;
                });
            });
        }
        // EPUB 3.3 §7.4.2: the toc SHOULD follow the spine order.
        if (nav.toc) {
            const order = spineIndex(model);
            let last = -1;
            const back = entries(nav.toc).find((e) => {
                const i = e.target && e.target.path != null && order.has(e.target.path) ? order.get(e.target.path) : -1;
                if (i === -1) return false;
                if (i < last) return true;
                last = i;
                return false;
            });
            if (back) report('warning', 'toc-order', '"' + back.label + '" comes before an earlier chapter in the reading order; the toc should follow the spine (EPUB 3.3 §7.4.2).', back.labelNode || back.node);
        }
        return { nav: nav, problems: problems };
    }

    // Every entry of a nav in document order.
    function entries(navObj) {
        const out = [];
        (function walk(list) { list.forEach((e) => { out.push(e); walk(e.children); }); })(navObj ? navObj.entries : []);
        return out;
    }

    // A plain tree of a nav's entries for replaceList. Labels become text; inline markup in labels is not kept.
    function toTree(navObj) {
        const conv = (e) => ({ label: e.label, href: e.href, types: e.types.slice(), children: e.children.map(conv) });
        return (navObj ? navObj.entries : []).map(conv);
    }

    /* ---------- edits ---------- */

    function astOf(nav) {
        if (!nav || !nav.ast || !nav.ast.wellFormed) throw fail('not-well-formed', 'There is no well-formed navigation document to edit; read it with Nav.read first.');
        return nav.ast;
    }

    function owned(nav, thing) {
        const ast = astOf(nav);
        if (!thing || !thing.node || ast.byId[thing.node.id] !== thing.node) throw fail('unknown-entry', 'The entry does not belong to this reading of the navigation document.');
        return ast;
    }

    const eolOf = (text) => (text.indexOf('\r\n') !== -1 ? '\r\n' : '\n');
    const lay = (code, ind, eol) => code.split('\n').join(eol + ind);
    function indentAt(text, offset) {
        const before = text.slice(text.lastIndexOf('\n', offset - 1) + 1, offset);
        return /^[ \t]*$/.test(before) ? before : null;
    }
    function indentUnit(ast) {
        for (let i = 0; i < ast.elements.length; i++) {
            const el = ast.elements[i], up = ast.byId[el.parentId];
            const own = indentAt(ast.text, el.start), outer = up && up.type === 'element' ? indentAt(ast.text, up.start) : null;
            if (own !== null && outer !== null && own.length > outer.length && own.startsWith(outer)) return own.slice(outer.length);
        }
        return '  ';
    }

    // The attribute name for epub:type in scope at el, or a declaration to add when no prefix is bound.
    function epubType(el) {
        const sc = el.nsScope;
        for (const k in sc) if (k !== '' && sc[k] === NS.epub) return { name: k + ':type', decl: '' };
        return { name: 'epub:type', decl: sc.epub === undefined ? ' xmlns:epub="' + NS.epub + '"' : null };
    }

    function hrefOf(nav, target) {
        const t = target || {};
        if (t.href != null) return String(t.href);
        const p = t.path;
        if (typeof p !== 'string' || p === '' || p.startsWith('/') || !p.split('/').every((s) => s && s !== '.' && s !== '..')) throw fail('invalid-path', '"' + p + '" is not a path inside the book.');
        return Book.hrefFor(nav.path, p) + (t.fragment ? '#' + encodeURIComponent(t.fragment) : '');
    }

    // One entry as markup relative to indent 0, with '\n' line ends: a leaf on one line, a branch as a block.
    function renderEntry(nav, scopeEl, it, unit) {
        const label = XmlAst.escapeText(collapse(it.label));
        const kids = it.children || [];
        let head;
        if (it.href != null || it.path != null) {
            const types = tokens(Array.isArray(it.types) ? it.types.join(' ') : it.types);
            let typeAttr = '';
            if (types.length) {
                const q = epubType(scopeEl);
                if (q.decl === null) throw fail('unbound-prefix', 'The epub prefix is bound to another namespace here.');
                typeAttr = ' ' + q.name + '="' + XmlAst.escapeAttr(types.join(' '), '"') + '"' + q.decl;
            }
            head = '<a' + typeAttr + ' href="' + XmlAst.escapeAttr(hrefOf(nav, it), '"') + '">' + label + '</a>';
        } else head = '<span>' + label + '</span>';
        if (!kids.length) return '<li>' + head + '</li>';
        return '<li>\n' + unit + head + '\n' + unit + renderList(nav, scopeEl, kids, unit).split('\n').join('\n' + unit) + '\n</li>';
    }

    function renderList(nav, scopeEl, items, unit) {
        return '<ol>\n' + items.map((it) => unit + renderEntry(nav, scopeEl, it, unit).split('\n').join('\n' + unit)).join('\n') + '\n</ol>';
    }

    function checked(ast, edits) {
        const check = XmlAst.parse(XmlAst.applyEdits(ast.text, edits));
        if (!check.wellFormed) {
            const e = fail('would-break', 'The edit would make the navigation document not well-formed: ' + check.errors[0].message);
            e.errors = check.errors;
            throw e;
        }
        return edits;
    }

    function setLabel(nav, entry, label) {
        const ast = owned(nav, entry);
        if (!entry.labelNode) throw fail('no-label', 'This entry has no <a> or <span> label to set.');
        return XmlAst.setText(ast, entry.labelNode, collapse(label));
    }

    // target: { path, fragment } inside the book, or { href } as written.
    function setHref(nav, entry, target) {
        const ast = owned(nav, entry);
        if (entry.kind !== 'a') throw fail('not-a-link', 'Only an <a> entry has an href; this one is a <span> heading.');
        return XmlAst.setAttr(ast, entry.labelNode, 'href', hrefOf(nav, target));
    }

    // where: 'before' | 'after' | 'child' of an entry, or 'append' to a nav object's top list.
    // item: { label, path, fragment, href, types, children }.
    function addEntry(nav, ref, where, item) {
        const ast = owned(nav, ref);
        const text = ast.text, eol = eolOf(text), unit = indentUnit(ast);
        // Prefixes in scope where the new <li> lands: beside ref, in its parent; otherwise inside its list.
        const scopeEl = where === 'before' || where === 'after' ? ast.byId[ref.node.parentId] : (where === 'append' && ref.list ? ref.list : ref.node);
        const code = renderEntry(nav, scopeEl, item || {}, unit);
        if (where === 'append') {
            if (!ref.list) throw fail('nav-list-missing', 'This nav has no <ol> to add to (EPUB 3.3 §7.3).');
            return XmlAst.insert(ast, ref.list, 'append', code);
        }
        if (where === 'before' || where === 'after') return XmlAst.insert(ast, ref.node, where, code);
        if (where !== 'child') throw fail('invalid-position', 'Unknown position "' + where + '".');
        if (ref.list) return XmlAst.insert(ast, ref.list, 'append', code);
        const li = ref.node, ind = indentAt(text, li.start);
        const inner = text.slice(li.openEnd, li.closeStart);
        if (ind === null) return checked(ast, [{ start: li.closeStart, end: li.closeStart, text: '<ol>' + code.replace(/\n[ \t]*/g, '') + '</ol>' }]);
        const sub = '<ol>\n' + unit + code.split('\n').join('\n' + unit) + '\n</ol>';
        if (/\n/.test(inner)) return XmlAst.insert(ast, li, 'append', sub);
        // An inline <li> becomes a block: its own open tag and label kept as written, then the new sublist.
        const block = text.slice(li.start, li.openEnd) + '\n' + unit + inner.trim() + '\n' + unit + sub.split('\n').join('\n' + unit) + '\n</' + li.name + '>';
        return checked(ast, [{ start: li.start, end: li.end, text: lay(block, ind, eol) }]);
    }

    // Removes an entry with its subtree; a sublist left empty goes too.
    function removeEntry(nav, entry) {
        const ast = owned(nav, entry);
        const siblings = entry.parent ? entry.parent.children : entry.nav.entries;
        if (entry.parent && siblings.length === 1) return XmlAst.remove(ast, entry.parent.list);
        return XmlAst.remove(ast, entry.node);
    }

    // Rewrites a nav's top <ol> from a tree (see toTree), in the file's indentation and line ends.
    function replaceList(nav, navObj, tree) {
        const ast = owned(nav, navObj);
        if (!navObj.list) throw fail('nav-list-missing', 'This nav has no <ol> to replace (EPUB 3.3 §7.3).');
        const ol = navObj.list, ind = indentAt(ast.text, ol.start), eol = eolOf(ast.text);
        const code = renderList(nav, navObj.node, tree || [], indentUnit(ast));
        return checked(ast, [{ start: ol.start, end: ol.end, text: ind === null ? code.replace(/\n[ \t]*/g, '') : lay(code, ind, eol) }]);
    }

    // Adds a hidden landmarks or page-list nav after the last typed nav (EPUB 3.3 §7.5), or at the end of <body>.
    function addNav(nav, kind, tree) {
        const ast = astOf(nav);
        const body = XmlAst.elementChildren(ast.documentElement).find((el) => isX(el, 'body'));
        const last = nav.navs.length ? nav.navs[nav.navs.length - 1].node : null;
        // A sibling of the last nav sees its parent's prefixes, not the ones declared on that nav.
        const scopeEl = last ? ast.byId[last.parentId] : body;
        if (!scopeEl) throw fail('missing-body', 'The navigation document has no <body>.');
        const ids = new Set(ast.elements.map((el) => XmlAst.getAttr(el, 'id')).filter((v) => v != null));
        const q = epubType(scopeEl);
        if (q.decl === null) throw fail('unbound-prefix', 'The epub prefix is bound to another namespace here.');
        const unit = indentUnit(ast);
        // DPUB-ARIA: a page list is role="doc-pagelist" (P6-02); landmarks have no role.
        const open = '<nav ' + q.name + '="' + kind + '"' + q.decl + (kind === 'page-list' ? ' role="doc-pagelist"' : '') + (ids.has(kind) ? '' : ' id="' + kind + '"') + ' hidden="">';
        const code = open + '\n' + unit + renderList(nav, scopeEl, tree, unit).split('\n').join('\n' + unit) + '\n</nav>';
        return last ? XmlAst.insert(ast, last, 'after', code) : XmlAst.insert(ast, body, 'append', code);
    }

    // Points the first landmark of a type at a target, adding the entry (and the landmarks nav) if needed.
    function setLandmark(nav, type, target, label) {
        astOf(nav);
        if (typeof type !== 'string' || !/^\S+$/.test(type)) throw fail('invalid-type', '"' + type + '" is not a structural semantics term.');
        const text = collapse(label) || type;
        const lm = nav.landmarks;
        const found = lm && entries(lm).find((e) => e.kind === 'a' && e.types.indexOf(type) !== -1);
        if (found) return setHref(nav, found, target).concat(XmlAst.setText(nav.ast, found.labelNode, text));
        const item = Object.assign({}, target, { label: text, types: [type], children: [] });
        return lm ? addEntry(nav, lm, 'append', item) : addNav(nav, 'landmarks', [item]);
    }

    // Removes every landmark of a type; the landmarks nav goes when nothing would be left in it.
    function removeLandmark(nav, type) {
        const ast = astOf(nav);
        const lm = nav.landmarks;
        const hit = lm ? entries(lm).filter((e) => e.types.indexOf(type) !== -1) : [];
        if (!hit.length) return [];
        if (hit.length === entries(lm).length) return XmlAst.remove(ast, lm.node);
        return hit.reduce((edits, e) => edits.concat(XmlAst.remove(ast, e.node)), []);
    }

    // pages: [{ label, path, fragment }]. Replaces the page list, or adds one.
    function setPageList(nav, pages) {
        astOf(nav);
        const tree = (pages || []).map((p) => Object.assign({}, p, { children: [] }));
        return nav.pageList ? replaceList(nav, nav.pageList, tree) : addNav(nav, 'page-list', tree);
    }

    function removeNav(nav, navObj) {
        const ast = owned(nav, navObj);
        if (navObj.kind === 'toc') throw fail('nav-toc-required', 'The toc nav is required and cannot be removed (EPUB 3.3 §7.2).');
        return XmlAst.remove(ast, navObj.node);
    }

    return {
        NS: NS,
        read: read,
        entries: entries,
        toTree: toTree,
        setLabel: setLabel,
        setHref: setHref,
        addEntry: addEntry,
        removeEntry: removeEntry,
        replaceList: replaceList,
        setLandmark: setLandmark,
        removeLandmark: removeLandmark,
        setPageList: setPageList,
        removeNav: removeNav
    };
});

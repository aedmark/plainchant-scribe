/*
 * BookNcx: the EPUB 2 table of contents, toc.ncx, kept as a fallback for older reading systems (P7-04, D-049).
 *
 * EPUB 3.3 §5.9.5 lets a book carry an NCX (OPF 2.0.1 §2.4.1, ANSI/NISO Z39.86-2005) for EPUB 2 readers; EPUB 3
 * readers ignore it. Scribe's own NCX is marked with <meta name="plainchant-scribe:generated"> and is a whole-file
 * product of the nav: refresh() rewrites it from the toc and page-list navs, so it cannot drift. An NCX that came
 * with an imported book is left as written and only checked, until the author regenerates it.
 *
 * The checks are the ones EPUBCheck 5.4.0 applies to an NCX: its schema (ncx.rng, ncx.sch: playOrder starts at 1,
 * has no gaps, and is shared exactly by entries with the same src; ids and page value/type pairs are unique), and
 * NCXChecker (dtb:uid matches the package's unique identifier, NCX-001; links reach files, RSC-007, listed in the
 * manifest, RSC-008, and ids, RSC-012).
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./xml-ast.js'), require('./book.js'), require('./nav.js'), require('./opf-edit.js'));
    else root.BookNcx = factory(root.XmlAst, root.Book, root.Nav, root.OpfEdit);
})(typeof self !== 'undefined' ? self : this, function (XmlAst, Book, Nav, OpfEdit) {
    'use strict';

    const NS = 'http://www.daisy.org/z3986/2005/ncx/';
    const MEDIA_TYPE = 'application/x-dtbncx+xml';
    const MARK = 'plainchant-scribe:generated';

    const collapse = (s) => String(s || '').replace(/[ \t\n\r\f]+/g, ' ').trim();
    const esc = XmlAst.escapeText;
    const attr = (s) => XmlAst.escapeAttr(s, '"');
    const lineOf = (text, at) => text.slice(0, at).split('\n').length;
    const kids = (el, local) => XmlAst.elementChildren(el).filter((c) => c.ns === NS && (!local || c.local === local));
    const decode = (s) => { try { return decodeURIComponent(s); } catch (e) { return s; } };

    function fail(code, message) {
        const e = new Error(message);
        e.code = code;
        return e;
    }

    function readBook(entries, assets) {
        const model = Book.read(entries, { assets: assets || [] }).model;
        if (!model) throw fail('unreadable', 'content.opf cannot be read; fix it in the code editor first.');
        return model;
    }

    // The NCX the spine names: { item, path, text, owned }, or null.
    function locate(entries, model) {
        const item = model.legacy.ncx;
        if (!item || !item.path || typeof entries[item.path] !== 'string') return null;
        const text = entries[item.path];
        const ast = XmlAst.parse(text);
        const owned = ast.wellFormed && ast.elements.some((el) => el.ns === NS && el.local === 'meta' && XmlAst.getAttr(el, 'name') === MARK);
        return { item: item, path: item.path, text: text, owned: owned };
    }

    // { on, owned, path } for the Chapters tab's switch.
    function state(entries, assets) {
        const model = Book.read(entries, { assets: assets || [] }).model;
        const found = model ? locate(entries, model) : null;
        return { on: Boolean(found), owned: Boolean(found && found.owned), path: found ? found.path : null };
    }

    // Reading positions, so playOrder follows the reading order: spine index, then the offset of the fragment's id.
    function positions(entries, model) {
        const spine = new Map();
        model.spine.itemrefs.forEach((r, i) => { if (r.item && r.item.path && !spine.has(r.item.path)) spine.set(r.item.path, i); });
        const ids = new Map();
        const idsOf = (path) => {
            if (!ids.has(path)) {
                const m = new Map();
                if (typeof entries[path] === 'string') {
                    const ast = XmlAst.parse(entries[path]);
                    if (ast.wellFormed) ast.elements.forEach((el) => { const id = XmlAst.getAttr(el, 'id'); if (id != null && !m.has(id)) m.set(id, el.start); });
                }
                ids.set(path, m);
            }
            return ids.get(path);
        };
        return (target) => [spine.has(target.path) ? spine.get(target.path) : Infinity, target.fragment ? (idsOf(target.path).get(target.fragment) || 0) + 1 : 0];
    }

    // The NCX text Scribe writes for the book as it stands, or null when the toc nav has no links to list.
    function render(entries, model, ncxPath) {
        const nav = Nav.read(entries, model).nav;
        if (!nav || !nav.toc) return null;
        const src = (t) => Book.hrefFor(ncxPath, t.path) + (t.fragment ? '#' + encodeURIComponent(t.fragment).replace(/%2F/gi, '/') : '');
        const usable = (t) => t && t.path && !t.outside && !t.invalid;
        // A <span> heading in the nav has no link: its point goes to its first linked descendant.
        const firstTarget = (e) => (usable(e.target) ? e.target : e.children.map(firstTarget).find(Boolean) || null);
        const tree = (list, depth) => list.map((e) => {
            const t = firstTarget(e);
            return t ? { label: e.label, target: t, src: src(t), depth: depth, children: tree(e.children, depth + 1) } : null;
        }).filter(Boolean);
        const points = tree(nav.toc.entries, 1);
        if (!points.length) return null;
        const pages = nav.pageList ? Nav.entries(nav.pageList).filter((e) => usable(e.target)).map((e) => ({ label: e.label, target: e.target, src: src(e.target) })) : [];

        // ncx.sch: one playOrder per distinct src, starting at 1 with no gaps, in reading order.
        const pos = positions(entries, model);
        const all = [];
        (function flat(list) { list.forEach((p) => { all.push(p); flat(p.children); }); })(points);
        const bySrc = new Map();
        all.concat(pages).forEach((p) => { if (!bySrc.has(p.src)) bySrc.set(p.src, pos(p.target)); });
        const order = new Map();
        Array.from(bySrc.keys()).map((s, i) => [s, bySrc.get(s), i])
            .sort((a, b) => a[1][0] - b[1][0] || a[1][1] - b[1][1] || a[2] - b[2])
            .forEach((x, i) => order.set(x[0], i + 1));

        const md = model.metadata;
        const uid = md.uniqueIdentifier ? md.uniqueIdentifier.value : '';
        const depth = all.reduce((n, p) => Math.max(n, p.depth), 1);
        const numbers = pages.map((p) => (/^[0-9]+$/.test(collapse(p.label)) ? Number(collapse(p.label)) : null));
        const counts = new Map();
        numbers.forEach((n) => { if (n != null) counts.set(n, (counts.get(n) || 0) + 1); });
        const out = [];
        out.push('<?xml version="1.0" encoding="UTF-8"?>');
        out.push('<ncx xmlns="' + NS + '" version="2005-1"' + (md.language ? ' xml:lang="' + attr(md.language) + '"' : '') + '>');
        out.push('  <head>');
        out.push('    <meta name="dtb:uid" content="' + attr(uid) + '"/>');
        out.push('    <meta name="dtb:depth" content="' + depth + '"/>');
        out.push('    <meta name="dtb:totalPageCount" content="' + pages.length + '"/>');
        out.push('    <meta name="dtb:maxPageNumber" content="' + numbers.reduce((n, x) => Math.max(n, x || 0), 0) + '"/>');
        out.push('    <meta name="' + MARK + '" content="Rewritten from nav.xhtml; edit the contents there."/>');
        out.push('  </head>');
        out.push('  <docTitle><text>' + esc(md.title || '') + '</text></docTitle>');
        md.creators.forEach((c) => out.push('  <docAuthor><text>' + esc(c.value) + '</text></docAuthor>'));
        out.push('  <navMap>');
        let n = 0;
        (function emit(list, pad) {
            list.forEach((p) => {
                n++;
                out.push(pad + '<navPoint id="navpoint-' + n + '" playOrder="' + order.get(p.src) + '">');
                out.push(pad + '  <navLabel><text>' + esc(p.label) + '</text></navLabel>');
                out.push(pad + '  <content src="' + attr(p.src) + '"/>');
                emit(p.children, pad + '  ');
                out.push(pad + '</navPoint>');
            });
        })(points, '    ');
        out.push('  </navMap>');
        if (pages.length) {
            out.push('  <pageList>');
            out.push('    <navLabel><text>Pages</text></navLabel>');
            pages.forEach((p, i) => {
                // Z39.86-2005 §8.4.2: value is the page's number; ncx.sch: each value and type pair once. Roman
                // numerals are front matter, anything else special, and neither gets a value.
                const num = numbers[i];
                const type = num != null ? 'normal' : (/^[ivxlcdm]+$/i.test(collapse(p.label)) ? 'front' : 'special');
                const value = num != null && counts.get(num) === 1 ? ' value="' + num + '"' : '';
                out.push('    <pageTarget id="page-' + (i + 1) + '" type="' + type + '"' + value + ' playOrder="' + order.get(p.src) + '">');
                out.push('      <navLabel><text>' + esc(p.label) + '</text></navLabel>');
                out.push('      <content src="' + attr(p.src) + '"/>');
                out.push('    </pageTarget>');
            });
            out.push('  </pageList>');
        }
        out.push('</ncx>');
        return out.join('\n') + '\n';
    }

    // Adds toc.ncx beside the nav, its manifest item, and the spine's toc attribute.
    function enable(entries, assets) {
        const model = readBook(entries, assets);
        if (locate(entries, model)) throw fail('present', 'The book already has an NCX table of contents.');
        if (model.spine.toc != null) throw fail('toc-dangling', 'The spine names toc="' + model.spine.toc + '", which is not a file in the book. Fix content.opf first.');
        if (!model.nav || !model.nav.path) throw fail('no-nav', 'The book has no navigation document to build the NCX from.');
        const dir = model.nav.path.slice(0, model.nav.path.lastIndexOf('/') + 1);
        const taken = new Set(Object.keys(entries).concat(assets || []).concat(model.manifest.items.map((i) => i.path)).filter(Boolean).map((p) => p.toLowerCase()));
        let path = dir + 'toc.ncx';
        for (let k = 2; taken.has(path.toLowerCase()); k++) path = dir + 'toc-' + k + '.ncx';
        const text = render(entries, model, path);
        if (!text) throw fail('empty', 'The contents list no chapters yet. Generate the contents first.');
        const ids = new Set(model.ast.elements.map((el) => XmlAst.getAttr(el, 'id')).filter((x) => x != null));
        let id = 'ncx';
        for (let k = 2; ids.has(id); k++) id = 'ncx-' + k;
        let next = Object.assign({}, entries, { [path]: text });
        next[model.opfPath] = XmlAst.applyEdits(entries[model.opfPath], OpfEdit.addItem(model, { id: id, path: path, mediaType: MEDIA_TYPE }));
        const again = readBook(next, assets);
        next[model.opfPath] = XmlAst.applyEdits(next[model.opfPath], XmlAst.setAttr(again.ast, again.spine.node, 'toc', id));
        return { entries: next, path: path };
    }

    // Removes the NCX file, its manifest item, and the spine's toc attribute.
    function disable(entries, assets) {
        const model = readBook(entries, assets);
        const found = locate(entries, model);
        if (!found) return { entries: entries, removed: [] };
        const next = Object.assign({}, entries);
        next[model.opfPath] = XmlAst.applyEdits(entries[model.opfPath], OpfEdit.removeItem(model, found.item.id));
        delete next[found.path];
        return { entries: next, removed: [found.path] };
    }

    // Rewrites Scribe's NCX from the nav. adopt: also replace an NCX that came with the book. Returns the same
    // object when nothing changes, so callers can compare.
    function refresh(entries, assets, options) {
        const model = Book.read(entries, { assets: assets || [] }).model;
        const found = model ? locate(entries, model) : null;
        if (!found || (!found.owned && !(options && options.adopt))) return entries;
        const text = render(entries, model, found.path);
        if (!text || text === found.text) return entries;
        return Object.assign({}, entries, { [found.path]: text });
    }

    // The entries an NCX lists: { points: [{ label, src, target, depth, playOrder, node }], pages, uid, ast }.
    function read(text, path) {
        const ast = XmlAst.parse(text);
        if (!ast.wellFormed || !ast.documentElement || ast.documentElement.ns !== NS || ast.documentElement.local !== 'ncx') return { ast: ast, points: [], pages: [], uid: null, ok: false };
        const root = ast.documentElement;
        const label = (el) => { const l = kids(el, 'navLabel')[0]; const t = l && kids(l, 'text')[0]; return t ? collapse(XmlAst.textContent(t)) : ''; };
        const entry = (el, depth) => {
            const c = kids(el, 'content')[0];
            const src = c ? XmlAst.getAttr(c, 'src') : null;
            const r = src != null ? Book.resolveHref(path, src) : null;
            const target = r ? { path: r.path, fragment: r.fragment == null ? null : decode(r.fragment), remote: Boolean(r.remote), outside: Boolean(r.outside) } : null;
            return { label: label(el), src: src, target: target, depth: depth, playOrder: XmlAst.getAttr(el, 'playOrder'), id: XmlAst.getAttr(el, 'id'), node: el, content: c };
        };
        const points = [];
        const head = kids(root, 'head')[0];
        const uidEl = head ? kids(head, 'meta').find((m) => XmlAst.getAttr(m, 'name') === 'dtb:uid') : null;
        (function walk(parent, depth) { kids(parent, 'navPoint').forEach((p) => { points.push(entry(p, depth)); walk(p, depth + 1); }); })(kids(root, 'navMap')[0] || { children: [] }, 1);
        const list = kids(root, 'pageList')[0];
        const pages = list ? kids(list, 'pageTarget').map((p) => Object.assign(entry(p, 1), { type: XmlAst.getAttr(p, 'type'), value: XmlAst.getAttr(p, 'value') })) : [];
        return { ast: ast, points: points, pages: pages, uid: uidEl ? collapse(XmlAst.getAttr(uidEl, 'content')) : null, uidNode: uidEl, ok: true };
    }

    const sameList = (a, b) => a.length === b.length && a.every((x, i) => x.label === b[i].label && x.depth === b[i].depth && x.key === b[i].key);
    const keyOf = (t) => (t && t.path ? t.path + (t.fragment ? '#' + t.fragment : '') : '');

    // Problems rows for the NCX the spine names.
    function rows(entries, model) {
        if (!model || model.spine.toc == null) return [];
        const out = [];
        const item = model.legacy.ncx;
        const opf = entries[model.opfPath] || '';
        const row = (file, text, node, severity, category, code, message) => out.push({ file: file, start: node ? node.start : 0, end: node ? (node.openEnd || node.end) : 0, line: node ? lineOf(text, node.start) : 1, code: code, severity: severity, category: category, message: message });
        // OPF 2.0.1 §2.4.1, EPUBCheck OPF-050: the spine's toc names the NCX item, of the NCX media type.
        if (item && item.mediaType !== MEDIA_TYPE) row(model.opfPath, opf, item.node, 'error', 'package', 'ncx-media-type', 'The spine\'s toc names "' + item.id + '", which is ' + item.mediaType + ', not an NCX (' + MEDIA_TYPE + ') (OPF 2.0.1 §2.4.1, EPUBCheck OPF-050).');
        const found = locate(entries, model);
        if (!found) return out;
        const path = found.path, text = found.text;
        const ncx = read(text, path);
        if (!ncx.ok) {
            const e = ncx.ast.errors[0];
            out.push({ file: path, start: e ? e.start : 0, end: e ? e.end : 0, line: e ? e.line : 1, code: 'ncx-unreadable', severity: 'error', category: 'package', message: (e ? e.message + ' ' : '') + 'The NCX is not a well-formed <ncx> document (Z39.86-2005 §8.4.1), so EPUB 2 readers cannot show the contents.' });
            return out;
        }
        const pk = (sev, code, node, message) => row(path, text, node, sev, 'package', code, message);
        const uid = model.metadata.uniqueIdentifier ? model.metadata.uniqueIdentifier.value : null;
        if (ncx.uid == null) pk('warning', 'ncx-uid-missing', ncx.ast.documentElement, 'The NCX has no <meta name="dtb:uid">; it should hold the book\'s unique identifier (Z39.86-2005 §8.4.1).');
        else if (uid != null && ncx.uid !== uid) pk('error', 'ncx-uid', ncx.uidNode, 'The NCX\'s dtb:uid "' + ncx.uid + '" is not the book\'s unique identifier "' + uid + '" (EPUBCheck NCX-001).');
        if (!ncx.points.length) pk('error', 'ncx-empty', kids(ncx.ast.documentElement, 'navMap')[0] || ncx.ast.documentElement, 'The NCX\'s navMap needs at least one navPoint (Z39.86-2005 §8.4.3, EPUBCheck RSC-005).');

        // ncx.sch: ids unique; playOrder from 1 with no gaps; the same src always with the same playOrder, and back.
        const all = ncx.points.concat(ncx.pages);
        const seenIds = new Map();
        all.forEach((e) => { if (e.id == null) return; const k = collapse(e.id); if (seenIds.has(k)) pk('error', 'ncx-id-duplicate', e.node, 'The id "' + k + '" is used twice in the NCX (EPUBCheck RSC-005).'); else seenIds.set(k, true); });
        const ordered = all.filter((e) => e.playOrder != null);
        const nums = new Set(ordered.map((e) => Number(e.playOrder)));
        if (ordered.length && !nums.has(1)) pk('error', 'ncx-play-order', ordered[0].node, 'The NCX\'s first playOrder is not 1 (EPUBCheck RSC-005).');
        const gap = ordered.find((e) => Number(e.playOrder) > 1 && !nums.has(Number(e.playOrder) - 1));
        if (gap) pk('error', 'ncx-play-order', gap.node, 'The NCX\'s playOrder skips from below ' + gap.playOrder + ' (EPUBCheck RSC-005).');
        const bySrc = new Map(), byNum = new Map();
        ordered.filter((e) => e.src != null).forEach((e) => {
            const n = Number(e.playOrder);
            if (bySrc.has(e.src) && bySrc.get(e.src) !== n) pk('error', 'ncx-play-order', e.node, 'Two NCX entries go to "' + e.src + '" with different playOrder values (EPUBCheck RSC-005).');
            else if (byNum.has(n) && byNum.get(n) !== e.src) pk('error', 'ncx-play-order', e.node, 'Two NCX entries share playOrder ' + n + ' but go to different places (EPUBCheck RSC-005).');
            if (!bySrc.has(e.src)) bySrc.set(e.src, n);
            if (!byNum.has(n)) byNum.set(n, e.src);
        });
        const pairs = new Set();
        ncx.pages.filter((p) => p.value != null).forEach((p) => { const k = p.value + ' ' + p.type; if (pairs.has(k)) pk('error', 'ncx-page-value', p.node, 'Two NCX page targets are page ' + p.value + ' of type ' + p.type + ' (EPUBCheck RSC-005).'); pairs.add(k); });

        // NCXChecker: every content src reaches a file in the book (RSC-007) and an id in it (RSC-012).
        const docIds = new Map();
        const hasId = (p, id) => {
            if (!docIds.has(p)) { const a = XmlAst.parse(entries[p]); docIds.set(p, new Set(a.wellFormed ? a.elements.map((el) => XmlAst.getAttr(el, 'id')).filter((x) => x != null) : [])); }
            return docIds.get(p).has(id);
        };
        const known = new Set(model.manifest.items.map((i) => i.path).filter(Boolean));
        all.forEach((e) => {
            const at = e.content || e.node;
            if (!e.label) row(path, text, e.node, 'warning', 'package', 'ncx-label-empty', 'This NCX entry has no label text (EPUBCheck NCX-006).');
            if (!e.target) { row(path, text, at, 'error', 'links', 'ncx-link-missing', 'This NCX entry has no <content src> (Z39.86-2005 §8.4.3).'); return; }
            if (e.target.remote) { row(path, text, at, 'warning', 'links', 'ncx-link-remote', 'The NCX links outside the book to "' + e.src + '"; EPUB 2 readers open only the book\'s own files from the contents (OPF 2.0.1 §2.4.1).'); return; }
            if (!e.target.path || e.target.outside || typeof entries[e.target.path] !== 'string') { row(path, text, at, 'error', 'links', 'ncx-link-missing', 'The NCX links to "' + e.src + '", which is not a file in the book (EPUBCheck RSC-007).'); return; }
            if (!known.has(e.target.path)) { row(path, text, at, 'error', 'links', 'ncx-link-unlisted', 'The NCX links to "' + e.src + '", which content.opf does not list (EPUBCheck RSC-008).'); return; }
            if (e.target.fragment && !hasId(e.target.path, e.target.fragment)) row(path, text, at, 'error', 'links', 'ncx-link-fragment', 'The NCX links to "' + e.src + '", but ' + e.target.path.split('/').pop() + ' has no id "' + e.target.fragment + '" (EPUBCheck RSC-012).');
        });

        // Drift from the nav: Scribe's own NCX is rewritten at export; an imported one is only reported.
        const want = render(entries, model, path);
        if (found.owned) {
            if (want && want !== text) pk('info', 'ncx-rewritten', ncx.ast.documentElement, 'Scribe rewrites toc.ncx from the contents in nav.xhtml when you export or change the chapters, so edits made to it here are not kept.');
        } else if (want) {
            const mine = read(want, path);
            const flat = (list) => list.map((e) => ({ label: e.label, depth: e.depth, key: keyOf(e.target) }));
            if (!sameList(flat(mine.points), flat(ncx.points))) pk('warning', 'ncx-stale', ncx.ast.documentElement, 'The NCX that came with this book no longer matches the contents in nav.xhtml, so EPUB 2 readers show a different table of contents. Regenerate it in the Chapters tab.');
        }
        return out;
    }

    return { MEDIA_TYPE: MEDIA_TYPE, MARK: MARK, state: state, render: render, enable: enable, disable: disable, refresh: refresh, read: read, rows: rows };
});
